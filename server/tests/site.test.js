import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/handler.js';
import { renderCheckPage, renderSitemap, extensionPath } from '../src/check-page.js';
import { INCIDENTS } from '../src/incidents.js';
import { POPULAR } from '../src/popular.js';
import { REPORT } from '../src/report-data.js';

const fixture = (name) => readFileSync(new URL(`../../extension/tests/fixtures/${name}.html`, import.meta.url), 'utf8');
const DARK = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
const UBO = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';
const UBO_LITE = 'ddkjiahejlhfcafbddmgiahcphecmpfh';
const SUSPENDER = 'klbibkeccnjlkjkiokjodocebajanakg';
const UNKNOWN = 'p'.repeat(32);
const ids = (n) => Array.from({ length: n }, (_, i) => 'abcdefghijklmnop'[i % 16].repeat(31) + 'abcdefghijklmnop'[Math.floor(i / 16)]);

const store = (pages = { [DARK]: fixture('dark-reader') }) => async (url) => {
  const id = /detail\/([a-p]{32})/.exec(url)[1];
  return pages[id] ? new Response(pages[id]) : new Response('', { status: 404 });
};
const get = (path, { fetchImpl = store(), method = 'GET' } = {}) => handleRequest(new Request(`http://x${path}`, { method }), { fetchImpl, cache: null });
const body = async (path, options) => (await get(path, options)).text();

// --- Rendering and escaping (36)

const HOSTILE = {
  status: 'ok',
  title: '</title><script>alert(1)</script>',
  developerName: '<b onmouseover=alert(2)>Evil</b>',
  developerAddress: '"><svg onload=alert(3)>',
  email: 'x@y.z"><img src=x>',
  website: 'javascript:alert(4)',
  users: '<i>1,000</i>',
  updated: '<u>May 1, 2026</u>',
  version: '1.0<script>',
  icon: 'https://lh3.googleusercontent.com/a"onerror="alert(5)',
};

test('store text is escaped everywhere it appears, including meta tags', () => {
  const html = renderCheckPage({ id: 'a'.repeat(32), info: HOSTILE });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<b onmouseover/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /<i>1,000/);
  assert.doesNotMatch(html, /"onerror="/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<title>Is &lt;\/title&gt;&lt;script&gt;/);
  assert.match(html, /<meta name="description" content="[^"<>]*">/);
  assert.match(html, /<meta property="og:title" content="[^"<>]*">/);
});

test('icons only load from Google\'s image host', () => {
  const html = (icon) => renderCheckPage({ id: 'a'.repeat(32), info: { status: 'ok', title: 'X', icon } });
  assert.match(html('https://lh3.googleusercontent.com/abc'), /<img class="ext-icon" src="https:\/\/lh3\.googleusercontent\.com\/abc"/);
  assert.doesNotMatch(html('https://evil.example/x.png'), /evil\.example/);
  assert.doesNotMatch(html('javascript:alert(1)'), /<img class="ext-icon"/);
});

