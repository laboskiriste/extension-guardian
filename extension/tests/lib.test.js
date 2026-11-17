import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStorePage, fetchStoreInfoBatch, parseAmoAddon, fetchAmoInfoBatch } from '../src/lib/store.js';
import { assessRisk, assessAccess, hostReach, isFromStore, parseUsers, recommend } from '../src/lib/risk.js';
import { snapshotOf, diffSnapshots, diffStoreInfo } from '../src/lib/changes.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');

const ext = (overrides = {}) => ({
  id: 'a'.repeat(32),
  name: 'Test',
  version: '1.0',
  type: 'extension',
  installType: 'normal',
  updateUrl: 'https://clients2.google.com/service/update2/crx',
  permissions: [],
  hostPermissions: [],
  ...overrides,
});

test('parses a company developer', () => {
  const info = parseStorePage(fixture('dark-reader'));
  assert.equal(info.status, 'ok');
  assert.equal(info.title, 'Dark Reader');
  assert.equal(info.developerName, 'Dark Reader Ltd');
  assert.equal(info.email, 'support@darkreader.org');
  assert.equal(info.website, 'darkreader.org');
  assert.equal(info.trader, 'trader');
  assert.match(info.version, /^\d+\.\d+/);
  assert.match(info.icon, /^https:\/\/lh3\.googleusercontent\.com\//);
});

test('parses an individual developer', () => {
  const info = parseStorePage(fixture('ublock-lite'));
  assert.equal(info.offeredBy, 'Raymond Hill (gorhill)');
  assert.equal(info.email, 'ubo@raymondhill.net');
  assert.equal(info.trader, 'non-trader');
  assert.equal(info.developerName, null);
});

test('detects a removed extension', () => {
  assert.deepEqual(parseStorePage(fixture('removed')), { status: 'not_found' });
});

test('fetchStoreInfoBatch splits large requests and drops server errors', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    const ids = new URL(url).searchParams.get('ids').split(',');
    const results = Object.fromEntries(ids.map((id) => [id, id === 'id7' ? { status: 'error' } : { status: 'ok' }]));
    return { ok: true, json: async () => ({ results }) };
  };
  const ids = Array.from({ length: 60 }, (_, i) => `id${i}`);
  const out = await fetchStoreInfoBatch(ids, fake);
  assert.equal(urls.length, 3);
  assert.equal(Object.keys(out).length, 59);
  assert.equal(out.id7, undefined);
  await assert.rejects(fetchStoreInfoBatch(['a'], async () => ({ ok: false, status: 500 })), /500/);
});

test('parses a Firefox Add-ons listing', () => {
  const addon = JSON.parse(readFileSync(new URL('./fixtures/amo-ublock.json', import.meta.url), 'utf8'));
  const info = parseAmoAddon(addon);
  assert.equal(info.status, 'ok');
  assert.equal(info.title, 'uBlock Origin');
  assert.equal(info.developerName, 'Raymond Hill');
  assert.equal(info.website, 'github.com');
  assert.match(info.users, /^\d{1,3}(,\d{3})+$/);
  assert.match(info.updated, /^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  assert.equal(parseAmoAddon({ ...addon, status: 'disabled' }).status, 'not_found');
});

test('fetchAmoInfoBatch treats 404 as not found and keeps going after one failure', async () => {
  const fake = async (url) => {
    if (url.includes('gone')) return { ok: false, status: 404 };
    if (url.includes('flaky')) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => ({ status: 'public', name: 'X', authors: [{ name: 'A' }] }) };
  };
  const out = await fetchAmoInfoBatch(['ok@x', 'gone@x', 'flaky@x'], fake);
  assert.equal(out['ok@x'].developerName, 'A');
  assert.equal(out['gone@x'].status, 'not_found');
  assert.equal(out['flaky@x'], undefined);
  await assert.rejects(fetchAmoInfoBatch(['flaky@x'], fake), /503/);
});

test('an unlisted Firefox add-on is worth watching, not high risk', () => {
  const r = assessRisk(ext(FULL), { store: { status: 'unlisted' }, now: NOW });
  assert.equal(r.level, 'watch');
});

