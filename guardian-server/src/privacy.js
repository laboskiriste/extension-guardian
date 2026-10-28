// Privacy policy, served at /privacy. The Chrome Web Store listing links here.
export const CONTACT_EMAIL = 'laboskiriste@gmail.com';

export const PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Extension Guardian – Privacy Policy</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  .muted { opacity: .7; }
</style>
</head>
<body>
<h1>Extension Guardian – Privacy Policy</h1>
<p class="muted">Effective October 26, 2026</p>

<p>Extension Guardian checks the other extensions installed in your browser and warns you when one looks risky.
It is built to need as little of your data as possible. This page explains exactly what it uses.</p>

<h2>What stays on your device</h2>
<p>The extension reads the list of extensions installed in your browser, with their names, versions, permissions and how they were installed,
using Chrome's <code>management</code> API. It saves this list, the results of its checks and your alerts in your browser's local storage,
so it can tell when something changes. This data never leaves your device, except as described below.</p>

<h2>What is sent to our server</h2>
<p>To find out who publishes each extension, the extension sends the <strong>IDs of your installed Chrome Web Store extensions</strong>
(for example <code>eimadpbcbfnmbkopoojfekhnkhdbieeh</code>) to our server. The server looks up the public Chrome Web Store page for each ID
and returns the publisher's name, contact details, user count and last update date. Nothing else is sent: no account, no identifier for you
or your browser, no browsing history, no website content and no cookies.</p>
<p>The server keeps the public store information for each extension ID for up to 6 hours, so that it does not ask the Chrome Web Store again
for every request. It does not record which IDs came from which person.</p>
<p>The server runs on Cloudflare Workers. Like any website, Cloudflare receives your IP address when the extension connects, and processes it
under the <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</a> to operate and protect its network. We do not log or store IP addresses.</p>

<h2>The website checker</h2>
<p>The page at <a href="/">app.extensionguardian.workers.dev</a> checks one extension at a time. It receives only the store link or ID you
paste in, looks up the same public store information, and keeps it for up to 6 hours in the same way. It uses no cookies and no analytics.</p>

<h2>What we never do</h2>
<ul>
  <li>We do not sell or share your data.</li>
  <li>We do not show ads, use analytics or track you.</li>
  <li>We do not read the content of web pages you visit.</li>
  <li>We do not use your data for anything other than the warnings the extension shows you.</li>
</ul>

<h2>Your choices</h2>
<p>Removing the extension deletes everything it stored in your browser. Because the server stores nothing linked to you, there is nothing else to delete.</p>

<h2>Changes</h2>
<p>If this policy changes, we will update this page and the date above.</p>

<h2>Contact</h2>
<p>Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body>
</html>
`;
