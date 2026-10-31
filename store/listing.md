# Chrome Web Store listing – Extension Guardian

Copy each block into the matching field of the Chrome Web Store Developer Dashboard.

## How to submit

1. Register as a developer at https://chrome.google.com/webstore/devconsole (one-time US$5 fee, Google account, 2-step verification required).
2. Click **New item** and upload `extension-guardian-0.1.0.zip` (rebuild it with `npm run package` in `extension-guardian`).
3. Fill in the three tabs below: Store listing, Privacy practices, Distribution.
4. Click **Submit for review**. Reviews usually take a few days; the `management` permission can make it take longer.

To publish a new version later: raise `version` in `manifest.json`, run `npm run package`, and upload the new zip under **Package**.

## Store listing tab

**Name** (from manifest)

```
Extension Guardian
```

**Summary** (from manifest, max 132 characters)

```
Warns you when an extension is risky, changes owner, gains new permissions or disappears from the Chrome Web Store.
```

**Description**

```
Browser extensions can see a lot: your email, your bank, everything you type. Most are honest. But extensions get sold, and new owners sometimes turn a trusted tool into adware or spyware overnight. Chrome updates it silently, and you never find out.

Extension Guardian watches your extensions so you don't have to.

WHAT IT CHECKS
• New owner – warns you when the developer of an extension changes, the most common sign that it was sold.
• New permissions – tells you when an update asks for more access, like reading every website.
• Removed from the store – Google often takes malware down this way. If it was removed, you'll know.
• Installed behind your back – flags extensions that another program added, or that update from outside the Chrome Web Store.

TWO CLEAR RATINGS
• Access: what each extension can do (full, limited or basic), explained in plain language.
• Risk: whether you should trust it, based on real signals: who makes it, how many people use it, whether it is maintained, and the warnings above.

A password manager needs full access to work, so full access alone doesn't mean danger. Extension Guardian tells the two apart, so you only get alerts that matter.

ONE CLICK TO ACT
Turn off or remove an extension right from the list, or open its store page.

PRIVATE BY DESIGN
• Your list of extensions and all results stay on your device.
• To look up developers, only extension IDs are sent to our server – never your identity, history or browsing data.
• No ads, no analytics, no tracking. Ever.

Extension Guardian is part of Tinyward, small privacy tools with as few permissions as possible. Also from Tinyward: Unseen, which blocks email tracking pixels in Gmail.
```

**Category**: Privacy & Security
**Language**: English

**Graphics** (in `store/`):
- Store icon: `extension/icons/icon128.png`
- Screenshots (1280×800): `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`
- Small promo tile (440×280): `promo-small.png`

## Privacy practices tab

**Single purpose**

```
Extension Guardian has one purpose: helping users see which of their installed extensions are risky and warning them when an extension changes in a dangerous way (new owner, new permissions, removal from the Chrome Web Store).
```

**Permission justifications**

`management`
```
Required to read the list of installed extensions and their permissions, which is the core of the product, and to let the user turn off or remove a risky extension from the popup. The extension never changes other extensions without the user clicking a button.
```

`storage`
```
Stores the last known state of each installed extension and the alerts on the user's device, so changes (new permissions, new owner) can be detected.
```

`alarms`
```
Schedules a check of the Chrome Web Store information every 6 hours, so ownership changes and removals are noticed even when the user does not open the popup.
```

`notifications`
```
Shows a system notification for serious problems only, such as an extension that changed owner or was removed from the Chrome Web Store.
```

**Remote code**: No, I am not using remote code.
(The server returns JSON data only; all code is in the package.)

**Data usage**

Leave every data category unchecked. The extension sends only the IDs of installed Chrome Web Store extensions, which do not identify the user and are not in any of the listed categories (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, website content). This is a judgement call; it is explained in full in the privacy policy, which reviewers read.

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://app.extensionguardian.workers.dev/privacy
```

## Distribution tab

- Payments: Free
- Visibility: Public (or Unlisted for a soft launch with friends first)
- Regions: All regions
