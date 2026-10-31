import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/handler.js';

const fixture = (name) => readFileSync(new URL(`../../extension/tests/fixtures/${name}.html`, import.meta.url), 'utf8');
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
  assert.equal((await sitemap.text()).match(/<loc>/g).length, POPULAR.length + 4);
  assert.match(await (await get('/robots.txt')).text(), /Sitemap: .+\/sitemap\.xml/);
});

test('incident page lists the extensions, and their check pages link back', async () => {
  const { INCIDENTS } = await import('../src/incidents.js');
  const [incident] = INCIDENTS;
  assert.equal(incident.extensions.length, 19);
  assert.ok(incident.extensions.every((e) => /^[a-p]{32}$/.test(e.id)));

  const page = await get(`/incidents/${incident.slug}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Bought from their original developers \(5\)/);
  assert.match(html, /Built by the attackers \(14\)/);
  assert.match(html, /\/extension\/enable-right-click-copy\/pkoccklolohdacbfooifnpebakpbeipc/);
  assert.match(html, /microsoftedge\.microsoft\.com\/addons\/detail\/inmkjedjdhgpknjogbjomhnbgdccckkg/);
  assert.equal((await get('/incidents/nope')).status, 404);

  const named = await (await get('/extension/pkoccklolohdacbfooifnpebakpbeipc')).text();
  assert.match(named, /Named in a malware report/);
  assert.match(named, /<title>Is Enable Right Click &amp; Copy – Smart Unlock \+ OCR safe\?/);
  assert.match(named, new RegExp(`href="/incidents/${incident.slug}"`));
  assert.doesNotMatch(await (await get(`/extension/dark-reader/${DARK}`)).text(), /Named in a malware report/);
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

test('report page and its data', async () => {
  const page = await (await get('/report/popular-chrome-extensions-2026')).text();
  assert.match(page, /<h1>We checked the 150 most popular Chrome extensions<\/h1>/);
  assert.match(page, /href="\/extension\/[a-z0-9-]+\/[a-p]{32}"/);
  const data = await (await get('/report/popular-chrome-extensions-2026.json')).json();
  assert.equal(data.stale.length, data.staleBroad);
  assert.ok(data.broad <= data.analyzed);
  assert.match(await (await get('/sitemap.xml')).text(), /popular-chrome-extensions-2026</);
});

test('a large batch stays within the outgoing request limit', async () => {
  let fetches = 0;
  const counting = async () => { fetches += 1; return new Response(fixture('dark-reader')); };
  const ids = Array.from({ length: 30 }, (_, i) => 'abcdefghijklmnop'[i % 16].repeat(31) + 'abcdefghijklmnop'[Math.floor(i / 16)]);
  const res = await handleRequest(new Request(`http://x/v1/store?ids=${ids.join(',')}`), { fetchImpl: counting, cache: null });
  const results = Object.values((await res.json()).results);
  assert.equal(fetches, 20);
  assert.equal(results.filter((r) => r.status === 'ok').length, 20);
  assert.equal(results.filter((r) => r.code === 'busy').length, 10);
});

test('pages carry link previews', async () => {
  const report = await (await get('/report/popular-chrome-extensions-2026')).text();
  assert.match(report, /<meta property="og:image" content="https:\/\/[^"]+\/og\/report\.png">/);
  assert.match(await (await get('/')).text(), /og\/default\.png/);
  const img = await get('/og/report.png');
  assert.equal(img.headers.get('Content-Type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await img.arrayBuffer()).slice(1, 4)], [80, 78, 71]);
});

test('every response carries security headers', async () => {
  for (const path of ['/', '/privacy', `/v1/store?ids=${DARK}`, '/og/default.png']) {
    const res = await get(path);
    assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/, path);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', path);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY', path);
  }
});

test('unknown pages get an HTML 404, unknown API paths stay JSON', async () => {
  const page = await get('/no-such-page');
  assert.equal(page.status, 404);
  assert.match(await page.text(), /<h1>Page not found<\/h1>/);
  const api = await get('/v1/nope');
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: 'not found' });
});

test('the site links to the rest of Tinyward', async () => {
  const home = await (await get('/')).text();
  assert.match(home, /Also from Tinyward: Unseen/);
  assert.match(home, /A Tinyward project/);
});
