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

test('rejects bad requests', async () => {
  assert.equal((await get('/v1/store?ids=not-an-id')).status, 400);
  assert.equal((await get(`/v1/store?ids=${Array(41).fill(0).map((_, i) => String.fromCharCode(97 + (i % 16)).repeat(31) + String.fromCharCode(97 + Math.floor(i / 16))).join(',')}`)).status, 400);
  assert.equal((await get('/other')).status, 404);
});
