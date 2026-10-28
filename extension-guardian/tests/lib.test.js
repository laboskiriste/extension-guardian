import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStorePage, fetchStoreInfoBatch } from '../src/lib/store.js';
import { assessRisk, assessAccess, isFromChromeWebStore, parseUsers } from '../src/lib/risk.js';
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
  assert.equal(urls.length, 2);
  assert.equal(Object.keys(out).length, 59);
  assert.equal(out.id7, undefined);
  await assert.rejects(fetchStoreInfoBatch(['a'], async () => ({ ok: false, status: 500 })), /500/);
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
  assert.equal(isFromChromeWebStore(sideloaded), false);
});

test('a store extension added by Chrome itself is not high risk', () => {
  // Google Docs Offline: installed by Chrome, updates from the store, no user count shown.
  const docs = ext({ installType: 'sideload', hostPermissions: ['https://docs.google.com/*'] });
  assert.equal(isFromChromeWebStore(docs), true);
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

test('removal is reported only after the extension was seen in the store', () => {
  assert.equal(diffStoreInfo('T', { status: 'ok' }, { status: 'not_found' })[0].type, 'removed_from_store');
  assert.deepEqual(diffStoreInfo('T', undefined, { status: 'not_found' }), []);
  assert.deepEqual(diffStoreInfo('T', { status: 'not_found' }, { status: 'not_found' }), []);
});
