# Extension Guardian

A browser extension that warns when an installed extension changes owner, gains permissions or is removed from its store. It is part of the Tinyward family; shared rules are in `../CLAUDE.md`.

| Folder | What it is |
|---|---|
| `extension/` | The extension. Chrome MV3, with a Firefox build via `dev/package-firefox.mjs`. No build step. |
| `server/` | A Cloudflare Worker at https://app.extensionguardian.workers.dev. It reads Chrome Web Store pages for the extension and serves the web checker site, the report and the privacy page. |
| `store/` | Store listing text and screenshots for Chrome, Firefox and Edge. Zip files are git-ignored. |

## Commands

| Task | Command |
|---|---|
| Extension tests | `cd extension && npm test` |
| Server tests | `cd server && npm test` |
| Local server | `cd server && npm start` (runs on :8787) |
| Chrome package | `cd extension && npm run package` (writes `store/extension-guardian-<version>.zip`) |
| Firefox package | `cd extension && npm run package:firefox` |
| Deploy | `cd server && npx wrangler deploy` |

Always ask the user before deploying.

## Notes

- **Cloudflare free plan:** at most 50 subrequests per call, so the server caps store fetches at 20 per request.
- **Firefox add-on ID:** `extension-guardian@laboskiriste`. Firefox asks addons.mozilla.org directly and never contacts our server.
- **Edge:** Partner Center enrollment is blocked by a bug on Microsoft's side.
