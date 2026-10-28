// The public "Is this extension safe?" page, served at /. It checks one
// extension using only its Chrome Web Store listing, the same data the
// extension uses, and points visitors to the extension for what a web page
// can't see: permissions and changes over time.
const STORE_LINK = 'https://chromewebstore.google.com/detail/extension-guardian/mpceklcidiadoneogfmpkjpadihmlcjd';
const GITHUB_LINK = 'https://github.com/laboskiriste/extension-guardian';
const DAY = 24 * 60 * 60 * 1000;

export function extractId(input) {
  return /[a-p]{32}/.exec(String(input ?? ''))?.[0] ?? null;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// "22,000,000" or "1,000,000+" -> number
function parseUsers(text) {
  const n = Number(String(text ?? '').replace(/[^\d]/g, ''));
  return text && Number.isFinite(n) ? n : null;
}

// Signals from the store listing alone, worded for someone deciding whether
// to install. Mirrors the store part of the extension's risk model.
export function storeSignals(info, now = Date.now()) {
  if (info.status === 'not_found') {
    return {
      verdict: 'bad',
      signals: [{
        kind: 'bad',
        title: 'Not in the Chrome Web Store',
        detail: 'There is no live store listing for this ID. Google often removes malware this way. If you have it installed, consider removing it.',
      }],
    };
  }
  const signals = [];
  const users = parseUsers(info.users);
  if (users != null && users < 1000) {
    signals.push({ kind: 'bad', title: `Only ${users.toLocaleString('en-US')} users`, detail: 'Few people use it, so problems are less likely to be noticed and reported.' });
  } else if (users != null && users >= 100000) {
    signals.push({ kind: 'good', title: `Used by ${info.users} people`, detail: 'A large user base means problems tend to get noticed quickly.' });
  }
  const updated = Date.parse(info.updated ?? '');
  if (Number.isFinite(updated)) {
    const days = (now - updated) / DAY;
    if (days > 730) signals.push({ kind: 'bad', title: 'Not updated in over 2 years', detail: `Last updated ${info.updated}. Abandoned extensions are the ones most often sold.` });
    else if (days > 365) signals.push({ kind: 'bad', title: 'Not updated in over a year', detail: `Last updated ${info.updated}.` });
    else if (days < 180) signals.push({ kind: 'good', title: 'Actively maintained', detail: `Last updated ${info.updated}.` });
  }
  if (info.trader === 'trader') {
    signals.push({ kind: 'good', title: 'Registered business', detail: 'The developer has identified itself as a trader under EU law, with a public address.' });
  }
  if (!info.email && !info.website) {
    signals.push({ kind: 'bad', title: 'No developer contact', detail: 'The store lists no email or website for the developer.' });
  }
  const bad = signals.filter((s) => s.kind === 'bad').length;
  const good = signals.length - bad;
  const verdict = bad === 0 && good > 0 ? 'good' : bad > good ? 'bad' : 'mixed';
  return { verdict, signals };
}

const VERDICTS = {
  good: { label: 'Good signs', text: 'Nothing in the store listing stands out.' },
  mixed: { label: 'Mixed signs', text: 'Some things in the store listing are worth a closer look.' },
  bad: { label: 'Warning signs', text: 'The store listing shows real reasons for caution.' },
};

function developerRows(info) {
  const rows = [
    ['Offered by', info.offeredBy],
    ['Developer', info.developerName],
    ['Address', info.developerAddress],
    ['Email', info.email],
    ['Website', info.website],
    ['Users', info.users],
    ['Version', info.version],
    ['Last updated', info.updated],
  ].filter(([, v]) => v);
  return rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
}

const SHIELD = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/><path fill="none" stroke="var(--shield-check)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>`;

const ICONS = { good: '✓', mixed: '!', bad: '!' };

function resultHtml(id, info) {
  if (info.status === 'error') {
    return `<section class="card"><p>The Chrome Web Store didn't answer just now. Please try again in a minute.</p></section>`;
  }
  const { verdict, signals } = storeSignals(info);
  const v = VERDICTS[verdict];
  const list = signals.map((s) => `
    <li class="${s.kind}"><span class="mark" aria-hidden="true">${s.kind === 'good' ? '✓' : '!'}</span>
      <div><strong>${escapeHtml(s.title)}</strong><span class="muted">${escapeHtml(s.detail)}</span></div></li>`).join('');
  const storeUrl = `https://chromewebstore.google.com/detail/${id}`;
  const name = info.title ?? 'Unknown extension';
  const icon = info.icon?.startsWith('https://lh3.googleusercontent.com/')
    ? `<img class="ext-icon" src="${escapeHtml(info.icon)}" alt="" width="56" height="56">`
    : `<span class="ext-icon letter" aria-hidden="true">${escapeHtml(name.trim()[0]?.toUpperCase() ?? '?')}</span>`;
  const maker = info.developerName ?? info.offeredBy;
  const facts = [maker && `by ${escapeHtml(maker)}`, info.users && `${escapeHtml(info.users)} users`].filter(Boolean).join(' · ');
  return `
  <section class="card verdict-card ${verdict}">
    <div class="ext-head">${icon}
      <div><h2>${escapeHtml(name)}</h2>
      <span class="muted">${facts || `ID ${id}`}</span></div></div>
    <div class="verdict"><span class="verdict-icon" aria-hidden="true">${ICONS[verdict]}</span>
      <div><strong>${v.label}</strong><span>${v.text}</span></div></div>
    ${list ? `<ul class="signals">${list}</ul>` : ''}
  </section>
  ${info.status === 'ok' ? `<section class="card">
    <h2>Who makes it</h2><dl>${developerRows(info)}</dl>
    <p class="store-link"><a href="${storeUrl}" rel="noopener">View in the Chrome Web Store ↗</a></p>
  </section>` : ''}
  <section class="card cta">
    <div class="cta-icon">${SHIELD}</div>
    <div>
      <h2>What this page can't see</h2>
      <p>A store listing doesn't show what an extension can access on your computer, and it can't warn you later.
      Extensions get sold, and the next silent update can change everything.</p>
      <p><strong>Extension Guardian</strong> watches the extensions you have installed and warns you when one changes owner,
      gains new permissions or disappears from the store. Free, open source, no account.</p>
      <a class="button" href="${STORE_LINK}" rel="noopener">Add to Chrome, it's free</a>
    </div>
  </section>`;
}

export const SITE = 'https://app.extensionguardian.workers.dev';

export const slugify = (name) => (String(name).split(/\s[-–—:|]\s|:\s/)[0].toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')) || 'extension';

export const extensionPath = (id, name) => `/extension/${slugify(name)}/${id}`;

const STYLE = `
  :root {
    color-scheme: light;
    --bg: #f4f7f5; --surface: #fff; --text: #14201a; --muted: #5b6b62; --line: #e1e8e4;
    --accent: #1f7a4d; --accent-hover: #186640; --accent-soft: #e6f3ec; --on-accent: #fff;
    --bad: #b3261e; --bad-soft: #fbeaea; --mixed: #9a6700; --mixed-soft: #fdf3dc;
    --shadow: 0 1px 2px rgb(16 40 28 / 6%), 0 8px 24px rgb(16 40 28 / 8%);
    --hero: radial-gradient(1200px 400px at 85% -10%, #2fa36b55, transparent 60%),
            radial-gradient(800px 300px at 0% 120%, #0b3d2655, transparent 60%),
            linear-gradient(135deg, #0f4d31, #1f7a4d 55%, #23885a);
    --shield-check: #1f7a4d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #0d1411; --surface: #151f1a; --text: #e6efe9; --muted: #9aaba1; --line: #24332b;
      --accent: #3fb47a; --accent-hover: #4cc488; --accent-soft: #173426; --on-accent: #06140d;
      --bad: #f07167; --bad-soft: #3a1c1a; --mixed: #e0a93b; --mixed-soft: #3a2e14;
      --shadow: 0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 25%);
      --hero: radial-gradient(1200px 400px at 85% -10%, #2fa36b33, transparent 60%), linear-gradient(135deg, #0a2e1e, #11482f 60%, #145236);
      --shield-check: #11482f;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--accent); }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 16px; }
  .hero { background: var(--hero); color: #fff; padding: 20px 0 64px; position: relative; overflow: hidden; }
  .hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .12;
    background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 22px 22px;
    mask-image: linear-gradient(to bottom, #000, transparent 85%); }
  .hero .wrap { position: relative; z-index: 1; }
  .brand { display: inline-flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; opacity: .95; }
  .brand svg { width: 26px; height: 26px; color: #fff; --shield-check: #1f7a4d; }
  .nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 40px; }
  .nav a.install { color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 6px 12px; border: 1px solid #ffffff55; border-radius: 999px; white-space: nowrap; }
  .nav a.install:hover { background: #ffffff1a; }
  h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.15; margin: 0 0 12px; letter-spacing: -.02em; }
  .lead { font-size: 18px; margin: 0; color: #e3f2ea; max-width: 600px; }
  .search { display: flex; gap: 8px; margin-top: 28px; padding: 8px; background: var(--surface); border-radius: 14px; box-shadow: 0 10px 30px rgb(0 0 0 / 20%); }
  .search input { flex: 1; min-width: 0; font: inherit; padding: 12px 14px; border: 0; background: transparent; color: var(--text); outline: none; }
  .search:focus-within { box-shadow: 0 10px 30px rgb(0 0 0 / 20%), 0 0 0 3px #ffffff66; }
  button, .button { font: inherit; font-weight: 600; padding: 12px 22px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent); cursor: pointer; text-decoration: none; display: inline-block; }
  button:hover, .button:hover { background: var(--accent-hover); }
  .hint { margin: 10px 4px 0; font-size: 14px; color: #d3eadd; }
  .error { margin: 12px 4px 0; padding: 10px 12px; border-radius: 10px; background: var(--bad-soft); color: var(--bad); font-weight: 600; }
  main { margin-top: -40px; position: relative; z-index: 2; padding-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin: 0 0 16px; box-shadow: var(--shadow); }
  h2 { font-size: 18px; margin: 0 0 12px; }
  .muted { color: var(--muted); }
  .ext-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
  .ext-head h2 { font-size: 24px; line-height: 1.2; margin: 0 0 2px; overflow-wrap: anywhere; }
  .ext-icon { flex: none; width: 56px; height: 56px; border-radius: 14px; background: #fff; border: 1px solid var(--line); object-fit: contain; padding: 6px; }
  .ext-icon.letter { display: grid; place-items: center; padding: 0; background: var(--accent-soft); color: var(--accent); font-size: 26px; font-weight: 800; }
  .verdict { display: flex; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 12px; }
  .verdict div { display: flex; flex-direction: column; }
  .verdict strong { font-size: 19px; }
  .verdict-icon { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: var(--on-accent); font-weight: 800; font-size: 20px; }
  .good .verdict { background: var(--accent-soft); } .good .verdict-icon { background: var(--accent); }
  .mixed .verdict { background: var(--mixed-soft); } .mixed .verdict-icon { background: var(--mixed); }
  .bad .verdict { background: var(--bad-soft); } .bad .verdict-icon { background: var(--bad); }
  .signals { list-style: none; padding: 0; margin: 16px 0 0; }
  .signals li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
  .signals li:first-child { border-top: 0; }
  .signals li div { display: flex; flex-direction: column; }
  .mark { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 13px; margin-top: 2px; }
  li.good .mark { background: var(--accent-soft); color: var(--accent); }
  li.bad .mark { background: var(--bad-soft); color: var(--bad); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 20px; margin: 0; }
  dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; font-weight: 500; }
  .store-link { margin: 16px 0 0; }
  .cta { display: flex; gap: 18px; background: linear-gradient(135deg, var(--accent-soft), var(--surface) 70%); border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }
  .cta p { margin: 0 0 12px; }
  .cta-icon svg { width: 44px; height: 44px; color: var(--accent); --shield-check: var(--surface); }
  .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 28px 4px 12px; }
  .popular { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
  .popular a { display: block; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; text-decoration: none; color: var(--text); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: border-color .15s, transform .15s; }
  .popular a:hover { border-color: var(--accent); transform: translateY(-1px); }
  .more { margin: 14px 4px 0; }
  footer { padding: 32px 0 48px; font-size: 14px; color: var(--muted); text-align: center; }
  footer a { color: var(--muted); }
  @media (max-width: 560px) {
    .hero { padding-bottom: 56px; }
    .nav { margin-bottom: 28px; }
    .lead { font-size: 16px; }
    .search { flex-direction: column; }
    .cta { flex-direction: column; gap: 8px; }
    dl { grid-template-columns: 1fr; gap: 0; } dd { margin-bottom: 8px; }
  }
`;

function layout({ title, description, canonical, hero, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#1f7a4d">
${canonical ? `<link rel="canonical" href="${SITE}${canonical}">` : ''}
<style>${STYLE}</style>
</head>
<body>
<header class="hero"><div class="wrap">
  <nav class="nav">
    <a class="brand" href="/">${SHIELD}Extension Guardian</a>
    <a class="install" href="${STORE_LINK}" rel="noopener">Add to Chrome</a>
  </nav>
  ${hero}
</div></header>
<main class="wrap">
${body}
</main>
<footer class="wrap">
  <a href="${STORE_LINK}">Extension Guardian</a> · <a href="/popular">Popular extensions</a> · <a href="${GITHUB_LINK}">Source</a> · <a href="/privacy">Privacy</a><br>
  Based only on the public Chrome Web Store listing. Not a malware scan.
</footer>
</body>
</html>`;
}

const form = (query, { autofocus = false } = {}) => `
<form class="search" method="get" action="/">
  <input name="q" value="${escapeHtml(query)}" placeholder="Paste a Chrome Web Store link or extension ID" aria-label="Chrome Web Store link or extension ID" required${autofocus ? ' autofocus' : ''}>
  <button type="submit">Check</button>
</form>`;

const popularList = (items) => `<ul class="popular">${items
  .map((e) => `<li><a href="${extensionPath(e.id, e.name)}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</a></li>`).join('')}</ul>`;

const INVALID = '<p class="error">That doesn\'t look like a Chrome Web Store link. Copy the address of the extension\'s store page and paste it here.</p>';

export function renderCheckPage({ query = '', id = null, info = null, popular = [] } = {}) {
  const name = info?.title ? escapeHtml(info.title) : null;
  const invalid = query && !id;
  const hero = name || id
    ? `<h1>Is ${name ?? 'this extension'} safe?</h1>
<p class="lead">What the Chrome Web Store listing says about who makes it, how many people use it, and whether it's maintained.</p>`
    : `<h1>Is this Chrome extension safe?</h1>
<p class="lead">See who makes an extension, how many people use it, and whether it's still maintained, before you install it.</p>
${form(query, { autofocus: !query })}
${invalid ? INVALID : '<p class="hint">Free, no sign-up. Works with any link from chromewebstore.google.com.</p>'}`;
  const body = id && info
    ? `${resultHtml(id, info)}
<h2 class="section-title">Check another extension</h2>
<div class="card">${form('')}</div>`
    : popular.length
      ? `<div class="card"><h2>Popular checks</h2>${popularList(popular.slice(0, 18))}<p class="more"><a href="/popular">All ${popular.length} popular extensions →</a></p></div>`
      : '';
  return layout({
    title: name ? `Is ${name} safe? · Extension Guardian` : 'Is this Chrome extension safe? · Extension Guardian',
    description: name
      ? `Who makes ${name}, how many people use it, and whether it is still maintained, from its Chrome Web Store listing.`
      : 'Paste a Chrome Web Store link to see who makes an extension, how many people use it, and whether it is maintained. Free, no sign-up.',
    canonical: id && info?.status === 'ok' ? extensionPath(id, info.title) : (id ? null : '/'),
    hero,
    body,
  });
}

export function renderPopularPage(popular) {
  return layout({
    title: 'Are popular Chrome extensions safe? · Extension Guardian',
    description: 'Who makes the most-used Chrome extensions, how many people use them, and whether they are maintained.',
    canonical: '/popular',
    hero: `<h1>Popular Chrome extensions</h1>
<p class="lead">The ${popular.length} most-used extensions in the Chrome Web Store. Pick one to see who makes it and whether it's maintained.</p>
${form('')}`,
    body: `<div class="card">${popularList(popular)}</div>`,
  });
}

export function renderSitemap(popular) {
  const urls = ['/', '/popular', ...popular.map((e) => extensionPath(e.id, e.name))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`;
}

export const ROBOTS = `User-agent: *
Allow: /
Disallow: /v1/
Sitemap: ${SITE}/sitemap.xml
`;
