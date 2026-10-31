# Firefox Add-ons listing – Extension Guardian

Package: `store/extension-guardian-0.1.2-firefox.zip` (rebuild with `npm run package:firefox` in `extension`).

## Try it first (1 minute)

1. In Firefox, open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `extension/build/firefox/manifest.json`.
3. Click the toolbar icon, then **Check now**. Your add-ons should show who makes them; one you installed from a file says "Not listed on Firefox Add-ons".

The temporary add-on goes away when Firefox restarts.

## How to submit

1. Sign in or create a Firefox account at https://addons.mozilla.org/developers/ (free).
2. Click **Submit a New Add-on** → **On this site** → upload the zip.
3. "Do you need to submit source code?" → **No**. The code isn't minified or bundled.
4. Fill in the fields below and submit. Automated checks run at once; a human review can follow later.

## Describe your add-on

**Name**: Extension Guardian

**Add-on URL**: `extension-guardian`

**Summary** (max 250 characters)

```
Warns you when an add-on you use changes owner, asks for new permissions or is pulled from Firefox Add-ons, and rates what each one can access and how far to trust it.
```

**Description**

```
Add-ons can see a lot: your email, your bank, everything you type. Most are honest. But add-ons get sold, and new owners sometimes turn a trusted tool into adware or spyware. Firefox installs the update, and nothing tells you that someone else is now behind it.

Extension Guardian watches your add-ons so you don't have to.

WHAT IT CHECKS
• New owner: warns you when the authors listed on Firefox Add-ons change, the most common sign of a sale.
• New permissions: tells you when an update asks for more access, like reading every website.
• Removed from Firefox Add-ons: Mozilla takes down malicious add-ons. If one you have disappears, you'll know.
• Installed behind your back: flags add-ons that another program added, and ones that aren't listed on Firefox Add-ons at all.

TWO CLEAR RATINGS
• Access: what each add-on can do (full, limited or basic), in plain language.
• Risk: whether to trust it, from real signals: who makes it, how many people use it, whether it's maintained, and the warnings above.

A password manager needs full access to work, so full access alone doesn't mean danger. Extension Guardian tells the two apart, so you only get alerts that matter.

PRIVATE BY DESIGN
• Your list of add-ons and all results stay on your device.
• Developer checks go straight to the public Firefox Add-ons API. Nothing is sent to us.
• No ads, no analytics, no tracking.
• Open source (MIT): https://github.com/laboskiriste/extension-guardian

Firefox doesn't let one add-on turn off or remove another, so you do that yourself in about:addons.
```

**Categories**: Privacy & Security

**Tags**: security, privacy, permissions

**Support email**: leave empty (or a personal address you're fine making public)

**Support website**

```
https://github.com/laboskiriste/extension-guardian/issues
```

**Homepage**

```
https://app.extensionguardian.workers.dev/
```

**License**: MIT License

**Privacy policy**: "This add-on has a privacy policy" → paste:

```
Extension Guardian keeps your list of add-ons and all results on your device. To check developers, it asks the public Firefox Add-ons API (addons.mozilla.org) for each installed add-on's listing by its ID. Nothing is sent to the developer of Extension Guardian. No ads, analytics or tracking. Full policy: https://app.extensionguardian.workers.dev/privacy
```

**Notes to reviewer**

```
Extension Guardian lists the user's installed add-ons with the management permission and rates them. It never changes another add-on.

Developer checks call https://addons.mozilla.org/api/v5/addons/addon/<id>/ for each installed add-on, every 6 hours or when the user presses "Check now". No other network requests.

To test: install any add-on from AMO and one from a file, open the popup and press "Check now". The AMO add-on shows its authors and user count; the file one shows "Not listed on Firefox Add-ons".

Source: https://github.com/laboskiriste/extension-guardian (no build step; the package is the source).
```

**Screenshots** (1280×800): `firefox-screenshot-1.png`, `firefox-screenshot-2.png`, `firefox-screenshot-3.png` (rebuild with `FIREFOX=1 npm run store-images`)
