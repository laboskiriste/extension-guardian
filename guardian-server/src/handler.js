// Looks up extensions on the Chrome Web Store for the browser extension.
// Chrome blocks extensions from reading the store, so this runs on a server.
// Only public store data passes through here: the request carries extension
// IDs and nothing about the user.
import { parseStorePage } from '../../extension-guardian/src/lib/store.js';
import { PRIVACY_HTML } from './privacy.js';

// Each id may need one store request; the Workers free plan allows 50 per call.
const MAX_IDS = 40;
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

async function lookup(id, { fetchImpl, cache }) {
  const key = `https://cache.internal/store/${id}`;
  const hit = await cache?.match(key);
  if (hit) return hit.json();

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

export async function handleRequest(request, { fetchImpl = fetch, cache = null } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/privacy') {
    return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (request.method !== 'GET' || url.pathname !== '/v1/store') return json({ error: 'not found' }, 404);

  const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter((id) => ID_PATTERN.test(id)))];
  if (!ids.length) return json({ error: 'pass extension ids as ?ids=a,b,c' }, 400);
  if (ids.length > MAX_IDS) return json({ error: `at most ${MAX_IDS} ids per request` }, 400);

  const infos = await mapLimited(ids, CONCURRENCY, (id) =>
    lookup(id, { fetchImpl, cache }).catch((err) => ({ status: 'error', message: err.message })));
  return json({ results: Object.fromEntries(ids.map((id, i) => [id, infos[i]])) });
}
