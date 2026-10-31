# Extension Guardian server

A Cloudflare Worker at https://app.extensionguardian.workers.dev. It reads public Chrome Web Store pages for the Chrome extension, because Chrome doesn't let extensions read the store, and it serves the web checker site.

It has no build step and no runtime dependencies. It keeps no logs and no analytics: `[observability]` is off in `wrangler.toml`, and nothing in the code records IP addresses.

## Commands

| Task | Command |
| --- | --- |
| Tests | `npm test` |
| Local server | `npm start` (http://localhost:8787, set `PORT` to change) |
| Deploy | `npx wrangler deploy` (ask first) |

The local server (`src/dev-server.js`) runs the same handler as the Worker, with an in-memory cache instead of Workers KV. It reads the live Chrome Web Store.

## Routes

| Path | What it serves | Cache-Control |
| --- | --- | --- |
| `GET /v1/store?ids=a,b,c` | Store info per extension ID, as JSON. At most 40 IDs; at most 20 store fetches per request, the rest come back as `{ "status": "error", "code": "busy" }` | `no-store` |
| `/` | Checker home; `/?q=<link or id>` redirects to the extension's page | 1 hour (redirects: `no-store`) |
| `/extension/<slug>/<id>`, `/extension/<id>` | One extension's checker page. 503 if the store didn't answer | 10 minutes (errors: `no-store`) |
| `/popular` | The 150 most-used extensions | 1 hour |
| `/report/popular-chrome-extensions-2026` and `.json` | The popular extensions report and its data. `/report` redirects here (301) | 1 hour |
| `/incidents`, `/incidents/<slug>` | Malware reports and the extensions they name | 1 hour |
| `/how-it-works` | FAQ | 1 hour |
| `/privacy` | Privacy policy, linked from the store listing | 1 hour |
| `/sitemap.xml`, `/robots.txt` | For search engines | 1 hour |
| `/og/default.png`, `/og/report.png` | Link preview images | 1 day |
| `/favicon.svg`, `/manifest.webmanifest` | Icon and web manifest | 1 day / 1 hour |
| `/google2567422271cb329d.html` | Google Search Console ownership check. Keep it | 1 hour |
| anything else | HTML 404 page, or JSON 404 under `/v1/` | 5 minutes |

Every response carries the security headers in `src/handler.js` (a strict Content Security Policy with no scripts, `nosniff`, `DENY` framing). `HEAD` works on every `GET` route.

## Files

| File | What it is |
| --- | --- |
| `src/worker.js` | Worker entry point; caches store lookups in Workers KV (`STORE_CACHE`) for 6 hours |
| `src/handler.js` | Routing, store lookups, limits, headers |
| `src/check-page.js` | All HTML pages, the sitemap and robots.txt |
| `src/incidents.js` | Malware reports, with sources. Add new ones at the top |
| `src/replacements.js` | What to use instead of well-known removed extensions. A copy of `extension/src/lib/replacements.js` |
| `src/popular.js`, `src/report-data.js` | Data snapshots for `/popular` and the report |
| `src/privacy.js` | Privacy policy |
| `src/og-images.js` | Link preview images, base64. Made with `tools/og-images.py` |

The store page parser is shared with the extension: `../extension/src/lib/store.js`.

## Limits

The Workers free plan allows 50 outgoing requests per call, and a store page costs two (it redirects). So `/v1/store` fetches at most 20 pages per request, and each fetch times out after 10 seconds.
