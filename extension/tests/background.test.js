// Runs the real service worker against a fake `chrome` API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../../server/src/handler.js';

const listeners = {};
const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
const storage = {};
const notifications = [];
let installed = [];
let storePages = {};
let badge = '';
const tabs = [];
let activeUrl = null;
let otherUrls = []; // tabs open in the background
let lastQuery = null;
let hasTabs = false;

globalThis.chrome = {
  runtime: { id: 'self', getURL: (p) => `chrome-extension://self/${p}`, onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('message') },
  management: {
    getAll: async () => installed,
    setEnabled: async (id, enabled) => { installed.find((e) => e.id === id).enabled = enabled; },
    onInstalled: on('extInstalled'),
    onUninstalled: on('extUninstalled'),
  },
  permissions: { contains: async () => hasTabs, onAdded: on('permAdded'), onRemoved: on('permRemoved') },
  storage: {
    local: {
      get: async (defaults) => structuredClone({ ...defaults, ...storage }),
      set: async (obj) => { Object.assign(storage, structuredClone(obj)); },
    },
  },
  alarms: { get: async () => null, create: () => {}, onAlarm: on('alarm') },
  action: { setBadgeText: async ({ text }) => { badge = text; }, setBadgeBackgroundColor: async () => {} },
  notifications: { create: (id, opts) => notifications.push(opts), onClicked: on('notifClick'), clear: () => {} },
  tabs: {
    create: ({ url }) => tabs.push(url),
    // activeUrl '' is a tab with no address, like devtools.
    query: async (q) => {
      lastQuery = q;
      const active = activeUrl == null ? [] : [{ url: activeUrl || undefined, active: true }];
      return [...active, ...otherUrls.map((url) => ({ url, active: false }))];
    },
    onUpdated: on('tabUpdated'),
    onRemoved: on('tabRemoved'),
  },
};

const page = (dev) => `<title>X - Chrome Web Store</title><li><div class="a">Developer</div><div><div class="b">${dev}<br>Street 1</div></div></li>`;
// The extension talks to the real server handler, which reads fake store pages.
const fakeStore = async (url) => {
  const id = /detail\/([^?]+)/.exec(url)[1];
  const html = storePages[id];
  return html ? new Response(html) : new Response('', { status: 404 });
};
const serverCalls = [];
globalThis.fetch = (url) => {
  serverCalls.push(url);
  return handleRequest(new Request(url), { fetchImpl: fakeStore });
};

await import('../src/background.js');

