// Looks up extensions on the Chrome Web Store for the browser extension.
// Chrome blocks extensions from reading the store, so this runs on a server.
// Only public store data passes through here: the request carries extension
// IDs and nothing about the user.
import { parseStorePage } from '../../extension-guardian/src/lib/store.js';
import { PRIVACY_HTML } from './privacy.js';
import {
  extractId, extensionPath, renderCheckPage, renderIncidentPage, renderPopularPage, renderReportPage, renderSitemap, REPORT_PATH, OG_DEFAULT_PATH, OG_REPORT_PATH, ROBOTS,
} from './check-page.js';
import { findIncident } from './incidents.js';
import { POPULAR } from './popular.js';
import { REPORT } from './report-data.js';
import { OG_DEFAULT, OG_REPORT } from './og-images.js';

const MAX_IDS = 40;
// The Workers free plan allows 50 outgoing requests per call, and each store
// page costs two (it redirects to a URL with the extension's name). Ids past
// this budget get status "error", which the extension retries on its next check.
const MAX_STORE_FETCHES = 20;
const CONCURRENCY = 4;
const CACHE_SECONDS = 6 * 60 * 60;
const ID_PATTERN = /^[a-p]{32}$/;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function lookup(id, { fetchImpl, cache, budget = null }) {
  const key = `https://cache.internal/store/${id}`;
  const hit = await cache?.match(key);
  if (hit) return hit.json();
  if (budget) {
    if (budget.left <= 0) return { status: 'error', code: 'busy' };
    budget.left -= 1;
  }

  const res = await fetchImpl(`https://chromewebstore.google.com/detail/${id}?hl=en`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
  });
  let info;
  if (res.status === 404) info = { status: 'not_found' };
  else if (!res.ok) return { status: 'error', code: res.status };
  else info = parseStorePage(await res.text());

  info.checkedAt = Date.now();
  await cache?.put(key, new Response(JSON.stringify(info), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
  }));
  return info;
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const GOOGLE_VERIFICATION = 'google2567422271cb329d.html';

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// The public checker site: home page, one page per extension, popular list,
// and what search engines need to find them. Returns null for other paths.
async function checkerPage(url, { fetchImpl, cache }) {
  const safeLookup = (id) => lookup(id, { fetchImpl, cache }).catch((err) => ({ status: 'error', message: err.message }));
  if (url.pathname === '/') {
    const query = url.searchParams.get('q') ?? '';
    const id = extractId(query);
    if (!id) return html(renderCheckPage({ query, popular: POPULAR }));
    const info = await safeLookup(id);
    const target = info.status === 'ok' ? extensionPath(id, info.title) : `/extension/${id}`;
    return new Response(null, { status: 302, headers: { Location: target } });
  }
  const match = /^\/extension\/(?:[a-z0-9-]+\/)?([a-p]{32})\/?$/.exec(url.pathname);
  if (match) return html(renderCheckPage({ id: match[1], info: await safeLookup(match[1]) }));
  if (url.pathname === '/popular') return html(renderPopularPage(POPULAR));
  if (url.pathname === OG_DEFAULT_PATH || url.pathname === OG_REPORT_PATH) {
    const png = Uint8Array.from(atob(url.pathname === OG_REPORT_PATH ? OG_REPORT : OG_DEFAULT), (c) => c.charCodeAt(0));
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
  }
  if (url.pathname === REPORT_PATH) return html(renderReportPage(REPORT));
  if (url.pathname === `${REPORT_PATH}.json`) {
    return new Response(JSON.stringify(REPORT, null, 1), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const incident = findIncident(/^\/incidents\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1]);
  if (incident) return html(renderIncidentPage(incident));
  if (url.pathname === '/sitemap.xml') {
    return new Response(renderSitemap(POPULAR), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
  if (url.pathname === '/robots.txt') return new Response(ROBOTS, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  // Google Search Console ownership check. Keep it, or the site loses verification.
  if (url.pathname === `/${GOOGLE_VERIFICATION}`) return html(`google-site-verification: ${GOOGLE_VERIFICATION}`);
  return null;
}

export async function handleRequest(request, { fetchImpl = fetch, cache = null } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/privacy') {
    return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (request.method === 'GET') {
    const page = await checkerPage(url, { fetchImpl, cache });
    if (page) return page;
  }
  if (request.method !== 'GET' || url.pathname !== '/v1/store') return json({ error: 'not found' }, 404);

  const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter((id) => ID_PATTERN.test(id)))];
  if (!ids.length) return json({ error: 'pass extension ids as ?ids=a,b,c' }, 400);
  if (ids.length > MAX_IDS) return json({ error: `at most ${MAX_IDS} ids per request` }, 400);

  const budget = { left: MAX_STORE_FETCHES };
  const infos = await mapLimited(ids, CONCURRENCY, (id) =>
    lookup(id, { fetchImpl, cache, budget }).catch((err) => ({ status: 'error', message: err.message })));
  return json({ results: Object.fromEntries(ids.map((id, i) => [id, infos[i]])) });
}