const NOW = Date.parse('October 26, 2026');
const store = (overrides = {}) => ({
  status: 'ok', developerName: 'Dev', email: 'dev@example.com', website: 'example.com',
  trader: 'non-trader', users: '50,000', updated: 'October 1, 2026', ...overrides,
});
const FULL = { permissions: ['cookies', 'scripting'], hostPermissions: ['<all_urls>'] };

test('access levels come from permissions', () => {
  assert.equal(assessAccess(ext({ permissions: ['storage', 'alarms'] })).level, 'basic');
  assert.equal(assessAccess(ext({ hostPermissions: ['https://*.example.com/*'] })).level, 'limited');
  assert.equal(assessAccess(ext({ permissions: ['history'] })).level, 'limited');
  assert.equal(assessAccess(ext({ permissions: ['debugger'] })).level, 'full');
  const full = assessAccess(ext(FULL));
  assert.equal(full.level, 'full');
  assert.equal(full.reasons[0].title, 'Can read and change data on all websites');
  assert.equal(full.score, 60);
});

test('site access is judged by how far it reaches, not by how many sites', () => {
  const weather = Array.from({ length: 10 }, (_, i) => `https://weather${i}.example/*`);
  const ten = assessAccess(ext({ hostPermissions: weather }));
  const gmail = assessAccess(ext({ hostPermissions: ['https://mail.google.com/*'] }));
  assert.equal(ten.score, gmail.score, 'ten sites score the same as one');
  assert.equal(hostReach([]), 'none');
  assert.equal(hostReach(weather), 'sites');
  assert.equal(hostReach(['https://*.google.com/*']), 'domains');
  assert.equal(hostReach(['https://*.google.com/*', '<all_urls>']), 'all');
  assert.equal(hostReach(['*://*/*']), 'all');
  const domain = assessAccess(ext({ hostPermissions: ['https://*.example.com/*'] }));
  assert.ok(domain.score > gmail.score, 'a whole domain reaches further than one host');
  assert.match(domain.reasons[0].title, /including their subdomains/);
  assert.equal(domain.hostReach, 'domains');
  assert.equal(assessAccess(ext(FULL)).hostReach, 'all');
});

test('activeTab is on-demand access: it shows, and does not change the level', () => {
  const r = assessAccess(ext({ permissions: ['activeTab', 'storage'] }));
  assert.equal(r.reasons[0].title, 'Can use the page you are on, when you click it');
  assert.equal(r.level, 'basic');
});

test('system information permissions are listed, and unknown ones are shown as not rated', () => {
  const mem = assessAccess(ext({ permissions: ['system.memory', 'storage'] }));
  assert.equal(mem.reasons[0].title, 'Can see your computer\'s memory');
  assert.equal(mem.level, 'basic', 'a single low-weight permission does not change the level');
  const unknown = assessAccess(ext({ permissions: ['storage', 'someFuturePermission', 'anotherOne'] }));
  assert.equal(unknown.level, 'basic');
  assert.equal(unknown.score, 0);
  assert.equal(unknown.reasons.length, 1);
  assert.equal(unknown.reasons[0].title, 'Permissions we don\'t rate');
  assert.match(unknown.reasons[0].detail, /someFuturePermission, anotherOne/);
  assert.equal(assessAccess(ext({ permissions: ['storage', 'alarms', 'idle'] })).reasons.length, 0, 'harmless ones add nothing');
});

test('popularity, update date and trader status are context, not part of the score', () => {
  const r = assessRisk(ext(FULL), { store: store({ users: '20,000,000', trader: 'trader' }), now: NOW });
  assert.equal(r.level, 'low');
  assert.equal(r.score, 0);
  assert.equal(r.access.level, 'full');
  assert.deepEqual(r.reasons.map((x) => x.kind), ['info', 'info', 'info']);
  assert.ok(r.reasons.every((x) => x.weight === 0));
});

test('few users and an old update are never warnings, even with full access', () => {
  for (const access of [FULL, {}]) {
    const r = assessRisk(ext(access), { store: store({ users: '200', updated: 'March 3, 2023' }), now: NOW });
    assert.equal(r.level, 'low');
    assert.equal(r.score, 0);
    assert.ok(!r.reasons.some((x) => x.kind === 'bad'));
  }
});