const [A, B, C, D, E, F] = 'abcdef'.split('').map((c) => c.repeat(32));
const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
// Waits for everything queued before it, on both queues. The fake APIs answer
// at once, so one turn of the event loop lets the site queue finish too.
const settle = async () => {
  await send({ type: 'markSeen' });
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const ext = (id, extra = {}) => ({
  id, name: `Ext ${id}`, version: '1.0', type: 'extension', enabled: true, installType: 'normal',
  updateUrl: 'https://clients2.google.com/service/update2/crx', permissions: ['storage'], hostPermissions: [], ...extra,
});

test('first install records a baseline without alerts', async () => {
  installed = [ext(A), ext(B), ext(C)];
  storePages = { [A]: page('Alice'), [B]: page('Bob'), [C]: page('Carol') };
  listeners.installed({ reason: 'install' });
  await send({ type: 'scan' });
  assert.deepEqual(storage.alerts ?? [], []);
  assert.equal(storage.storeInfo[A].developerName, 'Alice');
  assert.deepEqual(tabs, ['chrome-extension://self/src/welcome/welcome.html']);
});

test('an update does not open the welcome page again', async () => {
  listeners.installed({ reason: 'update' });
  await send({ type: 'scan' });
  assert.equal(tabs.length, 1);
});

test('an update that adds permissions raises alerts and a badge', async () => {
  installed[0] = ext(A, { version: '2.0', permissions: ['storage', 'cookies'], hostPermissions: ['<all_urls>'] });
  listeners.extInstalled(installed[0]);
  await send({ type: 'scan' });
  const types = storage.alerts.map((a) => a.type).sort();
  assert.deepEqual(types, ['new_hosts', 'new_permissions']);
  assert.equal(badge, '2');
  assert.equal(notifications.length, 1, 'only the high-severity alert notifies');
});

test('a new owner in the store is detected and can be trusted', async () => {
  storePages[B] = page('Shady Growth LLC');
  await send({ type: 'scan' });
  const alert = storage.alerts.find((a) => a.type === 'ownership_changed');
  assert.equal(alert.extId, B);
  assert.match(alert.detail, /"Bob" to "Shady Growth LLC"/);
  assert.equal(storage.storeInfo[B].ownershipChanged.to, 'Shady Growth LLC');

  await send({ type: 'trust', extId: B });
  assert.equal(storage.storeInfo[B].ownershipChanged, null);
});

test('removal from the store is reported', async () => {
  delete storePages[C];
  await send({ type: 'scan' });
  assert.ok(storage.alerts.some((a) => a.type === 'removed_from_store' && a.extId === C));
});

test('a store layout change does not mark everything as removed', async () => {
  installed = [ext(D), ext(E), ext(F)];
  storePages = { [D]: page('D'), [E]: page('E'), [F]: page('F') };
  await send({ type: 'scan' });
  const removals = () => storage.alerts.filter((a) => a.type === 'removed_from_store').length;
  const before = removals();
  storePages = {};
  await send({ type: 'scan' });
  assert.equal(removals(), before, 'no new removal alerts');
  assert.equal(storage.storeInfo[D].status, 'ok', 'keeps the last good store info');
});

test('markSeen clears the badge and dismiss removes an alert', async () => {
  await send({ type: 'markSeen' });
  assert.equal(badge, '');
  const count = storage.alerts.length;
  await send({ type: 'dismiss', id: storage.alerts[0].id });
  assert.equal(storage.alerts.length, count - 1);
});

test('keep off on these sites: off on the site, back on after leaving', async () => {
  installed = [ext(A, { mayDisable: true }), ext(B, { mayDisable: true })];
  activeUrl = 'https://login.mybank.com/start';
  hasTabs = false;
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  assert.equal(installed[0].enabled, true, 'does nothing without the tabs permission');

  hasTabs = true;
  listeners.permAdded({ permissions: ['tabs'] });
  await settle(); // waits for the queued check
  assert.equal(installed[0].enabled, false);
  assert.equal(installed[1].enabled, true, 'other extensions are untouched');
  assert.deepEqual(storage.pausedBySites, [A]);

  activeUrl = 'https://news.example.com/';
  listeners.tabUpdated(2, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true);
  assert.deepEqual(storage.pausedBySites, []);
});

test('keep off on these sites never turns on an extension the user turned off', async () => {
  installed = [ext(A, { mayDisable: true }), ext(B, { mayDisable: true, enabled: false })];
  await send({ type: 'setSites', extId: B, sites: ['mybank.com'] });
  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[1].enabled, false);
});

test('removing the last site turns the extension back on', async () => {
  installed = [ext(A, { mayDisable: true })];
  activeUrl = 'https://mybank.com/';
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  assert.equal(installed[0].enabled, false);
  await send({ type: 'setSites', extId: A, sites: [] });
  assert.equal(installed[0].enabled, true);
  assert.equal(storage.siteRules[A], undefined);
});


test('turning an extension back on by hand on the site keeps it on until leaving', async () => {
  installed = [ext(A, { mayDisable: true })];
  hasTabs = true;
  activeUrl = 'https://mybank.com/';
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  assert.equal(installed[0].enabled, false);

  installed[0].enabled = true; // by hand, from the popup or chrome://extensions
  activeUrl = 'https://mybank.com/accounts';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true, 'not turned off again on the same site');
  assert.deepEqual(storage.allowedBySites, [A]);
  assert.deepEqual(storage.pausedBySites, []);

  activeUrl = 'https://example.com/';
  listeners.tabUpdated(2, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true);
  assert.deepEqual(storage.allowedBySites, []);

  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, false, 'off again on the next visit');
});

