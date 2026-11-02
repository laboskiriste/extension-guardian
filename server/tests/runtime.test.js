import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/handler.js';
import { createDevServer } from '../src/dev-server.js';
import worker from '../src/worker.js';

const ID = 'a'.repeat(32);
const get = (path, fetchImpl, cache = null) => handleRequest(new Request(`http://x${path}`), { fetchImpl, cache });

// --- Store errors (52)

for (const status of [429, 500, 502, 503]) {
  test(`a ${status} from the store is a clear, uncached error`, async () => {
    const memory = new Map();
    const cache = { match: async (k) => memory.get(k), put: async (k, r) => { memory.set(k, r); } };
    const failing = async () => new Response('busy', { status });

    const api = await get(`/v1/store?ids=${ID}`, failing, cache);
    assert.equal(api.status, 200);
    assert.deepEqual((await api.json()).results[ID], { status: 'error', code: status });

    const page = await get(`/extension/${ID}`, failing, cache);
    assert.equal(page.status, 503);
    assert.equal(page.headers.get('Cache-Control'), 'no-store');
    const html = await page.text();
    assert.match(html, /The Chrome Web Store didn't answer just now/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(html, /rel="canonical"/);
    assert.equal(memory.size, 0);
  });
}

test('a network failure or timeout never leaks the error text', async () => {
  const throwing = async () => { throw new Error('connect ECONNREFUSED 10.0.0.1:443'); };
  const { results } = await (await get(`/v1/store?ids=${ID}`, throwing)).json();
  assert.deepEqual(results[ID], { status: 'error', code: 'unreachable' });
  assert.doesNotMatch(await (await get(`/extension/${ID}`, throwing)).text(), /ECONNREFUSED/);
});

test('store requests carry a timeout', async () => {
  let signal;
  await get(`/v1/store?ids=${ID}`, async (url, init) => { signal = init.signal; return new Response('', { status: 404 }); });
  assert.ok(signal instanceof AbortSignal);
});

// --- The dev server answers like the Worker (51)

test('the dev server returns the same status, headers and bytes as the handler', async (t) => {
  const fetchImpl = async () => new Response('', { status: 404 });
  const server = createDevServer({ port: 0, fetchImpl, log: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const path of ['/', '/og/default.png', '/robots.txt', '/nope', `/extension/${ID}`, '/v1/store?ids=bad', '/report']) {
    const [viaNode, direct] = await Promise.all([
      fetch(`${base}${path}`, { redirect: 'manual' }),
      handleRequest(new Request(`http://localhost${path}`), { fetchImpl, cache: null }),
    ]);
    assert.equal(viaNode.status, direct.status, path);
    for (const name of ['content-type', 'cache-control', 'content-security-policy', 'location']) {
      assert.equal(viaNode.headers.get(name), direct.headers.get(name), `${path} ${name}`);
    }
    const [a, b] = await Promise.all([viaNode.arrayBuffer(), direct.arrayBuffer()]);
    assert.deepEqual(new Uint8Array(a), new Uint8Array(b), path);
  }
});

// --- The Worker entry point

test('the Worker caches store lookups in KV with at least a 60 second TTL', async () => {
  const puts = [];
  const kv = { get: async () => null, put: async (key, value, options) => { puts.push({ key, value, options }); } };
  const res = await worker.fetch(new Request('http://x/robots.txt'), { STORE_CACHE: kv });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  // Without the binding it still runs.
  assert.equal((await worker.fetch(new Request('http://x/popular'), {})).status, 200);
  assert.equal(puts.length, 0);

  // The Worker uses the global fetch for the store; stand in for it here.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<title>X - Chrome Web Store</title><li><div>Developer</div><div><div>Alice<br>Street 1</div></div></li>');
  try {
    const { results } = await (await worker.fetch(new Request(`http://x/v1/store?ids=${ID}`), { STORE_CACHE: kv })).json();
    assert.equal(results[ID].developerName, 'Alice');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, `https://cache.internal/store/${ID}`);
  assert.equal(puts[0].options.expirationTtl, 6 * 60 * 60);
});

test('a failing KV never fails the lookup', async () => {
  const kv = { get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('quota'); } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<title>X - Chrome Web Store</title><li><div>Developer</div><div><div>Alice<br>Street 1</div></div></li>');
  try {
    const { results } = await (await worker.fetch(new Request(`http://x/v1/store?ids=${ID}`), { STORE_CACHE: kv })).json();
    assert.equal(results[ID].status, 'ok');
    assert.equal(results[ID].developerName, 'Alice');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the Worker limits store lookups per IP address', async () => {
  const seen = [];
  const RATE_LIMITER = { limit: async ({ key }) => { seen.push(key); return { success: false }; } };
  const req = (path) => new Request(`http://x${path}`, { headers: { 'CF-Connecting-IP': '203.0.113.9' } });
  const res = await worker.fetch(req(`/v1/store?ids=${ID}`), { RATE_LIMITER });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '60');
  assert.deepEqual(seen, ['203.0.113.9']);
  // Pages that don't look anything up are never limited.
  assert.equal((await worker.fetch(req('/popular'), { RATE_LIMITER })).status, 200);
  assert.equal(seen.length, 1);
  // The checker page says it's busy instead of looking up the store.
  assert.equal((await worker.fetch(req(`/extension/${ID}`), { RATE_LIMITER })).status, 503);
});