test('two extensions that differ only in popularity get the same rating', () => {
  const small = assessRisk(ext(FULL), { store: store({ users: '963' }), now: NOW });
  const big = assessRisk(ext(FULL), { store: store({ users: '2,000,000' }), now: NOW });
  assert.equal(small.level, big.level);
  assert.equal(small.score, big.score);
});

test('the recommended action never says "monitor" for full access', () => {
  assert.equal(recommend('basic', 'low'), 'monitor');
  assert.equal(recommend('limited', 'low'), 'monitor');
  assert.equal(recommend('full', 'low'), 'review');
  assert.equal(recommend('basic', 'watch'), 'review');
  for (const access of ['basic', 'limited', 'full']) assert.equal(recommend(access, 'high'), 'act');
});

test('critical signals are high risk even for popular extensions', () => {
  const popular = store({ users: '20,000,000', trader: 'trader' });
  assert.equal(assessRisk(ext(), { store: popular, ownershipChanged: true, now: NOW }).level, 'high');
  assert.equal(assessRisk(ext(), { store: { status: 'not_found' }, now: NOW }).level, 'high');
  const sideloaded = ext({ installType: 'sideload', updateUrl: 'https://evil.example/update.xml' });
  const r = assessRisk(sideloaded);
  assert.equal(r.level, 'high');
  assert.equal(r.reasons.length, 2);
  assert.equal(isFromStore(sideloaded), false);
});

test('a store extension added by Chrome itself is worth reviewing, not high risk', () => {
  // Google Docs Offline: installed by Chrome, updates from the store, no user count shown.
  const docs = ext({ installType: 'sideload', hostPermissions: ['https://docs.google.com/*'] });
  assert.equal(isFromStore(docs), true);
  assert.equal(assessRisk(docs).level, 'high', 'before the store has been checked');
  const google = store({ developerName: 'Google Ireland, Ltd.', trader: 'trader', users: null, updated: 'October 19, 2026' });
  const r = assessRisk(docs, { store: google, now: NOW });
  assert.equal(r.level, 'watch', 'you did not install it yourself, so it is worth a look');
  assert.equal(r.reasons[0].title, 'Installed by another program');
});

test('a recent permission increase is worth watching', () => {
  assert.equal(assessRisk(ext(), { store: store(), recentAccessIncrease: true, now: NOW }).level, 'watch');
});

test('unchecked and unpacked extensions have no risk signals', () => {
  assert.equal(assessRisk(ext(FULL)).score, 0);
  assert.equal(assessRisk(ext({ installType: 'development', updateUrl: undefined })).score, 0);
});

test('parseUsers handles store formats', () => {
  assert.equal(parseUsers('22,000,000'), 22000000);
  assert.equal(parseUsers('1,000,000+'), 1000000);
  assert.equal(parseUsers(null), null);
});

test('update that adds all-sites access is a high alert', () => {
  const before = snapshotOf(ext({ permissions: ['storage'] }));
  const after = snapshotOf(ext({ version: '2.0', permissions: ['storage', 'history'], hostPermissions: ['<all_urls>'] }));
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.map((c) => [c.type, c.severity]), [
    ['new_permissions', 'medium'],
    ['new_hosts', 'high'],
  ]);
  assert.equal(changes[0].detail, 'Can read your browsing history');
});

test('update with no new permissions produces no alert', () => {
  const s = snapshotOf(ext({ permissions: ['tabs'] }));
  assert.deepEqual(diffSnapshots(s, { ...s, version: '9' }), []);
});

test('developer change is reported as an ownership change', () => {
  const prev = { status: 'ok', developerName: 'Alice Tools', email: 'a@alice.dev' };
  const cur = { status: 'ok', developerName: 'Growth Media LLC', email: 'hi@growth.example' };
  const changes = diffStoreInfo('Test', prev, cur);
  assert.deepEqual(changes.map((c) => c.type), ['ownership_changed', 'contact_changed']);
  assert.equal(changes[0].to, 'Growth Media LLC');
});

test('a missing field is not an ownership change', () => {
  const prev = { status: 'ok', developerName: 'Alice', email: 'a@alice.dev' };
  assert.deepEqual(diffStoreInfo('Test', prev, { status: 'ok', developerName: null, email: 'A@alice.dev' }), []);
});

