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
  permissions: { contains: async () => hasTabs, onAdded: on('permAdded') },
  windows: { onFocusChanged: on('focus') },
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
    // activeUrl '' is a focused window whose tab has no address, like devtools.
    query: async (q) => { lastQuery = q; return activeUrl == null ? [] : [{ url: activeUrl || undefined, active: true }]; },
    onActivated: on('tabActivated'),
    onUpdated: on('tabUpdated'),
  },
};

const page = (dev) => `<title>X - Chrome Web Store</title><li><div class="a">Developer</div><div><div class="b">${dev}<br>Street 1</div></div></li>`;
// The extension talks to the real server handler, which reads fake store pages.
const fakeStore = async (url) => {
  const id = /detail\/([^?]+)/.exec(url)[1];
  const html = storePages[id];
  return html ? new Response(html) : new Response('', { status: 404 });
};
globalThis.fetch = (url) => handleRequest(new Request(url), { fetchImpl: fakeStore });

await import('../src/background.js');

const [A, B, C, D, E, F] = 'abcdef'.split('').map((c) => c.repeat(32));
const send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
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
  await send({ type: 'markSeen' }); // waits for the queued check
  assert.equal(installed[0].enabled, false);
  assert.equal(installed[1].enabled, true, 'other extensions are untouched');
  assert.deepEqual(storage.pausedBySites, [A]);

  activeUrl = 'https://news.example.com/';
  listeners.tabActivated({ tabId: 2 });
  await send({ type: 'markSeen' });
  assert.equal(installed[0].enabled, true);
  assert.deepEqual(storage.pausedBySites, []);
});

test('keep off on these sites never turns on an extension the user turned off', async () => {
  installed = [ext(A, { mayDisable: true }), ext(B, { mayDisable: true, enabled: false })];
  await send({ type: 'setSites', extId: B, sites: ['mybank.com'] });
  activeUrl = 'https://mybank.com/';
  listeners.tabUpdated(1, { url: activeUrl }, { active: true });
  await send({ type: 'markSeen' });
  activeUrl = 'https://example.com/';
  listeners.tabUpdated(1, { url: activeUrl }, { active: true });
  await send({ type: 'markSeen' });
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

// Waits for everything queued before it.
const settle = () => send({ type: 'markSeen' });

test('turning an extension back on by hand on the site keeps it on until leaving', async () => {
  installed = [ext(A, { mayDisable: true })];
  hasTabs = true;
  activeUrl = 'https://mybank.com/';
  await send({ type: 'setSites', extId: A, sites: ['mybank.com'] });
  assert.equal(installed[0].enabled, false);

  installed[0].enabled = true; // by hand, from the popup or chrome://extensions
  activeUrl = 'https://mybank.com/accounts';
  listeners.tabUpdated(1, { url: activeUrl }, { active: true });
  await settle();
  assert.equal(installed[0].enabled, true, 'not turned off again on the same site');
  assert.deepEqual(storage.allowedBySites, [A]);
  assert.deepEqual(storage.pausedBySites, []);

  activeUrl = 'https://example.com/';
  listeners.tabActivated({ tabId: 2 });
  await settle();
  assert.equal(installed[0].enabled, true);
  assert.deepEqual(storage.allowedBySites, []);

  activeUrl = 'https://mybank.com/';
  listeners.tabActivated({ tabId: 1 });
  await settle();
  assert.equal(installed[0].enabled, false, 'off again on the next visit');
});

test('focus leaving the browser or moving to another window', async () => {
  // A is off: mybank.com is the active tab of the focused window.
  assert.equal(installed[0].enabled, false);
  listeners.focus(-1); // chrome.windows.WINDOW_ID_NONE: another app has focus
  await settle();
  assert.equal(installed[0].enabled, false, 'the last focused window still shows the site');
  assert.deepEqual(lastQuery, { active: true, lastFocusedWindow: true });

  activeUrl = ''; // a devtools window: no address to check
  listeners.focus(3);
  await settle();
  assert.equal(installed[0].enabled, false);

  activeUrl = 'https://example.com/'; // another window, on another site
  listeners.focus(2);
  await settle();
  assert.equal(installed[0].enabled, true);
});

test('uninstalling an extension while it is paused forgets it', async () => {
  activeUrl = 'https://mybank.com/';
  listeners.tabActivated({ tabId: 1 });
  await settle();
  assert.deepEqual(storage.pausedBySites, [A]);
  installed = [];
  listeners.extUninstalled(A);
  await settle();
  assert.deepEqual(storage.pausedBySites, []);
  assert.equal(storage.siteRules[A], undefined);
  activeUrl = 'https://example.com/';
  listeners.tabActivated({ tabId: 2 });
  await settle(); // nothing left to turn back on, and no error
  assert.deepEqual(storage.pausedBySites, []);
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

test('the first-run scan runs before a scan sent right after install', async () => {
  clearStorage();
  installed = [ext(D, { installType: 'sideload', updateUrl: 'https://evil.example/update.xml' })];
  listeners.installed({ reason: 'install' });
  await send({ type: 'scan' });
  assert.deepEqual(storage.alerts ?? [], []);
  assert.ok(storage.installedAt);
});
