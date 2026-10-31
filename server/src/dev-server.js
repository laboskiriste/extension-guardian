// Runs the same handler with plain Node, for local testing without Cloudflare.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { handleRequest } from './handler.js';

// A small in-memory stand-in for the Cloudflare cache.
export function memoryCache() {
  const memory = new Map();
  return {
    async match(key) {
      const entry = memory.get(key);
      if (!entry || entry.expires < Date.now()) return undefined;
      return new Response(entry.body);
    },
    async put(key, response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control'))?.[1] ?? 0);
      memory.set(key, { body: await response.text(), expires: Date.now() + maxAge * 1000 });
    },
  };
}

// A Node HTTP server that answers exactly like the Worker. The body is passed
// on as bytes, so images arrive intact.
export function createDevServer({ port = 8787, cache = memoryCache(), fetchImpl, log = true } = {}) {
  return createServer(async (req, res) => {
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method });
    const response = await handleRequest(request, { cache, fetchImpl });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    if (log) console.log(req.method, req.url, response.status);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT ?? 8787);
  createDevServer({ port }).listen(port, '127.0.0.1', () => {
    console.log(`Extension Guardian server on http://localhost:${port}`);
  });
}
