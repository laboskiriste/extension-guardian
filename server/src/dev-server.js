// Runs the same handler with plain Node, for local testing without Cloudflare.
import { createServer } from 'node:http';
import { handleRequest } from './handler.js';

const PORT = Number(process.env.PORT ?? 8787);

// A small in-memory stand-in for the Cloudflare cache.
const memory = new Map();
const cache = {
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

createServer(async (req, res) => {
  const response = await handleRequest(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method }), { cache });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
  console.log(req.method, req.url, response.status);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Extension Guardian server on http://localhost:${PORT}`);
});
