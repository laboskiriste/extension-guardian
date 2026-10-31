# Extension Guardian

A browser extension for Chrome (and Edge, Brave) and Firefox that watches your other extensions and warns you when one becomes dangerous. Current version: 0.1.4. Changes are in [CHANGELOG.md](CHANGELOG.md).

- **Two ratings** for every installed extension:
  - **Access** (full, limited, basic): what its permissions let it do, explained in plain language.
  - **Risk** (high, watch, low): whether to trust it. Critical signals (new owner, removed from the store, sideloaded, updates from outside the store) always mean high risk. Store signals adjust the rest: few users and no updates for years raise it, a large user base, recent updates and a registered business lower it.
- **New permissions after an update**, such as an extension that suddenly asks to read all websites.
- **Ownership change**: the developer listed in the Chrome Web Store is different from before, which often means the extension was sold.
- **Removed from the store**: Google often takes down malware this way.
- **Sideloaded extensions**, and extensions that update from outside the store.
- **Help after a removal**: what to do next, and a trusted replacement for well-known extensions such as uBlock Origin (`src/lib/replacements.js`).
- **Keep off on these sites** (Chrome only): turns an extension off while one of the user's sites is in the active tab, and back on after. It needs the optional `tabs` permission, asked for when the user adds a first site. The tab address is checked on the device only.

Risk scoring and change detection run locally. Chrome does not let extensions read Chrome Web Store pages, so developer information comes from a small server, `../server`. The extension sends it only the IDs of installed extensions, nothing about the user. In Firefox, the extension asks the public addons.mozilla.org API directly and never contacts our server.

## Try it

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this `extension` folder.
3. Click the shield icon in the toolbar.

The extension uses the deployed server at `https://app.extensionguardian.workers.dev` (Cloudflare Workers, results cached in Workers KV for 6 hours). The server allows any origin (CORS), so the manifest needs no host permission for it and Chrome shows no warning about it at install. To change the server, run `npm run deploy` in `../server`, then update `src/config.js`. To work against a local server instead, run `npm start` in `../server` and use `http://localhost:8787` there.

The first run records how things look now, opens a welcome page and checks the store in the background. After that it checks the store every 6 hours, and checks right away whenever an extension is installed or updated. Several updates at once share one server call.

## Develop

```bash
npm test                 # all tests, including node --check on every script
npm run package          # Chrome zip in ../store
npm run package:firefox  # Firefox zip in ../store, built in build/firefox
```

`dev/preview.html` shows the popup with sample data in a normal browser tab. Serve the folder (`python3 -m http.server`) and open `/dev/preview.html`. Query flags show other states and can be combined: `?firefox`, `?edge`, `?rate`, `?tabs`, `?offline`, `?empty`, `?many`, `?open=<id>`, `?frame`.

| Path | What it does |
| --- | --- |
| `src/background.js` | Service worker: scans, store checks, alerts, badge, notifications |
| `src/lib/risk.js` | Risk score |
| `src/lib/permissions.js` | Permission weights and plain-language text |
| `src/lib/changes.js` | Detects new permissions, owner changes and store removal |
| `src/lib/store.js` | Parses Chrome Web Store pages (used by the server), asks the server for results, and asks Firefox Add-ons directly in Firefox |
| `src/lib/sites.js` | Keep off on these sites: site input and which extensions to turn off or on |
| `src/lib/replacements.js` | Trusted replacements for well-known extensions removed from the store |
| `src/lib/report.js` | The list as plain text, for "Copy the list as text" |
| `src/lib/platform.js` | Chrome or Firefox, and which store to name |
| `src/lib/family.js` | Other Tinyward extensions, generated from `../../family` |
| `src/config.js` | Server URL |
| `../server/` | Server that reads the store: Cloudflare Worker, plus a Node dev server |
| `src/popup/` | Popup UI (also opens in a tab) |
| `src/welcome/` | Page opened once after install |
| `dev/firefox-manifest.mjs` | Turns the Chrome manifest into the Firefox one |

The Chrome Web Store has no API, so `store.js` parses the page HTML. If Google changes the layout, the parser can break. In that case the background script stops reporting removals instead of flagging every extension, and the tests in `tests/fixtures` show the HTML it expects.