test('a sale to a trader is an ownership change, though no field is in both checks', () => {
  const prev = { status: 'ok', offeredBy: 'Alice', developerName: null, email: 'a@alice.dev', trader: 'non-trader' };
  const cur = { status: 'ok', offeredBy: null, developerName: 'Growth Media LLC', email: 'hi@growth.example', trader: 'trader' };
  const changes = diffStoreInfo('Test', prev, cur);
  assert.equal(changes[0].type, 'ownership_changed');
  assert.equal(changes[0].from, 'Alice');
  assert.equal(changes[0].to, 'Growth Media LLC');
});

test('becoming a trader under the same name is not an ownership change', () => {
  const prev = { status: 'ok', offeredBy: 'Raymond Hill (gorhill)', developerName: null };
  for (const name of ['Raymond Hill', 'RAYMOND HILL LTD', 'Raymond Hill, Inc.']) {
    assert.deepEqual(diffStoreInfo('Test', prev, { status: 'ok', offeredBy: null, developerName: name }), [], name);
  }
});

test('a new legal name with the same email is a medium alert, not a new owner', () => {
  const prev = { status: 'ok', offeredBy: 'darkreader', email: 'support@darkreader.org' };
  const cur = { status: 'ok', developerName: 'Alexander Shutau', email: 'Support@darkreader.org' };
  const changes = diffStoreInfo('Test', prev, cur);
  assert.deepEqual(changes.map((c) => [c.type, c.severity]), [['developer_renamed', 'medium']]);
});

test('Firefox: a new co-author is a medium alert, losing every author is a new owner', () => {
  const ff = (authors) => ({ status: 'ok', developerName: authors.join(', '), authors });
  assert.deepEqual(diffStoreInfo('T', ff(['Alice']), ff(['Alice', 'Bob'])).map((c) => [c.type, c.severity]), [['authors_changed', 'medium']]);
  assert.match(diffStoreInfo('T', ff(['Alice', 'Bob']), ff(['Bob']))[0].detail, /removed Alice/);
  assert.deepEqual(diffStoreInfo('T', ff(['Alice']), ff(['alice'])), []);
  const sold = diffStoreInfo('T', ff(['Alice']), ff(['Growth Media']));
  assert.deepEqual([sold[0].type, sold[0].from, sold[0].to], ['ownership_changed', 'Alice', 'Growth Media']);
  // Saved before author lists were kept.
  assert.deepEqual(diffStoreInfo('T', { status: 'ok', developerName: 'Alice' }, ff(['Alice', 'Bob']))[0].type, 'authors_changed');
});

// A store page cut down to what parseStorePage reads.
const storePage = ({ title = 'Tiny Tool', developer, offeredBy, users, updated } = {}) => [
  `<title>${title} - Chrome Web Store</title>`,
  users != null && `<span>${users}</span>`,
  offeredBy && `<div>Offered by</div><div>${offeredBy}</div>`,
  updated && `<div>Updated</div><div>${updated}</div>`,
  developer && `<li><div>Developer</div><div><div>${developer}</div></div></li>`,
].filter(Boolean).join('');

test('a store page with no developer section still parses', () => {
  const info = parseStorePage(storePage({ offeredBy: 'Someone', users: '120 users' }));
  assert.equal(info.status, 'ok');
  assert.equal(info.title, 'Tiny Tool');
  assert.equal(info.offeredBy, 'Someone');
  assert.equal(info.developerName, null);
  assert.equal(info.email, null);
  assert.equal(info.website, null);
  assert.equal(info.trader, null);
});

test('user counts: none, zero, one and many', () => {
  assert.equal(parseStorePage(storePage()).users, null);
  assert.equal(parseStorePage(storePage({ users: '0 users' })).users, '0');
  assert.equal(parseStorePage(storePage({ users: '1 user' })).users, '1');
  assert.equal(parseStorePage(storePage({ users: '10,000,000+ users' })).users, '10,000,000+');
});

test('the update date is kept as the store shows it', () => {
  for (const updated of ['October 21, 2026', '21 October 2026', '2026-10-21']) {
    const info = parseStorePage(storePage({ updated }));
    assert.equal(info.updated, updated);
    assert.equal(new Date(Date.parse(info.updated)).getUTCFullYear(), 2026, updated);
  }
});

