// Cloudflare Workers entry point.
//
// The Workers Cache API does nothing on *.workers.dev addresses, so results
// are cached in Workers KV (binding STORE_CACHE) instead. Without the binding
// the worker still runs, just without a cache.
import { handleRequest } from './handler.js';

function kvCache(kv) {
  if (!kv) return null;
  return {
    async match(key) {
      const body = await kv.get(key);
      return body == null ? undefined : new Response(body);
    },
    async put(key, response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control'))?.[1] ?? 0);
      // KV needs a TTL of at least 60 seconds.
      await kv.put(key, await response.text(), { expirationTtl: Math.max(60, maxAge) });
    },
  };
}

export default {
  fetch(request, env) {
    return handleRequest(request, { cache: kvCache(env.STORE_CACHE) });
  },
};
