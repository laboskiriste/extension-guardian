// The family home page at tinyward.org, served by the same worker so the
// whole family lives on one domain without another service to run.
// No scripts: the site's CSP allows none.
import { GUARDIAN_ICON, UNSEEN_ICON } from './tinyward-icons.js';

export const TINYWARD_HOSTS = ['tinyward.org', 'www.tinyward.org'];

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f4d31"/><stop offset="1" stop-color="#23885a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M32 15 20 19.5v9c0 8.6 5.1 15.6 12 18.5 6.9-2.9 12-9.9 12-18.5v-9L32 15Z" fill="#fff"/><circle cx="32" cy="30" r="4.5" fill="#1f7a4d"/></svg>`;

export const TINYWARD_FAVICON = MARK.replace(' aria-hidden="true"', '');

// Icons are served from the page's own host, since the CSP allows only 'self'.
export const TINYWARD_ICONS = { '/icons/extension-guardian.png': GUARDIAN_ICON, '/icons/unseen.png': UNSEEN_ICON };

const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  lock: icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  eyeOff: icon('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.8M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a10 10 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  code: icon('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>'),
  ban: icon('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  check: icon('<path d="m5 12 5 5 9-10"/>'),
  arrow: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

const EXTENSIONS = [
  {
    id: 'extension-guardian',
    name: 'Extension Guardian',
    pitch: 'Know when an extension you trust changes hands.',
    points: [
      'Warns when an extension changes owner, the usual sign it was sold',
      'Warns when an update adds permissions, or it leaves the store',
      'Free web checker: who owns any Chrome extension today',
    ],
    access: 'No access to any website',
    price: 'Free',
    site: 'https://guardian.tinyward.org',
    chrome: 'https://chromewebstore.google.com/detail/extension-guardian/mpceklcidiadoneogfmpkjpadihmlcjd',
    firefox: 'https://addons.mozilla.org/firefox/addon/extension-guardian/',
    source: 'https://github.com/laboskiriste/extension-guardian',
  },
  {
    id: 'unseen',
    name: 'Unseen',
    pitch: 'Open your email without telling the sender.',
    points: [
      'Blocks tracking pixels in Gmail on the web',
      'Names the company behind each tracker',
      'Keeps every normal picture in the email',
    ],
    access: 'Access to Gmail only',
    price: 'Free blocking · optional Pro $15 once',
    site: 'https://unseen.tinyward.org/',
    chrome: 'https://chromewebstore.google.com/detail/unseen-email-tracker-bloc/fibpgcjlnnookmhclhpmhmajileledhd',
    firefox: 'https://addons.mozilla.org/firefox/addon/unseen-email-tracker-blocker/',
    source: 'https://github.com/laboskiriste/unseen',
  },
];

const PROMISES = [
  [ICONS.lock, 'Fewest permissions', 'Each extension asks only for what its one job needs, and says why.'],
  [ICONS.eyeOff, 'No tracking', 'No analytics, no telemetry, no account. Your data stays in your browser.'],
  [ICONS.ban, 'No ads, ever', 'Not even to make money. Paid features are stated up front and never remove free ones.'],
  [ICONS.code, 'Open source', 'Every line is public under the MIT licence, so anyone can check what it does.'],
];

const STYLE = `
  :root {
    color-scheme: light;
    --bg: #f4f7f5; --surface: #fff; --text: #14201a; --muted: #5b6b62; --line: #e1e8e4;
    --accent: #1f7a4d; --accent-hover: #186640; --accent-soft: #e6f3ec; --on-accent: #fff;
    --warn: #b3261e; --warn-soft: #fbeaea;
    --shadow: 0 1px 2px rgb(16 40 28 / 6%), 0 10px 30px rgb(16 40 28 / 8%);
    --hero: radial-gradient(900px 420px at 90% -10%, #2fa36b66, transparent 60%),
            radial-gradient(700px 320px at -10% 110%, #0b3d2699, transparent 60%),
            linear-gradient(140deg, #0c3f28, #1a6d45 55%, #23885a);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #0d1411; --surface: #151f1a; --text: #e6efe9; --muted: #9aaba1; --line: #24332b;
      --accent: #3fb47a; --accent-hover: #4cc488; --accent-soft: #173426; --on-accent: #06140d;
      --warn: #f07167; --warn-soft: #3a1c1a;
      --shadow: 0 1px 2px rgb(0 0 0 / 30%), 0 10px 30px rgb(0 0 0 / 30%);
      --hero: radial-gradient(900px 420px at 90% -10%, #2fa36b33, transparent 60%), linear-gradient(140deg, #08251a, #0f4029 60%, #145236);
    }
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow-wrap: break-word; }
  a { color: var(--accent); }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  .hero :focus-visible { outline-color: #fff; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
  .skip { position: absolute; left: 8px; top: -60px; padding: 8px 14px; border-radius: 8px; background: var(--surface); color: var(--text); font-weight: 600; z-index: 10; }
  .skip:focus { top: 8px; }

  .hero { background: var(--hero); color: #fff; position: relative; overflow: hidden; padding: 22px 0 150px; }
  .hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .13;
    background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 22px 22px;
    mask-image: linear-gradient(to bottom, #000, transparent 90%); }
  .hero .wrap { position: relative; z-index: 1; }
  nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 64px; }
  .brand { display: inline-flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; font-weight: 800; font-size: 20px; letter-spacing: -.01em; }
  .brand svg { width: 34px; height: 34px; filter: drop-shadow(0 2px 6px rgb(0 0 0 / 25%)); }
  .nav-links { display: flex; gap: 22px; font-size: 15px; font-weight: 600; }
  .nav-links a { color: #e3f2ea; text-decoration: none; }
  .nav-links a:hover { color: #fff; }
  .hero-grid { display: grid; grid-template-columns: 1.25fr .75fr; gap: 48px; align-items: center; }
  .eyebrow { display: inline-block; margin: 0 0 18px; padding: 5px 12px; border-radius: 999px; background: #ffffff1f; border: 1px solid #ffffff33; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #e3f2ea; }
  h1 { font-size: clamp(36px, 4.8vw, 54px); line-height: 1.04; letter-spacing: -.035em; margin: 0 0 18px; font-weight: 850; }
  h1 em { font-style: normal; color: #9be3bd; }
  .lead { font-size: 19px; color: #d9efe3; margin: 0 0 30px; max-width: 520px; }
  .ctas { display: flex; flex-wrap: wrap; gap: 12px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 12px; font-weight: 700; text-decoration: none; font-size: 16px; transition: transform .15s, background .15s, box-shadow .15s; }
  .btn svg { width: 18px; height: 18px; }
  .btn-light { background: #fff; color: #0f4d31; box-shadow: 0 8px 24px rgb(0 0 0 / 20%); }
  .btn-light:hover { transform: translateY(-1px); }
  .btn-ghost { color: #fff; border: 1px solid #ffffff55; }
  .btn-ghost:hover { background: #ffffff1a; }

  .compare { background: var(--surface); color: var(--text); border-radius: 18px; padding: 20px; box-shadow: 0 20px 50px rgb(0 0 0 / 30%); transform: rotate(-1.2deg); }
  .compare h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 12px; }
  .perm { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 12px; margin: 0 0 8px; }
  .perm:last-child { margin: 0; }
  .perm .dot { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
  .perm .dot svg { width: 16px; height: 16px; }
  .perm div { display: flex; flex-direction: column; font-size: 15px; line-height: 1.4; }
  .perm strong { font-size: 15px; }
  .perm span { color: var(--muted); }
  .perm.bad { background: var(--warn-soft); } .perm.bad .dot { background: var(--warn); color: #fff; }
  .perm.good { background: var(--accent-soft); } .perm.good .dot { background: var(--accent); color: var(--on-accent); }

  main.wrap { position: relative; z-index: 2; margin-top: -90px; }
  .section-head { text-align: center; margin: 72px auto 28px; max-width: 620px; }
  .section-head h2 { font-size: clamp(26px, 3.6vw, 36px); letter-spacing: -.025em; margin: 0 0 8px; }
  .section-head p { color: var(--muted); margin: 0; font-size: 18px; }
  .products { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .product { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 28px; box-shadow: var(--shadow); }
  .product-head { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
  .product-head img { width: 64px; height: 64px; border-radius: 16px; background: #fff; border: 1px solid var(--line); padding: 6px; }
  .product h3 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
  .product h3 a { color: var(--text); text-decoration: none; }
  .product h3 a:hover { color: var(--accent); }
  .pitch { margin: 2px 0 0; color: var(--muted); font-size: 16px; }
  .points { list-style: none; padding: 0; margin: 6px 0 18px; }
  .points li { display: flex; gap: 10px; padding: 6px 0; font-size: 16px; }
  .points svg { flex: none; width: 20px; height: 20px; color: var(--accent); margin-top: 3px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: 14px; font-weight: 600; background: var(--accent-soft); color: var(--accent); }
  .chip svg { width: 15px; height: 15px; }
  .chip.plain { background: transparent; border: 1px solid var(--line); color: var(--muted); }
  .product-actions { margin-top: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .btn-accent { background: var(--accent); color: var(--on-accent); }
  .btn-accent:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .link { font-weight: 600; font-size: 15px; text-decoration: none; }
  .link:hover { text-decoration: underline; }

  .promises { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .promise { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
  .promise svg { width: 42px; height: 42px; padding: 9px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
  .promise h3 { margin: 14px 0 6px; font-size: 18px; }
  .promise p { margin: 0; color: var(--muted); font-size: 15px; }

  .note { margin: 56px auto 0; max-width: 760px; text-align: center; color: var(--muted); font-size: 16px; }
  footer { margin-top: 72px; border-top: 1px solid var(--line); padding: 28px 0 44px; }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; color: var(--muted); font-size: 15px; }
  .foot .brand { color: var(--text); font-size: 17px; }
  .foot .brand svg { width: 26px; height: 26px; filter: none; }
  .foot nav { margin: 0; display: flex; gap: 18px; }
  .foot a { color: var(--muted); }

  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } .compare { transform: none; } }
  @media (max-width: 900px) {
    .hero-grid { grid-template-columns: 1fr; gap: 40px; }
    .compare { transform: none; max-width: 520px; }
    .promises { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 680px) {
    nav { margin-bottom: 40px; }
    .nav-links { display: none; }
    .hero { padding-bottom: 120px; }
    .products, .promises { grid-template-columns: 1fr; }
    .product { padding: 22px; }
    .section-head { margin-top: 56px; }
  }
`;

export function renderTinywardHome() {
  const products = EXTENSIONS.map((e) => `
    <article class="product">
      <div class="product-head">
        <img src="/icons/${e.id}.png" alt="" width="64" height="64">
        <div><h3><a href="${e.site}">${e.name}</a></h3><p class="pitch">${e.pitch}</p></div>
      </div>
      <ul class="points">${e.points.map((p) => `<li>${ICONS.check}<span>${p}</span></li>`).join('')}</ul>
      <div class="chips"><span class="chip">${ICONS.lock}${e.access}</span><span class="chip plain">${e.price}</span></div>
      <div class="product-actions">
        <a class="btn btn-accent" href="${e.chrome}">Add to Chrome</a>
        <a class="link" href="${e.firefox}">Firefox</a>
        <a class="link" href="${e.site}">Learn more</a>
        <a class="link" href="${e.source}">Source</a>
      </div>
    </article>`).join('');
  const promises = PROMISES.map(([svg, title, text]) => `
    <div class="promise">${svg}<h3>${title}</h3><p>${text}</p></div>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tinyward: small privacy extensions with as few permissions as possible</title>
<meta name="description" content="Tinyward makes small, open-source browser extensions that protect your privacy and security with as few permissions as possible. No ads, no analytics, no tracking.">
<meta name="theme-color" content="#0f4d31">
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
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#extensions">Skip to the extensions</a>
<header class="hero"><div class="wrap">
  <nav>
    <a class="brand" href="/">${MARK}Tinyward</a>
    <div class="nav-links"><a href="#extensions">Extensions</a><a href="#promise">Promise</a><a href="https://github.com/laboskiriste">GitHub</a></div>
  </nav>
  <div class="hero-grid">
    <div>
      <p class="eyebrow">Open source · No tracking</p>
      <h1>Small extensions that guard <em>one thing</em> well.</h1>
      <p class="lead">Browser extensions for privacy and security that ask for as little access as possible, and show you exactly what they do.</p>
      <div class="ctas">
        <a class="btn btn-light" href="#extensions">See the extensions ${ICONS.arrow}</a>
        <a class="btn btn-ghost" href="https://github.com/laboskiriste">Read the code</a>
      </div>
    </div>
    <div class="compare" aria-label="What extensions can access">
      <h2>What can it access?</h2>
      <div class="perm bad"><span class="dot">!</span><div><strong>A typical extension</strong><span>"Read and change all your data on all websites"</span></div></div>
      <div class="perm good"><span class="dot">${ICONS.check}</span><div><strong>Unseen</strong><span>Gmail, and nothing else</span></div></div>
      <div class="perm good"><span class="dot">${ICONS.check}</span><div><strong>Extension Guardian</strong><span>No website at all</span></div></div>
    </div>
  </div>
</div></header>
<main class="wrap">
  <section id="extensions" class="products" aria-label="Extensions">${products}
  </section>
  <section id="promise">
    <div class="section-head"><h2>The Tinyward promise</h2><p>The same four rules for every extension, including the ones that make money.</p></div>
    <div class="promises">${promises}
    </div>
  </section>
  <p class="note">Tinyward is made by one independent developer. Found a bug, or an extension that asks for more than it should? <a href="https://github.com/laboskiriste">Open an issue on GitHub</a>.</p>
</main>
<footer><div class="wrap foot">
  <a class="brand" href="/">${MARK}Tinyward</a>
  <nav><a href="https://mastodon.social/@tinyward">Mastodon</a><a href="https://bsky.app/profile/tinyward.org">Bluesky</a><a href="https://github.com/laboskiriste">GitHub</a><a href="https://github.com/sponsors/laboskiriste">Sponsor</a></nav>
</div></footer>
</body>
</html>`;
}