test('the pasted query is escaped and kept short', async () => {
  const long = `"><script>${'x'.repeat(5000)}`;
  const html = await body(`/?q=${encodeURIComponent(long)}`);
  assert.doesNotMatch(html, /"><script>/);
  assert.ok(!html.includes('x'.repeat(301)));
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('structured data cannot be closed early by its content', async () => {
  const html = await body('/');
  const [, json] = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
  const data = JSON.parse(json);
  assert.equal(data['@type'], 'SoftwareApplication');
  assert.equal(data.offers.price, '0');
  assert.equal((html.match(/<script/g) ?? []).length, 1);
});

// --- Bad API requests (37)

test('invalid, oversized and mixed id lists', async () => {
  const bad = await get('/v1/store?ids=ABC,../etc,' + 'q'.repeat(32));
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /ids=/);
  assert.equal((await get('/v1/store')).status, 400);

  // Invalid ids are dropped, valid ones answered.
  const mixed = await (await get(`/v1/store?ids=nope,${DARK},${DARK}`)).json();
  assert.deepEqual(Object.keys(mixed.results), [DARK]);

  // A huge parameter is rejected without any store request.
  let fetches = 0;
  const counting = async () => { fetches += 1; return new Response(''); };
  const huge = await get(`/v1/store?ids=${ids(200).join(',')}`, { fetchImpl: counting });
  assert.equal(huge.status, 400);
  assert.equal(fetches, 0);

  // 40 is the most per request; 21 to 40 are answered, past 20 as "busy".
  const forty = await (await get(`/v1/store?ids=${ids(40).join(',')}`, { fetchImpl: counting })).json();
  assert.equal(Object.keys(forty.results).length, 40);
  assert.equal(fetches, 20);
  assert.equal((await get(`/v1/store?ids=${ids(41).join(',')}`)).status, 400);
});

test('only GET, HEAD and OPTIONS are answered', async () => {
  assert.equal((await get('/v1/store?ids=' + DARK, { method: 'POST' })).status, 404);
  assert.equal((await get('/', { method: 'DELETE' })).status, 404);
  const pre = await get('/v1/store', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /GET/);
});

test('HEAD returns the GET status and headers without a body', async () => {
  const head = await get('/popular', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('Content-Type'), /text\/html/);
  assert.equal(await head.text(), '');
  assert.equal((await get('/nope', { method: 'HEAD' })).status, 404);
});

// --- Caching (38)

test('Cache-Control fits each kind of response', async () => {
  const cc = async (path, options) => (await get(path, options)).headers.get('Cache-Control');
  assert.equal(await cc(`/v1/store?ids=${DARK}`), 'no-store');
  assert.equal(await cc('/v1/store?ids=bad'), 'no-store');
  for (const path of ['/', '/popular', '/privacy', '/how-it-works', '/incidents', '/robots.txt', '/sitemap.xml', '/report/popular-chrome-extensions-2026', '/report/popular-chrome-extensions-2026.json']) {
    assert.match(await cc(path), /^public, max-age=\d+$/, path);
  }
  assert.equal(await cc(`/extension/dark-reader/${DARK}`), 'public, max-age=600');
  assert.equal(await cc(`/?q=${DARK}`), 'no-store');
  assert.equal(await cc('/?q=hello'), 'no-store');
});

// --- Security headers (39)

test('security headers on every kind of response', async () => {
  const failing = async () => { throw new Error('secret internal detail'); };
  const cases = [
    ['/no-such-page'], ['/v1/nope'], ['/v1/store?ids=bad'], ['/robots.txt'], ['/sitemap.xml'], ['/favicon.svg'],
    [`/?q=${DARK}`], ['/report'], ['/incidents'], ['/how-it-works'], ['/manifest.webmanifest'],
    [`/extension/${DARK}`, { fetchImpl: failing }], ['/v1/store', { method: 'OPTIONS' }], ['/popular', { method: 'HEAD' }],
  ];
  for (const [path, options] of cases) {
    const res = await get(path, options);
    const where = `${options?.method ?? 'GET'} ${path}`;
    assert.match(res.headers.get('Content-Security-Policy') ?? '', /default-src 'none'.*frame-ancestors 'none'/, where);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', where);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY', where);
    assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin', where);
  }
});

test('an unexpected failure becomes a plain 500 with security headers', async () => {
  // A broken request URL makes the router throw.
  const broken = await handleRequest({ method: 'GET', url: 'not a url' }, {});
  assert.equal(broken.status, 500);
  assert.deepEqual(await broken.json(), { error: 'internal error' });
  assert.equal(broken.headers.get('X-Frame-Options'), 'DENY');
});

// --- robots.txt and sitemap (40)

test('the sitemap lists every public page once, and robots.txt points to it', async () => {
  const xml = renderSitemap(POPULAR);
  const locs = [...xml.matchAll(/<loc>https:\/\/app\.extensionguardian\.workers\.dev([^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const path of ['/', '/popular', '/how-it-works', '/incidents', '/privacy', '/report/popular-chrome-extensions-2026']) {
    assert.ok(locs.includes(path), path);
  }
  for (const i of INCIDENTS) assert.ok(locs.includes(`/incidents/${i.slug}`), i.slug);
  for (const e of REPORT.stale) assert.ok(locs.includes(extensionPath(e.id, e.name)), e.name);
  assert.equal(new Set(locs).size, locs.length);
  for (const path of locs) assert.equal((await get(path)).status, 200, path);
  const robots = await body('/robots.txt');
  assert.match(robots, /Disallow: \/v1\//);
  assert.match(robots, /Sitemap: https:\/\/app\.extensionguardian\.workers\.dev\/sitemap\.xml/);
});

// --- Link previews on every page (41)

test('every page has a description, Open Graph and Twitter card tags', async () => {
  const paths = ['/', '/popular', '/privacy', '/how-it-works', '/incidents', `/incidents/${INCIDENTS[0].slug}`,
    '/report/popular-chrome-extensions-2026', `/extension/dark-reader/${DARK}`, `/extension/${UBO}`, '/nope'];
  for (const path of paths) {
    const html = await body(path);
    for (const tag of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"']) {
      assert.match(html, new RegExp(`<meta ${tag} content="[^"]+">`), `${path} ${tag}`);
    }
    assert.match(html, /<link rel="icon" href="\/favicon\.svg"/, path);
  }
});

// --- Extension pages: titles and descriptions (43)

test('extension pages describe what the listing says', async () => {
  const html = await body(`/extension/dark-reader/${DARK}`);
  assert.match(html, /<meta name="description" content="Dark Reader: by Dark Reader Ltd, [\d,]+ users, last updated [^"]+\. Who makes Dark Reader/);
  assert.doesNotMatch(html, /name="robots"/);
  const gone = await body(`/extension/${UNKNOWN}`);
  assert.match(gone, /<link rel="canonical" href="[^"]+\/extension\/p{32}">/);
  assert.match(gone, /no longer in the Chrome Web Store/);
});

// --- Removed extensions and replacements (coordinator findings)

test('a removed well-known extension shows its name and what to use instead', async () => {
  const html = await body(`/extension/${UBO}`);
  assert.match(html, /<h1>Is uBlock Origin safe\?<\/h1>/);
  assert.match(html, /<h2>uBlock Origin<\/h2>/);
  assert.doesNotMatch(html, /Unknown extension/);
  assert.doesNotMatch(html, /The store listing shows real reasons for caution/);
  assert.match(html, /No longer in the Chrome Web Store/);
  assert.match(html, /What to use instead/);
  assert.match(html, new RegExp(`href="/extension/ublock-origin-lite/${UBO_LITE}">uBlock Origin Lite</a>`));
  assert.match(html, new RegExp(`rel="canonical" href="[^"]+/extension/ublock-origin/${UBO}"`));

  const suspender = await body(`/extension/${SUSPENDER}`);
  assert.match(suspender, /The Great Suspender/);
  assert.match(suspender, /Memory Saver/);
});

test('an unknown removed extension is worded for a missing listing', async () => {
  const html = await body(`/extension/${UNKNOWN}`);
  assert.match(html, /There is no listing to check/);
  assert.doesNotMatch(html, /The store listing shows/);
  assert.doesNotMatch(html, /What to use instead/);
});

test('a removed extension from a malware report says so', async () => {
  const id = INCIDENTS[0].extensions.find((e) => e.store === 'chrome').id;
  const html = await body(`/extension/${id}`);
  assert.match(html, /Removed after a malware report/);
});

// --- Incidents (45)

test('every incident is well formed and its page renders', async () => {
  const slugs = new Set();
  for (const i of INCIDENTS) {
    assert.match(i.slug, /^[a-z0-9-]+$/);
    assert.ok(!slugs.has(i.slug)); slugs.add(i.slug);
    assert.ok(i.sources.length >= 2, `${i.slug} needs two sources`);
    for (const s of i.sources) assert.match(s.url, /^https:\/\//);
    const seen = new Set();
    for (const e of i.extensions) {
      assert.match(e.id, /^[a-p]{32}$/, e.name);
      assert.ok(['chrome', 'edge'].includes(e.store), e.name);
      assert.ok(!seen.has(e.id), `duplicate ${e.id}`); seen.add(e.id);
    }
    const html = await body(`/incidents/${i.slug}`);
    assert.match(html, new RegExp(`Reported ${i.reported}`));
    assert.equal(/crypto wallet/.test(html), Boolean(i.wallets), i.slug);
  }
  const red = INCIDENTS.find((i) => i.slug === 'reddirection-2025');
  assert.equal(red.extensions.length, 18);
  assert.equal(red.extensions.filter((e) => e.store === 'chrome').length, 10);
  const html = await body('/incidents/reddirection-2025');
  assert.match(html, /Extensions in the report \(18\)/);
  assert.doesNotMatch(html, /Bought from their original developers/);
  const index = await body('/incidents');
  for (const i of INCIDENTS) assert.match(index, new RegExp(`href="/incidents/${i.slug}"`));
});

// --- Report (46)

test('report numbers add up and its links work', async () => {
  const usersOf = (s) => Number(String(s).replace(/\D/g, ''));
  assert.equal(Object.values(REPORT.access).reduce((a, b) => a + b, 0), REPORT.analyzed);
  assert.equal(REPORT.lowRisk + REPORT.highRisk, REPORT.analyzed);
  assert.ok(REPORT.staleTwoYears <= REPORT.staleYear);
  assert.ok(REPORT.staleBroad <= REPORT.staleYear);
  assert.ok(REPORT.broadNonTrader <= REPORT.broad);
  assert.equal(REPORT.stale.reduce((sum, e) => sum + usersOf(e.users), 0), REPORT.staleBroadInstalls);
  assert.equal(POPULAR.length, REPORT.listed);
  for (const n of Object.values(REPORT.permissions)) assert.ok(n <= REPORT.analyzed);

  const html = await body('/report/popular-chrome-extensions-2026');
  const links = [...new Set([...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]))];
  for (const path of links) assert.ok([200, 301].includes((await get(path)).status), path);
  assert.match(html, /href="\/incidents\/superior-2026"/);
});

test('/report redirects to the report', async () => {
  for (const path of ['/report', '/report/']) {
    const res = await get(path);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('Location'), '/report/popular-chrome-extensions-2026');
  }
});

// --- 404 (47)

test('the 404 page links back and is not indexed', async () => {
  const res = await get('/old-page');
  const html = await res.text();
  assert.equal(res.status, 404);
  assert.match(html, /<meta name="robots" content="noindex">/);
  for (const href of ['/', '/popular', '/report/popular-chrome-extensions-2026', '/incidents']) {
    assert.match(html, new RegExp(`href="${href}"`));
  }
});

// --- Performance budget (48)

test('pages are small and load nothing that blocks rendering', async () => {
  for (const path of ['/', '/popular', '/how-it-works', `/extension/dark-reader/${DARK}`, '/report/popular-chrome-extensions-2026']) {
    const html = await body(path);
    assert.ok(html.length < 60_000, `${path} is ${html.length} bytes`);
    assert.doesNotMatch(html, /<link rel="stylesheet"/, path);
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/, path);
    assert.doesNotMatch(html, /src="http:/, path);
  }
});

// --- Accessibility (49)

test('the checker has labels, a skip link, focus styles and one h1', async () => {
  for (const path of ['/', `/extension/dark-reader/${DARK}`, '/popular', '/nope']) {
    const html = await body(path);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<a class="skip" href="#main">/);
    assert.match(html, /<main [^>]*id="main"/);
    assert.match(html, /:focus-visible \{ outline: 3px/);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, path);
    for (const input of html.match(/<input [^>]+>/g) ?? []) assert.match(input, /aria-label="[^"]+"/);
    for (const img of html.match(/<img [^>]+>/g) ?? []) assert.match(img, /alt="/);
  }
});

// --- Tinyward links (56)

test('every page links to Unseen and names Tinyward', async () => {
  for (const path of ['/', '/popular', '/privacy', '/how-it-works', '/incidents', '/nope', `/extension/dark-reader/${DARK}`]) {
    const html = await body(path);
    assert.match(html, /A Tinyward project/, path);
    assert.match(html, /href="https:\/\/laboskiriste\.github\.io\/unseen\/"/, path);
  }
});

// --- Favicon and manifest (57)

test('favicon and web manifest', async () => {
  const icon = await get('/favicon.svg');
  assert.equal(icon.headers.get('Content-Type'), 'image/svg+xml');
  assert.match(await icon.text(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  const manifest = await get('/manifest.webmanifest');
  assert.equal(manifest.headers.get('Content-Type'), 'application/manifest+json');
  const data = await manifest.json();
  assert.equal(data.start_url, '/');
  assert.equal(data.icons[0].src, '/favicon.svg');
  assert.match(manifest.headers.get('Content-Security-Policy'), /manifest-src 'self'/);
});
