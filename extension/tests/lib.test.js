import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStorePage, fetchStoreInfoBatch, parseAmoAddon, fetchAmoInfoBatch } from '../src/lib/store.js';
import { assessRisk, assessAccess, isFromStore, parseUsers } from '../src/lib/risk.js';
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

test('a popular, maintained extension with full access is low risk', () => {
  const r = assessRisk(ext(FULL), { store: store({ users: '20,000,000', trader: 'trader' }), now: NOW });
  assert.equal(r.level, 'low');
  assert.equal(r.access.level, 'full');
  assert.deepEqual(r.reasons.map((x) => x.kind), ['good', 'good', 'good']);
});

test('an unknown, abandoned extension with full access is high risk', () => {
  const r = assessRisk(ext(FULL), { store: store({ users: '200', updated: 'March 3, 2023' }), now: NOW });
  assert.equal(r.level, 'high');
  assert.deepEqual(r.reasons.map((x) => x.title), ['Only 200 users', 'Not updated in over 2 years']);
});

test('the same unknown extension with basic access is only worth watching', () => {
  const r = assessRisk(ext(), { store: store({ users: '200', updated: 'March 3, 2023' }), now: NOW });
  assert.equal(r.level, 'watch');
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

test('a store extension added by Chrome itself is not high risk', () => {
  // Google Docs Offline: installed by Chrome, updates from the store, no user count shown.
  const docs = ext({ installType: 'sideload', hostPermissions: ['https://docs.google.com/*'] });
  assert.equal(isFromStore(docs), true);
  assert.equal(assessRisk(docs).level, 'high', 'before the store has been checked');
  const google = store({ developerName: 'Google Ireland, Ltd.', trader: 'trader', users: null, updated: 'October 19, 2026' });
  const r = assessRisk(docs, { store: google, now: NOW });
  assert.equal(r.level, 'low');
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
  assert.equal(zero.reasons[0].title, 'Only 0 users');
  assert.equal(zero.level, 'low', 'few users alone, with basic access, is low');
  assert.equal(assessRisk(ext(FULL), { store: store({ users: '0' }), now: NOW }).level, 'watch');

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
  assert.deepEqual(r.reasons.map((x) => x.title), ['No developer contact']);
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
