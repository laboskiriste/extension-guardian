# Changelog

Versions of the Extension Guardian browser extension. The server and web checker in `../server` are deployed separately and are not listed here.

## 0.1.5 (not released yet)

Draft notes. The version in `manifest.json` is still 0.1.4.

- **Keep off on these sites:** now covers every open tab, not only the active one. A bank left open in a background tab keeps the extension off until that tab is closed or leaves the site. No new permission.
- **Keep off on these sites:** an extension you turn back on by hand while one of your sites is open now stays on until you close it, instead of being turned off again on the next page.
- **Keep off on these sites:** the site box says when a site isn't valid or is already on the list. It accepts international domain names, IP addresses, ports and `*.example.com`.
- **Fewer repeated alerts:** the same warning isn't added or notified again within a week, for example when a store page flickers.
- **Fewer server calls:** when several extensions update at once, Guardian checks them in one request.
- **Cleanup:** alerts and data for extensions you removed are deleted, including ones removed while Guardian was off.
- **Fix:** two alerts created at the same moment could share an id, so dismissing one dismissed both.
- **Fix:** a check started right after install could flag every existing extension as new.
- **Popup:** a clear notice with "Try again" when the server or Firefox Add-ons can't be reached.
- **Popup:** a filter box once you have 8 or more extensions.
- **Popup:** "Copy the list as text" copies your extensions and their ratings. Nothing is sent anywhere.
- **Popup:** keyboard focus stays in place after every update, and more buttons have labels for screen readers.
- **More permissions explained**, such as passkey access (`webAuthenticationProxy`), user scripts, recently closed tabs and your account email.
- **Store parser:** reads "1 user" and decodes more HTML entities in developer names. This parser also runs on the server, so it applies there after the next deploy.
- **Welcome page:** mentions Keep off on these sites (Chrome) and links to the source code and privacy policy.
- **New owner detection:** a sale to a company is no longer missed. Non-trader listings show only "Offered by" and trader listings only the legal name, so when an extension switches from one to the other the two names are now compared. A developer registering as a business under the same name (or "Ltd", "Inc." and so on) isn't flagged; a new name with the same email is a medium alert.
- **Firefox:** adding or removing a co-author is a medium "authors changed" alert instead of "may have a new owner". Losing every original author is still a new owner.
- **Keep off on these sites:** runs on its own queue, so a slow store check never delays turning an extension off when a site opens.
- **Keep off on these sites:** can't leave an extension off for good. Guardian saves which extensions it turned off before turning them off, checks again every time it wakes, and turns everything back on if you take back the tabs permission.
- **Keep off on these sites:** the popup says that private windows count only if Guardian is allowed in incognito.
- **Store checks time out** after 15 seconds instead of waiting indefinitely.
- **Popup:** when the server answers but could check none of your extensions, it says so instead of "checked just now".
- **Server (deployed separately):** keeps working when its cache (Workers KV) fails or runs out of daily writes; no longer caches "not found" for made-up ids; limits store lookups to 30 per IP address per minute; treats a listed page with no developer as an error, so a store layout change can't silently turn off owner checks; parses pages several times faster. A daily GitHub Actions canary checks the parser against three known listings.

## 0.1.4 (2026-10-31)

- **Help after removal from the store:** the popup explains why a missing extension matters and what to do. For well-known Manifest V2 extensions it names a trusted replacement: uBlock Origin Lite for uBlock Origin and uMatrix, and Chrome's own settings for HTTPS Everywhere and The Great Suspender.
- **Keep off on these sites** (Chrome): turns an extension off while one of your sites is in the active tab, and back on when you leave. Uses the optional `tabs` permission, asked for only when you add a first site.
- **Welcome page** opened once after install.

## 0.1.3 (2026-10-31)

- **Firefox version:** checks developers against the public Firefox Add-ons API instead of our server. Add-ons that were never listed are shown as "not listed", not "removed".
- "More from Tinyward" link in the popup.

## 0.1.2 (2026-10-30)

- Sends at most 20 extension IDs per server request, to match the server's limit.
- Recognizes extensions installed from Edge Add-ons, and links the rating prompt to the Edge store when Guardian came from there.

## 0.1.1 (2026-10-28)

- Asks once for a store rating after a week of use, never while a serious alert is open.

## 0.1.0 (2026-10-28)

First release.

- Access and risk ratings for every installed extension.
- Warns when an extension gains permissions, changes owner, is removed from the Chrome Web Store, was sideloaded, or updates from outside the store.