test('names with HTML entities are decoded once', () => {
  const info = parseStorePage(storePage({ title: 'Tom &amp; Jerry&#39;s Tool', developer: 'O&#x27;Brien &amp; Sons<br>1 Main St' }));
  assert.equal(info.title, "Tom & Jerry's Tool");
  assert.equal(info.developerName, "O'Brien & Sons");
  assert.equal(info.developerAddress, '1 Main St');
  assert.equal(parseStorePage(storePage({ offeredBy: 'A &amp;lt;b&amp;gt;' })).offeredBy, 'A &lt;b&gt;');
});

test('risk edge cases: zero users, no update date, unlisted', () => {
  const zero = assessRisk(ext(), { store: store({ users: '0' }), now: NOW });
  assert.equal(zero.reasons[0].title, '0 users');
  assert.equal(zero.reasons[0].kind, 'info');
  assert.equal(zero.level, 'low', 'few users alone is never a warning');
  assert.equal(assessRisk(ext(FULL), { store: store({ users: '0' }), now: NOW }).level, 'low');

  const noDate = assessRisk(ext(), { store: store({ updated: null }), now: NOW });
  assert.ok(!noDate.reasons.some((r) => /updated|maintained/i.test(r.title)));
  const badDate = assessRisk(ext(), { store: store({ updated: 'sometime' }), now: NOW });
  assert.deepEqual(badDate.reasons, noDate.reasons);

  const unlisted = assessRisk(ext(), { store: { status: 'unlisted' }, now: NOW });
  assert.equal(unlisted.level, 'low');
  assert.equal(unlisted.reasons[0].title, 'Not listed on the Chrome Web Store');
});

test('a store listing with no users and no contact', () => {
  const r = assessRisk(ext(), { store: store({ users: null, email: null, website: null, updated: null }), now: NOW });
  assert.deepEqual(r.reasons.map((x) => [x.title, x.kind]), [['No developer contact', 'info']]);
  assert.equal(r.level, 'low');
});

test('host permission changes', () => {
  const s = (hosts) => snapshotOf(ext({ hostPermissions: hosts }));
  const narrow = diffSnapshots(s(['https://a.com/*']), s(['https://a.com/*', 'https://*.b.com/*', 'http://b.com/*']));
  assert.deepEqual(narrow.map((c) => [c.type, c.severity, c.detail]), [['new_hosts', 'medium', 'b.com']]);
  const broad = diffSnapshots(s(['https://a.com/*']), s(['*://*/*']));
  assert.deepEqual(broad.map((c) => [c.type, c.severity]), [['new_hosts', 'high']]);
  // Already on every site: another pattern adds nothing to worry about.
  assert.equal(diffSnapshots(s(['<all_urls>']), s(['<all_urls>', 'https://*/*']))[0].severity, 'medium');
  assert.deepEqual(diffSnapshots(s(['https://a.com/*', 'https://b.com/*']), s(['https://b.com/*'])), [], 'removed hosts are fine');
  assert.deepEqual(diffSnapshots(s(['https://b.com/*', 'https://a.com/*']), s(['https://a.com/*', 'https://b.com/*'])), [], 'order does not matter');
});

test('optional permissions the user granted show up as new permissions', () => {
  // Chrome reports granted optional permissions in the same lists, so they
  // can't be told apart from permissions added by an update.
  const before = snapshotOf(ext({ permissions: ['storage'] }));
  const after = snapshotOf(ext({ permissions: ['storage', 'tabs'], hostPermissions: ['https://mail.google.com/*'] }));
  assert.deepEqual(diffSnapshots(before, after).map((c) => c.type), ['new_permissions', 'new_hosts']);
  assert.deepEqual(diffSnapshots(after, before), [], 'revoking them raises nothing');
});

test('removal is reported only after the extension was seen in the store', () => {
  assert.equal(diffStoreInfo('T', { status: 'ok' }, { status: 'not_found' })[0].type, 'removed_from_store');
  assert.deepEqual(diffStoreInfo('T', undefined, { status: 'not_found' }), []);
  assert.deepEqual(diffStoreInfo('T', { status: 'not_found' }, { status: 'not_found' }), []);
});
