import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/handler.js';

const fixture = (name) => readFileSync(new URL(`../../extension-guardian/tests/fixtures/${name}.html`, import.meta.url), 'utf8');
const DARK = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
const GONE = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';
const MISSING = 'p'.repeat(32);

const pages = { [DARK]: fixture('dark-reader'), [GONE]: fixture('removed') };
let storeCalls = 0;
const fakeStore = async (url) => {
  storeCalls++;
  const id = /detail\/([a-p]{32})/.exec(url)[1];
  if (id === 'o'.repeat(32)) return new Response('', { status: 503 });
  return pages[id] ? new Response(pages[id]) : new Response('', { status: 404 });
};

const memory = new Map();
const cache = {
  match: async (k) => (memory.has(k) ? new Response(memory.get(k)) : undefined),
  put: async (k, r) => { memory.set(k, await r.text()); },
};

const get = (path) => handleRequest(new Request(`http://x${path}`), { fetchImpl: fakeStore, cache });

test('returns parsed store info per id', async () => {
  const res = await get(`/v1/store?ids=${DARK},${GONE},${MISSING}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const { results } = await res.json();
  assert.equal(results[DARK].developerName, 'Dark Reader Ltd');
  assert.equal(results[GONE].status, 'not_found');
  assert.equal(results[MISSING].status, 'not_found');
});

test('serves repeated lookups from the cache', async () => {
  const before = storeCalls;
  await get(`/v1/store?ids=${DARK}`);
  assert.equal(storeCalls, before);
});

test('store errors are reported and not cached', async () => {
  const id = 'o'.repeat(32);
  const { results } = await (await get(`/v1/store?ids=${id}`)).json();
  assert.equal(results[id].status, 'error');
  assert.equal(memory.has(`https://cache.internal/store/${id}`), false);
});

test('serves the privacy policy', async () => {
  const res = await get('/privacy');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.match(await res.text(), /IDs of your installed Chrome Web Store extensions/);
});

test('check page shows the form, and results for a pasted store link', async () => {
  const empty = await get('/');
  assert.equal(empty.status, 200);
  assert.match(await empty.text(), /Is this Chrome extension safe\?/);

  const link = encodeURIComponent(`https://chromewebstore.google.com/detail/dark-reader/${DARK}?hl=en`);
  const redirect = await get(`/?q=${link}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('Location'), `/extension/dark-reader/${DARK}`);

  const html = await (await get(`/extension/dark-reader/${DARK}`)).text();
  assert.match(html, /<title>Is Dark Reader safe\?/);
  assert.match(html, /Dark Reader Ltd/);
  assert.match(html, /Registered business/);
  assert.match(html, new RegExp(`rel="canonical" href="[^"]+/extension/dark-reader/${DARK}"`));

  assert.equal((await get(`/?q=${GONE}`)).headers.get('Location'), `/extension/${GONE}`);
  assert.match(await (await get(`/extension/${GONE}`)).text(), /Not in the Chrome Web Store/);
  assert.match(await (await get('/?q=hello')).text(), /doesn't look like a Chrome Web Store link/);
});

test('popular page, sitemap and robots.txt', async () => {
  const { POPULAR } = await import('../src/popular.js');
  const popular = await (await get('/popular')).text();
  assert.match(popular, new RegExp(`/extension/[a-z0-9-]+/${POPULAR[0].id}`));
  const sitemap = await get('/sitemap.xml');
  assert.match(sitemap.headers.get('Content-Type'), /xml/);
  assert.equal((await sitemap.text()).match(/<loc>/g).length, POPULAR.length + 2);
  assert.match(await (await get('/robots.txt')).text(), /Sitemap: .+\/sitemap\.xml/);
});

test('check page escapes store text', async () => {
  const { renderCheckPage } = await import('../src/check-page.js');
  const html = renderCheckPage({ query: '"><script>', id: 'a'.repeat(32), info: { status: 'ok', title: '<img src=x onerror=alert(1)>', users: '5' } });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /"><script>/);
});

test('store signals', async () => {
  const { storeSignals } = await import('../src/check-page.js');
  const now = Date.parse('October 28, 2026');
  assert.equal(storeSignals({ status: 'not_found' }, now).verdict, 'bad');
  assert.equal(storeSignals({ status: 'ok', users: '7,000,000', updated: 'October 1, 2026', email: 'a@b.c' }, now).verdict, 'good');
  assert.equal(storeSignals({ status: 'ok', users: '120', updated: 'January 1, 2023' }, now).verdict, 'bad');
});

test('rejects bad requests', async () => {
  assert.equal((await get('/v1/store?ids=not-an-id')).status, 400);
  assert.equal((await get(`/v1/store?ids=${Array(41).fill(0).map((_, i) => String.fromCharCode(97 + (i % 16)).repeat(31) + String.fromCharCode(97 + Math.floor(i / 16))).join(',')}`)).status, 400);
  assert.equal((await get('/other')).status, 404);
});
