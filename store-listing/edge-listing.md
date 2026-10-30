# Microsoft Edge Add-ons listing – Extension Guardian

The same package works in Edge. Upload `extension-guardian-0.1.2.zip` (rebuild with `npm run package` in `extension-guardian`).

## How to submit

1. Register at https://partner.microsoft.com/dashboard/microsoftedge/overview with a Microsoft account. It's free. Choose an **Individual** account; Microsoft verifies the email and may ask for your name and address.
2. Click **Create new extension** and upload the zip.
3. Fill in the sections below: Availability, Properties, Store listings, Submission options.
4. Click **Publish**. Review usually takes up to 7 business days.

## Availability

- Visibility: **Public**
- Markets: **All markets**

## Properties

**Category**: Productivity (Edge has no security category)

**Privacy policy**: Yes, this extension requires a privacy policy

```
https://app.extensionguardian.workers.dev/privacy
```

**Website URL**

```
https://app.extensionguardian.workers.dev/
```

**Support contact details**

```
https://github.com/laboskiriste/extension-guardian/issues
```

**Mature content**: No

## Store listings (English)

**Display name**: comes from the manifest (Extension Guardian)

**Description** (at least 250 characters)

```
Browser extensions can see a lot: your email, your bank, everything you type. Most are honest. But extensions get sold, and new owners sometimes turn a trusted tool into adware or spyware overnight. The browser updates it silently, and you never find out.

Extension Guardian watches your extensions so you don't have to.

WHAT IT CHECKS
• New permissions: tells you when an update asks for more access, like reading every website.
• Installed behind your back: flags extensions that another program added, or that update from outside the official stores.
• New owner and removal from the store: for extensions you installed from the Chrome Web Store, it warns you when the developer changes (the most common sign of a sale) or when the extension is taken down. Developer checks for Edge Add-ons are coming.

TWO CLEAR RATINGS
• Access: what each extension can do (full, limited or basic), explained in plain language.
• Risk: whether you should trust it, based on real signals: who makes it, how many people use it, whether it is maintained, and the warnings above.

A password manager needs full access to work, so full access alone doesn't mean danger. Extension Guardian tells the two apart, so you only get alerts that matter.

ONE CLICK TO ACT
Turn off or remove an extension right from the list, or open its store page.

PRIVATE BY DESIGN
• Your list of extensions and all results stay on your device.
• To look up developers, only extension IDs are sent to our server, never your identity, history or browsing data.
• No ads, no analytics, no tracking.
• Open source: https://github.com/laboskiriste/extension-guardian
```

**Extension store logo** (128×128 minimum): `extension-guardian/icons/icon128.png`

**Small promotional tile** (440×280): `store-listing/promo-small.png`

**Screenshots** (1280×800): `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`

**Short description** (shown in search results)

```
Warns you when an extension is risky, gains new permissions, changes owner or was installed behind your back.
```

**Search terms** (up to 7)

```
extension security
extension permissions
malicious extensions
adware
privacy
extension manager
spyware
```

## Submission options

**Notes for certification**

```
Extension Guardian reads the list of installed extensions with the management permission and rates each one. It never changes another extension unless the user clicks Turn off or Remove in the popup.

To test: install a few extensions, open the popup and expand any extension to see its Access and Risk ratings. Press "Check now" to look up developer information. That sends only extension IDs to our server (https://app.extensionguardian.workers.dev/v1/store), which reads the public Chrome Web Store page and returns JSON. No account or sign-in is needed.

Source code: https://github.com/laboskiriste/extension-guardian
```