test('a site left open in a background tab keeps the extension off', async () => {
  // A is off: mybank.com is open.
  assert.equal(installed[0].enabled, false);
  otherUrls = ['https://mybank.com/accounts'];
  activeUrl = 'https://example.com/'; // the user switched to another tab or window
  listeners.tabUpdated(2, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, false, 'the bank is still open behind');
  assert.deepEqual(lastQuery, {}, 'reads every tab in every window');

  activeUrl = ''; // a devtools window: no address to check
  listeners.tabUpdated(3, { url: 'devtools://x' });
  await settle();
  assert.equal(installed[0].enabled, false);

  otherUrls = []; // the bank tab is closed
  listeners.tabRemoved(4, { windowId: 1, isWindowClosing: false });
  await settle();
  assert.equal(installed[0].enabled, true);
  activeUrl = 'https://example.com/';
});

test('the check runs at startup for restored tabs', async () => {
  activeUrl = 'https://mybank.com/';
  listeners.startup();
  await settle();
  assert.equal(installed[0].enabled, false);
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true);
});

test('uninstalling an extension while it is paused forgets it', async () => {
  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.deepEqual(storage.pausedBySites, [A]);
  installed = [];
  listeners.extUninstalled(A);
  await settle();
  assert.deepEqual(storage.pausedBySites, []);
  assert.equal(storage.siteRules[A], undefined);
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(2, { url: activeUrl });
  await settle(); // nothing left to turn back on, and no error
  assert.deepEqual(storage.pausedBySites, []);
});

test('taking back the tabs permission turns paused extensions back on', async () => {
  installed = [ext(A, { mayDisable: true })];
  hasTabs = true;
  activeUrl = 'https://mybank.com/';
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  assert.equal(installed[0].enabled, false);
  hasTabs = false;
  listeners.permRemoved({ permissions: ['tabs'] });
  await settle();
  assert.equal(installed[0].enabled, true);
  assert.deepEqual(storage.pausedBySites, []);
  hasTabs = true;
  activeUrl = 'https://example.com/';
  await settle();
});

test('a slow store check does not delay keeping an extension off', async () => {
  installed = [ext(A, { mayDisable: true })];
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  let release;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise((resolve) => { release = () => resolve(new Response('{"results":{}}')); });
  const check = send({ type: 'scan' }); // stuck on the server
  await new Promise((resolve) => setTimeout(resolve, 0));
  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(installed[0].enabled, false, 'turned off while the store check still waits');
  release();
  await check;
  globalThis.fetch = realFetch;
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true);
});

test('which extensions are ours is saved before they are turned off', async () => {
  installed = [ext(A, { mayDisable: true })];
  const realSetEnabled = chrome.management.setEnabled;
  let savedFirst = null;
  chrome.management.setEnabled = async (id, enabled) => {
    if (!enabled) savedFirst = storage.pausedBySites.includes(id);
    return realSetEnabled(id, enabled);
  };
  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  chrome.management.setEnabled = realSetEnabled;
  assert.equal(savedFirst, true);
  assert.equal(installed[0].enabled, false);
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(1, { url: activeUrl });
  await settle();
  assert.equal(installed[0].enabled, true);
});

const pageWithContact =(dev, site, email) => `<title>X - Chrome Web Store</title><li><div class="a">Developer</div><div><div class="b">${dev}<br>Street 1</div><a href="https://${site}/">Website</a><details>${email}</details></div></li>`;
const clearStorage = () => { for (const key of Object.keys(storage)) delete storage[key]; };

