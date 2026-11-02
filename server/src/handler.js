// Looks up extensions on the Chrome Web Store for the browser extension.
// Chrome blocks extensions from reading the store, so this runs on a server.
// Only public store data passes through here: the request carries extension
// IDs and nothing about the user.
import { parseStorePage } from '../../extension/src/lib/store.js';
import { PRIVACY_HTML } from './privacy.js';
import {
  extractId, extensionPath, renderCheckPage, renderHowPage, renderIncidentPage, renderIncidentsPage, renderNotFoundPage, renderPopularPage, renderReportPage, renderSitemap,
  REPORT_PATH, OG_DEFAULT_PATH, OG_REPORT_PATH, ROBOTS, FAVICON_PATH, FAVICON_SVG, HOW_PATH, INCIDENTS_PATH, MANIFEST, MANIFEST_PATH,
} from './check-page.js';
import { findIncident, INCIDENTS } from './incidents.js';
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

const STORE_TIMEOUT_MS = 10000;
const MAX_QUERY = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

// Pages that only change with a deploy can sit in the browser for an hour.
// API results never do: the extension keeps its own copy, and a "busy" or
// "error" result must not stick when it retries.
const STATIC = 'public, max-age=3600';
const SHORT = 'public, max-age=600';
const NO_STORE = 'no-store';

function json(body, status = 200, cacheControl = NO_STORE) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
  });
}

// The cache is a help, never a requirement: if KV fails or its daily write
// quota runs out, lookups go to the store and results are still served.
async function cached(cache, key) {
  try {
    return await (await cache?.match(key))?.json();
  } catch {
    return undefined;
  }
}

async function lookup(id, { fetchImpl, cache, budget = null }) {
  const key = `https://cache.internal/store/${id}`;
  const hit = await cached(cache, key);
  if (hit) return hit;
  if (budget) {
    if (budget.left <= 0) return { status: 'error', code: 'busy' };
    budget.left -= 1;
  }

  // A store that hangs would otherwise hold the whole request until Cloudflare cuts it off.
  const res = await fetchImpl(`https://chromewebstore.google.com/detail/${id}?hl=en`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  let info;
  if (res.status === 404) info = { status: 'not_found' };
  else if (!res.ok) return { status: 'error', code: res.status };
  else info = parseStorePage(await res.text());

  // A listed page always shows something about its developer: a name, an
  // email or at least a website (Trocker's shows only a website). With none
  // of them the store layout has probably changed: an error makes the
  // extension keep its last good data instead of silently losing the owner check.
  if (info.status === 'ok' && !info.offeredBy && !info.developerName && !info.email && !info.website) {
    return { status: 'error', code: 'parse' };
  }

  info.checkedAt = Date.now();
  // Only listed extensions are cached. Anyone can ask about made-up ids, and
  // caching those "not found" answers would use up the daily KV writes.
  if (info.status === 'ok') {
    await cache?.put(key, new Response(JSON.stringify(info), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    })).catch(() => {});
  }
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

const html = (body, status = 200, cacheControl = STATIC) => new Response(body, {
  status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl },
});
const redirect = (location, status = 302, cacheControl = NO_STORE) => new Response(null, {
  status, headers: { Location: location, 'Cache-Control': cacheControl },
});
const text = (body, type, cacheControl = STATIC) => new Response(body, {
  headers: { 'Content-Type': type, 'Cache-Control': cacheControl },
});

// The store didn't answer or the lookup failed. The page says so; a 503 keeps
// search engines from indexing it and tells them to come back.
const UNAVAILABLE = { status: 503, cacheControl: NO_STORE };

// Failed lookups carry a short code, never an internal error message.
const failed = () => ({ status: 'error', code: 'unreachable' });

