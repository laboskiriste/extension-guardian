// The family home page at tinyward.org, served by the same worker so the
// whole family lives on one domain without another service to run.
export const TINYWARD_HOSTS = ['tinyward.org', 'www.tinyward.org'];

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f4d31"/><stop offset="1" stop-color="#23885a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M32 15 20 19.5v9c0 8.6 5.1 15.6 12 18.5 6.9-2.9 12-9.9 12-18.5v-9L32 15Z" fill="#fff"/><circle cx="32" cy="30" r="4.5" fill="#1f7a4d"/></svg>`;

export const TINYWARD_FAVICON = MARK.replace(' aria-hidden="true"', '');

const EXTENSIONS = [
  {
    name: 'Extension Guardian',
    what: 'Warns you when an extension you use is sold, gains new permissions or is removed from its store. Includes a free web checker that shows who owns any Chrome extension today.',
    access: 'No access to any website.',
    site: 'https://guardian.tinyward.org',
    chrome: 'https://chromewebstore.google.com/detail/extension-guardian/mpceklcidiadoneogfmpkjpadihmlcjd',
    firefox: 'https://addons.mozilla.org/firefox/addon/extension-guardian/',
    source: 'https://github.com/laboskiriste/extension-guardian',
  },
  {
    name: 'Unseen: Email Tracker Blocker',
    what: 'Blocks email tracking pixels in Gmail, so senders can\'t see when you open their emails, and names the company behind each one.',
    access: 'Access to Gmail only.',
    site: 'https://unseen.tinyward.org/',
    chrome: 'https://chromewebstore.google.com/detail/unseen-email-tracker-bloc/fibpgcjlnnookmhclhpmhmajileledhd',
    firefox: 'https://addons.mozilla.org/firefox/addon/unseen-email-tracker-blocker/',
    source: 'https://github.com/laboskiriste/unseen',
  },
];

export function renderTinywardHome() {
  const cards = EXTENSIONS.map((e) => `
  <section class="card">
    <h2><a href="${e.site}">${e.name}</a></h2>
    <p>${e.what}</p>
    <p class="muted">${e.access} Open source (MIT).</p>
    <p><a href="${e.chrome}">Chrome</a> · <a href="${e.firefox}">Firefox</a> · <a href="${e.source}">Source</a></p>
  </section>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tinyward: small privacy extensions with as few permissions as possible</title>
<meta name="description" content="Tinyward makes small, open-source browser extensions that protect your privacy and security with as few permissions as possible. No ads, no analytics, no tracking.">
<link rel="canonical" href="https://tinyward.org/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="Tinyward">
<meta property="og:description" content="Small, open-source browser extensions that protect your privacy with as few permissions as possible.">
<meta property="og:url" content="https://tinyward.org/">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tinyward',
    url: 'https://tinyward.org/',
    sameAs: ['https://mastodon.social/@tinyward', 'https://bsky.app/profile/tinyward.org', 'https://github.com/laboskiriste'],
  })}</script>
<style>
  :root { color-scheme: light; --bg: #f4f7f5; --surface: #fff; --text: #14201a; --muted: #5b6b62; --line: #e1e8e4; --accent: #1f7a4d; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: #0d1411; --surface: #151f1a; --text: #e6efe9; --muted: #9aaba1; --line: #24332b; --accent: #3fb47a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 56px 16px 64px; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  header svg { width: 52px; height: 52px; }
  h1 { font-size: 34px; margin: 0; letter-spacing: -.02em; }
  .lead { font-size: 19px; margin: 0 0 32px; }
  a { color: var(--accent); }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin: 0 0 16px; }
  .card h2 { margin: 0 0 8px; font-size: 21px; }
  .card h2 a { text-decoration: none; color: var(--text); }
  .card p { margin: 0 0 8px; } .card p:last-child { margin: 0; }
  .muted { color: var(--muted); }
  ul { padding-left: 20px; }
  footer { margin-top: 40px; font-size: 15px; color: var(--muted); }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
  <header>${MARK}<h1>Tinyward</h1></header>
  <p class="lead">Small browser extensions that guard one thing well, with as few permissions as possible.</p>
${cards}
  <h2>The promise</h2>
  <ul>
    <li>No ads, no analytics, no tracking. Ever, including to make money.</li>
    <li>Open source under the MIT licence, so anyone can check.</li>
    <li>Only the permissions the job needs.</li>
  </ul>
  <footer>Made by an independent developer. <a href="https://mastodon.social/@tinyward">Mastodon</a> · <a href="https://bsky.app/profile/tinyward.org">Bluesky</a> · <a href="https://github.com/laboskiriste">GitHub</a></footer>
</main>
</body>
</html>`;
}