test('two alerts made at once get different ids', async () => {
  installed = [ext(A)];
  storePages = { [A]: pageWithContact('Alice', 'alice.dev', 'a@alice.dev') };
  await send({ type: 'scan' });
  storePages = { [A]: pageWithContact('Alice', 'other.example', 'x@other.example') };
  await send({ type: 'scan' });
  const contact = storage.alerts.filter((a) => a.extId === A && a.type === 'contact_changed');
  assert.equal(contact.length, 2);
  assert.notEqual(contact[0].id, contact[1].id);
  await send({ type: 'dismiss', id: contact[0].id });
  assert.ok(storage.alerts.some((a) => a.id === contact[1].id), 'dismissing one keeps the other');
});

test('a scan before any baseline only records one', async () => {
  clearStorage();
  const sideloaded = ext(B, { installType: 'sideload', updateUrl: 'https://evil.example/update.xml' });
  installed = [sideloaded];
  await send({ type: 'scan' });
  assert.deepEqual(storage.alerts ?? [], [], 'no "new extension" alerts for what was already there');
  installed = [sideloaded, ext(C, { installType: 'sideload', updateUrl: 'https://evil.example/update.xml' })];
  await send({ type: 'scan' });
  assert.deepEqual(storage.alerts.map((a) => [a.extId, a.type]), [[C, 'installed']]);
});

test('a store page that flickers does not repeat the alert', async () => {
  clearStorage();
  installed = [ext(A), ext(B), ext(C)];
  storePages = { [A]: page('Alice'), [B]: page('Bob'), [C]: page('Carol') };
  await send({ type: 'scan' });
  const before = notifications.length;
  for (const present of [false, true, false, true, false]) {
    if (present) storePages[A] = page('Alice');
    else delete storePages[A];
    await send({ type: 'scan' });
  }
  assert.equal(storage.alerts.filter((a) => a.type === 'removed_from_store').length, 1);
  assert.equal(notifications.length, before + 1, 'one notification');
});

test('a burst of updates makes one scan and one server call', async () => {
  installed = [ext(A), ext(B), ext(C)];
  storePages = { [A]: page('Alice'), [B]: page('Bob'), [C]: page('Carol') };
  await settle();
  serverCalls.length = 0;
  for (const e of installed) listeners.extInstalled(e);
  await settle();
  assert.equal(serverCalls.length, 1);
  assert.match(serverCalls[0], new RegExp(`ids=${A},${B},${C}$`));

  serverCalls.length = 0;
  const scans = [send({ type: 'scan' }), send({ type: 'scan' })];
  listeners.alarm({ name: 'store-check' });
  await Promise.all(scans);
  assert.equal(serverCalls.length, 1, 'two "Check now" and the alarm share one call');
});

test('data about extensions uninstalled while Guardian was off is cleaned up', async () => {
  await send({ type: 'setSites', extId: B, sites: ['mybank.com'] });
  assert.ok(storage.alerts.some((a) => a.extId === A));
  installed = [ext(C)];
  listeners.startup();
  await settle();
  assert.deepEqual(Object.keys(storage.storeInfo), [C]);
  assert.deepEqual(Object.keys(storage.snapshots), [C]);
  assert.deepEqual(storage.siteRules, {});
  assert.deepEqual(storage.alerts, []);
  assert.equal(badge, '');
});

test('the first-run scan runs before a scan sent right after install', async () => {
  clearStorage();
  installed = [ext(D, { installType: 'sideload', updateUrl: 'https://evil.example/update.xml' })];
  listeners.installed({ reason: 'install' });
  await send({ type: 'scan' });
  assert.deepEqual(storage.alerts ?? [], []);
  assert.ok(storage.installedAt);
});

test('a check where the server could look up nothing is shown as an error', async () => {
  installed = [ext(E)];
  storePages = { [E]: '<title>Odd - Chrome Web Store</title><div>no developer here</div>' };
  await send({ type: 'scan' });
  const before = storage.lastStoreCheckAt;
  await send({ type: 'scan' });
  assert.equal(storage.storeError, 'no extension could be checked');
  assert.equal(storage.lastStoreCheckAt, before, 'not "checked just now"');
  storePages = { [E]: page('Eve') };
  await send({ type: 'scan' });
  assert.equal(storage.storeError, null);
});