// The public checker site: home page, one page per extension, popular list,
// and what search engines need to find them. Returns null for other paths.
async function checkerPage(url, { fetchImpl, cache, limited }) {
  const safeLookup = async (id) => ((await limited()) ? { status: 'error', code: 'busy' } : lookup(id, { fetchImpl, cache }).catch(failed));
  if (url.pathname === '/') {
    // The query is echoed back in the form, so a pasted novel is cut short.
    const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY);
    const id = extractId(query);
    if (!id) return html(renderCheckPage({ query, popular: POPULAR }), 200, query ? NO_STORE : STATIC);
    const info = await safeLookup(id);
    return redirect(info.status === 'ok' ? extensionPath(id, info.title) : `/extension/${id}`);
  }
  const match = /^\/extension\/(?:[a-z0-9-]+\/)?([a-p]{32})\/?$/.exec(url.pathname);
  if (match) {
    const info = await safeLookup(match[1]);
    const page = renderCheckPage({ id: match[1], info });
    return info.status === 'error' ? html(page, UNAVAILABLE.status, UNAVAILABLE.cacheControl) : html(page, 200, SHORT);
  }
  if (url.pathname === '/popular') return html(renderPopularPage(POPULAR));
  // People type the short address; the report lives under its full name.
  if (url.pathname === '/report' || url.pathname === '/report/') return redirect(REPORT_PATH, 301, STATIC);
  if (url.pathname === OG_DEFAULT_PATH || url.pathname === OG_REPORT_PATH) {
    const png = Uint8Array.from(atob(url.pathname === OG_REPORT_PATH ? OG_REPORT : OG_DEFAULT), (c) => c.charCodeAt(0));
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
  }
  if (url.pathname === REPORT_PATH) return html(renderReportPage(REPORT));
  if (url.pathname === `${REPORT_PATH}.json`) {
    return new Response(JSON.stringify(REPORT, null, 1), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': STATIC } });
  }
  if (url.pathname === INCIDENTS_PATH) return html(renderIncidentsPage(INCIDENTS));
  if (url.pathname === HOW_PATH) return html(renderHowPage());
  if (url.pathname === FAVICON_PATH) return text(FAVICON_SVG, 'image/svg+xml', 'public, max-age=86400');
  if (url.pathname === MANIFEST_PATH) return text(MANIFEST, 'application/manifest+json');
  const incident = findIncident(/^\/incidents\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1]);
  if (incident) return html(renderIncidentPage(incident));
  if (url.pathname === '/sitemap.xml') {
    return text(renderSitemap(POPULAR), 'application/xml; charset=utf-8');
  }
  if (url.pathname === '/robots.txt') return text(ROBOTS, 'text/plain; charset=utf-8');
  // Google Search Console ownership check. Keep it, or the site loses verification.
  if (url.pathname === `/${GOOGLE_VERIFICATION}`) return html(`google-site-verification: ${GOOGLE_VERIFICATION}`);
  return null;
}

// The site has no scripts, so the policy allows none. Inline styles are used
// throughout; store icons come from Google's image host.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https://lh3.googleusercontent.com; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export async function handleRequest(request, options) {
  let response;
  try {
    response = await route(request, options);
  } catch {
    // Nothing about the request or the error goes into the response.
    response = json({ error: 'internal error' }, 500);
  }
  // HEAD gets the same status and headers as GET, without the body.
  if (request.method === 'HEAD') response = new Response(null, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

const TOO_MANY = () => {
  const res = json({ error: 'too many requests, try again in a minute' }, 429);
  res.headers.set('Retry-After', '60');
  return res;
};

// `limit(ip)` answers false once an address has asked too often in the last
// minute (a Cloudflare rate limiter; the count is kept for a minute and not logged).
async function route(request, { fetchImpl = fetch, cache = null, limit = null } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
  const url = new URL(request.url);
  const read = request.method === 'GET' || request.method === 'HEAD';
  // Only asked once per request, and only for requests that look up the store.
  let allowed;
  const limited = async () => {
    if (!limit) return false;
    allowed ??= await limit(request.headers.get('CF-Connecting-IP') ?? '').catch(() => true);
    return !allowed;
  };
  if (read && url.pathname === '/privacy') return html(PRIVACY_HTML);
  if (read) {
    const page = await checkerPage(url, { fetchImpl, cache, limited });
    if (page) return page;
  }
  if (read && !url.pathname.startsWith('/v1/')) return html(renderNotFoundPage(), 404, 'public, max-age=300');
  if (!read || url.pathname !== '/v1/store') return json({ error: 'not found' }, 404);

  const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter((id) => ID_PATTERN.test(id)))];
  if (!ids.length) return json({ error: 'pass extension ids as ?ids=a,b,c' }, 400);
  if (ids.length > MAX_IDS) return json({ error: `at most ${MAX_IDS} ids per request` }, 400);

  if (await limited()) return TOO_MANY();
  const budget = { left: MAX_STORE_FETCHES };
  const infos = await mapLimited(ids, CONCURRENCY, (id) =>
    lookup(id, { fetchImpl, cache, budget }).catch(failed));
  return json({ results: Object.fromEntries(ids.map((id, i) => [id, infos[i]])) });
}
