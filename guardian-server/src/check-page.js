// The public "Is this extension safe?" page, served at /. It checks one
// extension using only its Chrome Web Store listing, the same data the
// extension uses, and points visitors to the extension for what a web page
// can't see: permissions and changes over time.
import { INCIDENTS, incidentFor, incidentPath, reportedName } from './incidents.js';
import { REPORT } from './report-data.js';

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

const CTA = `
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

function incidentHtml(id) {
  const incident = incidentFor(id);
  if (!incident) return '';
  return `
  <section class="card alert">
    <h2>Named in a malware report</h2>
    <p>This extension is listed in a report from ${escapeHtml(incident.reported)}: ${escapeHtml(incident.title)}.
    If you have it installed, remove it.</p>
    <p><a href="${incidentPath(incident)}">What happened and what to do →</a></p>
  </section>`;
}

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
  const name = info.title ?? reportedName(id) ?? 'Unknown extension';
  const icon = info.icon?.startsWith('https://lh3.googleusercontent.com/')
    ? `<img class="ext-icon" src="${escapeHtml(info.icon)}" alt="" width="56" height="56">`
    : `<span class="ext-icon letter" aria-hidden="true">${escapeHtml(name.trim()[0]?.toUpperCase() ?? '?')}</span>`;
  const maker = info.developerName ?? info.offeredBy;
  const facts = [maker && `by ${escapeHtml(maker)}`, info.users && `${escapeHtml(info.users)} users`].filter(Boolean).join(' · ');
  return `${incidentHtml(id)}
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
  </section>` : ''}${CTA}`;
}

export const SITE = 'https://app.extensionguardian.workers.dev';
export const OG_DEFAULT_PATH = '/og/default.png';
export const OG_REPORT_PATH = '/og/report.png';

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
  h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.1; margin: 0 0 14px; letter-spacing: -.025em; font-weight: 800; }
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
  .popular a { display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; text-decoration: none; color: var(--text); font-size: 15px; font-weight: 500; transition: border-color .15s, transform .15s, box-shadow .15s; }
  .popular a:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: var(--shadow); }
  .popular .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .avatar { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-weight: 800; font-size: 14px;
    background: hsl(var(--h) 60% 92%); color: hsl(var(--h) 55% 32%); }
  .wide { max-width: 1080px; }
  .eyebrow { display: inline-block; margin: 0 0 14px; padding: 4px 12px; border-radius: 999px; background: #ffffff1f; border: 1px solid #ffffff33; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: #e3f2ea; }
  .hero-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 48px; align-items: center; }
  .hero-grid h1 { font-size: clamp(32px, 5vw, 52px); }
  .demo { display: grid; gap: 12px; transform: rotate(-1.5deg); }
  .demo-card { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 14px; background: var(--surface); color: var(--text); box-shadow: 0 14px 40px rgb(0 0 0 / 25%); border-left: 4px solid var(--c); }
  .demo-card:nth-child(2) { margin-left: 28px; } .demo-card:nth-child(3) { margin-left: 12px; opacity: .92; }
  .demo-card div { display: flex; flex-direction: column; font-size: 14px; line-height: 1.45; }
  .demo-card strong { font-size: 15px; }
  .demo-card span:not(.demo-dot) { color: var(--muted); }
  .demo-dot { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 14px; background: var(--c); color: #fff; }
  .demo-card.bad { --c: var(--bad); } .demo-card.mixed { --c: var(--mixed); } .demo-card.good { --c: var(--accent); }
  .teaser { display: flex; gap: 22px; align-items: center; padding: 22px 26px; margin: 0 0 16px; border-radius: 16px; text-decoration: none; color: var(--text); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); transition: border-color .15s, transform .15s; }
  .teaser:hover { border-color: var(--accent); transform: translateY(-1px); }
  .teaser > strong { font-size: 52px; line-height: 1; color: var(--accent); letter-spacing: -.03em; }
  .teaser > span { display: flex; flex-direction: column; gap: 4px; font-size: 17px; }
  .teaser .muted { font-size: 15px; }
  .features { padding: 40px 0 8px; text-align: center; }
  .section-head { font-size: clamp(24px, 3.5vw, 32px); letter-spacing: -.02em; margin: 0 0 8px; }
  .section-sub { color: var(--muted); max-width: 560px; margin: 0 auto 28px; font-size: 17px; }
  .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: left; }
  .feature { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
  .feature svg { width: 40px; height: 40px; padding: 8px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
  .feature h3 { margin: 14px 0 6px; font-size: 18px; }
  .feature p { margin: 0; color: var(--muted); font-size: 15px; }
  .feature-cta { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 28px 0 0; font-size: 14px; }
  .button.big { padding: 14px 28px; font-size: 17px; border-radius: 12px; box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent); }
  .more { margin: 14px 4px 0; }
  .alert { background: var(--bad-soft); border-color: color-mix(in srgb, var(--bad) 35%, var(--line)); }
  .alert h2 { color: var(--bad); }
  .alert p { margin: 0 0 8px; } .alert p:last-child { margin: 0; }
  .text { margin: 0; } .note { margin: 12px 0 0; }
  .ext-list { list-style: none; padding: 0; margin: 0; }
  .ext-list li { padding: 10px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
  .ext-list li:first-child { border-top: 0; }
  .ext-list .muted { display: block; font-size: 13px; font-family: ui-monospace, monospace; }
  .steps { margin: 0; padding-left: 22px; } .steps li { margin-bottom: 8px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 0 0 16px; }
  .stat { margin: 0; }
  .stat strong { display: block; font-size: 34px; line-height: 1.1; color: var(--accent); letter-spacing: -.02em; }
  .stat span { display: block; margin-top: 6px; font-size: 15px; }
  .bars { list-style: none; padding: 0; margin: 0; }
  .bars li { display: grid; grid-template-columns: 1fr 52px; gap: 4px 12px; padding: 8px 0; border-top: 1px solid var(--line); }
  .bars li:first-child { border-top: 0; }
  .bars .bar { grid-column: 1 / -1; height: 6px; border-radius: 3px; background: var(--accent-soft); overflow: hidden; }
  .bars .bar i { display: block; height: 100%; background: var(--accent); }
  .bars b { text-align: right; }
  .bars code { font-size: 13px; color: var(--muted); }
  .table { width: 100%; border-collapse: collapse; font-size: 15px; }
  .table th, .table td { text-align: left; padding: 8px 6px; border-top: 1px solid var(--line); vertical-align: top; }
  .table th { color: var(--muted); font-weight: 600; font-size: 13px; border-top: 0; }
  .table td:nth-child(2), .table th:nth-child(2) { text-align: right; white-space: nowrap; }
  .table-wrap { overflow-x: auto; }
  footer { padding: 32px 0 48px; font-size: 14px; color: var(--muted); text-align: center; }
  footer a { color: var(--muted); }
  @media (prefers-color-scheme: dark) {
    .avatar { background: hsl(var(--h) 30% 22%); color: hsl(var(--h) 65% 78%); }
  }
  @media (max-width: 860px) {
    .hero-grid { grid-template-columns: 1fr; gap: 32px; }
    .demo { transform: none; } .demo-card:nth-child(n) { margin-left: 0; }
    .feature-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .teaser { flex-direction: column; align-items: flex-start; gap: 10px; }
    .hero { padding-bottom: 56px; }
    .nav { margin-bottom: 28px; }
    .lead { font-size: 16px; }
    .search { flex-direction: column; }
    .cta { flex-direction: column; gap: 8px; }
    dl { grid-template-columns: 1fr; gap: 0; } dd { margin-bottom: 8px; }
  }
`;

function layout({ title, description, canonical, hero, body, image = OG_DEFAULT_PATH, wide = false }) {
  const wrap = wide ? 'wrap wide' : 'wrap';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#1f7a4d">
${canonical ? `<link rel="canonical" href="${SITE}${canonical}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Extension Guardian">
<meta property="og:title" content="${title.replace(/ · Extension Guardian$/, '')}">
<meta property="og:description" content="${description}">
${canonical ? `<meta property="og:url" content="${SITE}${canonical}">` : ''}
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
</head>
<body>
<header class="hero"><div class="${wrap}">
  <nav class="nav">
    <a class="brand" href="/">${SHIELD}Extension Guardian</a>
    <a class="install" href="${STORE_LINK}" rel="noopener">Add to Chrome</a>
  </nav>
  ${hero}
</div></header>
<main class="${wrap}">
${body}
</main>
<footer class="${wrap}">
  <a href="${STORE_LINK}">Extension Guardian</a> · <a href="/popular">Popular extensions</a> · <a href="${REPORT_PATH}">Popular extensions report</a> · <a href="${incidentPath(INCIDENTS[0])}">Latest incident</a> · <a href="${GITHUB_LINK}">Source</a> · <a href="/privacy">Privacy</a><br>
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

// "AdBlock — block ads across the web" reads better as "AdBlock" in a grid.
const shortName = (name) => String(name).split(/\s[-–—:|]\s|:\s/)[0].trim() || name;
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const popularList = (items) => `<ul class="popular">${items
  .map((e) => `<li><a href="${extensionPath(e.id, e.name)}" title="${escapeHtml(e.name)}"><span class="avatar" style="--h:${hue(e.id)}" aria-hidden="true">${escapeHtml(shortName(e.name)[0]?.toUpperCase() ?? '?')}</span><span class="name">${escapeHtml(shortName(e.name))}</span></a></li>`).join('')}</ul>`;

// Example alerts in the home hero. Made-up extensions, so no real one is accused.
const DEMO = `
<div class="demo" role="img" aria-label="Example alerts from the Extension Guardian extension">
  <div class="demo-card bad"><span class="demo-dot">!</span><div><strong>Easy Tab Saver has a new owner</strong><span>The developer changed last night. The next update comes from someone else.</span></div></div>
  <div class="demo-card mixed"><span class="demo-dot">!</span><div><strong>Quick PDF Tools wants more access</strong><span>The update now asks to read and change data on every website.</span></div></div>
  <div class="demo-card good"><span class="demo-dot">✓</span><div><strong>Your other 12 extensions look fine</strong><span>Checked a minute ago.</span></div></div>
</div>`;

const ICON_PATHS = {
  owner: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7Z',
  gone: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${ICON_PATHS[name]}"/></svg>`;

const FEATURES = `
<section class="features">
  <h2 class="section-head">What the extension watches for</h2>
  <p class="section-sub">Extensions get sold, and Chrome installs the new owner's update without asking. Extension Guardian notices.</p>
  <div class="feature-grid">
    <div class="feature">${icon('owner')}<h3>A new owner</h3><p>Warns you when the developer on the store listing changes, the most common sign of a sale.</p></div>
    <div class="feature">${icon('key')}<h3>New permissions</h3><p>Tells you when an update asks for more, like reading every website you visit.</p></div>
    <div class="feature">${icon('gone')}<h3>Pulled from the store</h3><p>Google removes malware. If one you have disappears, you hear about it the same day.</p></div>
  </div>
  <p class="feature-cta"><a class="button big" href="${STORE_LINK}" rel="noopener">Add to Chrome, it's free</a><span class="muted">Open source · No account · Your list stays on your device</span></p>
</section>`;

const reportTeaser = () => `
<a class="teaser" href="${REPORT_PATH}">
  <strong>${pct(REPORT.broad, REPORT.analyzed)}</strong>
  <span><b>of the ${REPORT.listed} most popular Chrome extensions can read and change everything on every website.</b>
  <span class="muted">We checked who makes them and which ones nobody updates anymore. Read the report →</span></span>
</a>`;

const INVALID = '<p class="error">That doesn\'t look like a Chrome Web Store link. Copy the address of the extension\'s store page and paste it here.</p>';

export function renderCheckPage({ query = '', id = null, info = null, popular = [] } = {}) {
  const knownName = info?.title ?? (id && reportedName(id));
  const name = knownName ? escapeHtml(knownName) : null;
  const invalid = query && !id;
  const hero = name || id
    ? `<h1>Is ${name ?? 'this extension'} safe?</h1>
<p class="lead">What the Chrome Web Store listing says about who makes it, how many people use it, and whether it's maintained.</p>`
    : `<div class="hero-grid"><div>
<p class="eyebrow">Free checker · No sign-up</p>
<h1>Is this Chrome extension safe?</h1>
<p class="lead">See who makes an extension, how many people use it, and whether it's still maintained, before you install it.</p>
${form(query, { autofocus: !query })}
${invalid ? INVALID : '<p class="hint">Works with any link from chromewebstore.google.com.</p>'}
</div>${DEMO}</div>`;
  const body = id && info
    ? `${resultHtml(id, info)}
<h2 class="section-title">Check another extension</h2>
<div class="card">${form('')}</div>`
    : popular.length
      ? `${reportTeaser()}
<section class="card"><h2>Popular checks</h2>${popularList(popular.slice(0, 20))}<p class="more"><a href="/popular">All ${popular.length} popular extensions →</a></p></section>
${FEATURES}`
      : '';
  const home = !id && !invalid;
  return layout({
    title: name ? `Is ${name} safe? · Extension Guardian` : 'Is this Chrome extension safe? · Extension Guardian',
    description: name
      ? `Who makes ${name}, how many people use it, and whether it is still maintained, from its Chrome Web Store listing.`
      : 'Paste a Chrome Web Store link to see who makes an extension, how many people use it, and whether it is maintained. Free, no sign-up.',
    canonical: id && info?.status === 'ok' ? extensionPath(id, info.title) : (id ? null : '/'),
    hero,
    body,
    wide: home,
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

const incidentList = (extensions) => `<ul class="ext-list">${extensions.map((e) => {
  const href = e.store === 'edge'
    ? `https://microsoftedge.microsoft.com/addons/detail/${e.id}`
    : extensionPath(e.id, e.name);
  const where = e.store === 'edge' ? 'Edge add-on' : 'Chrome';
  return `<li><a href="${href}"${e.store === 'edge' ? ' rel="noopener"' : ''}>${escapeHtml(e.name)}</a>
    <span class="muted">${where} · ${e.id}</span></li>`;
}).join('')}</ul>`;

export function renderIncidentPage(incident) {
  const acquired = incident.extensions.filter((e) => e.acquired);
  const built = incident.extensions.filter((e) => !e.acquired);
  const sources = incident.sources
    .map((s) => `<li><a href="${escapeHtml(s.url)}" rel="noopener">${escapeHtml(s.name)}</a></li>`).join('');
  return layout({
    title: `${escapeHtml(incident.title)} · Extension Guardian`,
    description: escapeHtml(incident.summary),
    canonical: incidentPath(incident),
    hero: `<h1>${escapeHtml(incident.title)}</h1>
<p class="lead">Reported ${escapeHtml(incident.reported)}. ${escapeHtml(incident.summary)}</p>`,
    body: `
<section class="card">
  <h2>Why the bought ones matter</h2>
  <p class="text">An extension that changes hands keeps its name, icon, reviews and users. Chrome installs the new owner's
  update quietly, and nothing tells you that someone else is now behind it. People who had trusted these
  extensions for months got the malware without doing anything.</p>
</section>
<section class="card">
  <h2>What to do if you have one</h2>
  <ol class="steps">
    <li>Open <strong>chrome://extensions</strong> (or <strong>edge://extensions</strong>) and remove any extension from the lists below.</li>
    <li>If you used a crypto wallet in that browser, move your funds to a new wallet created on a clean device.
    Don't reuse the old recovery phrase.</li>
    <li>Change passwords you typed or saved in that browser, starting with email and banking, and turn on two-factor sign-in.</li>
    <li>Remove extensions you no longer use. Fewer extensions means fewer chances for this to happen again.</li>
  </ol>
</section>
<section class="card">
  <h2>Bought from their original developers (${acquired.length})</h2>
  ${incidentList(acquired)}
</section>
<section class="card">
  <h2>Built by the attackers (${built.length})</h2>
  ${incidentList(built)}
  <p class="muted note">Each Chrome link opens the extension's checker page, which shows whether it is still in the store.</p>
</section>
<section class="card">
  <h2>Sources</h2>
  <ul>${sources}</ul>
</section>
${CTA}`,
  });
}

export const REPORT_PATH = '/report/popular-chrome-extensions-2026';

const PERMISSION_LABELS = {
  scripting: 'Run its own code on pages',
  tabs: 'See the address and title of every tab',
  webRequest: 'Watch your network requests',
  cookies: 'Read and change cookies, including sign-ins',
  webNavigation: 'See every page you visit, as you visit it',
  identity: 'Sign in with your Google account',
  nativeMessaging: 'Talk to programs installed on your computer',
  history: 'Read your browsing history',
  management: 'See and turn off your other extensions',
  clipboardRead: 'Read your clipboard',
  debugger: 'Take full control of pages through the debugger',
};

const millions = (n) => `${Math.round(n / 1e6).toLocaleString('en-US')} million`;
const pct = (n, of) => `${Math.round((100 * n) / of)}%`;

export function renderReportPage(r) {
  const date = new Date(`${r.checked}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const stat = (big, text) => `<div class="card stat"><strong>${big}</strong><span>${text}</span></div>`;
  const bars = Object.entries(r.permissions).map(([name, n]) => `
    <li><span>${escapeHtml(PERMISSION_LABELS[name] ?? name)} <code>${escapeHtml(name)}</code></span><b>${n}</b>
      <span class="bar"><i style="width:${pct(n, r.analyzed)}"></i></span></li>`).join('');
  const stale = r.stale.map((e) => `
    <tr><td><a href="${extensionPath(e.id, e.name)}">${escapeHtml(e.name)}</a>${e.developer ? `<br><span class="muted">${escapeHtml(e.developer)}</span>` : ''}</td>
      <td>${escapeHtml(e.users ?? '')}</td><td>${escapeHtml(e.updated ?? '')}</td></tr>`).join('');
  return layout({
    title: `We checked the ${r.listed} most popular Chrome extensions · Extension Guardian`,
    description: `${pct(r.broad, r.analyzed)} of the most popular Chrome extensions can read and change everything on every website. What they can access, who makes them, and which ones are no longer maintained.`,
    canonical: REPORT_PATH,
    image: OG_REPORT_PATH,
    hero: `<h1>We checked the ${r.listed} most popular Chrome extensions</h1>
<p class="lead">What they can access, who makes them, and which ones nobody is updating anymore. Data from ${date}.</p>`,
    body: `
<div class="stats">
  ${stat(pct(r.broad, r.analyzed), `can read and change everything on every website you visit (${r.broad} of ${r.analyzed})`)}
  ${stat(millions(r.broadInstalls), 'installs come with that all-sites access')}
  ${stat(r.staleYear, `haven't been updated in over a year, ${r.staleTwoYears} of them in over two`)}
  ${stat(r.broadNonTrader, `with all-sites access are run by developers who haven't registered as a business (${millions(r.broadNonTraderInstalls)} installs)`)}
</div>
<section class="card">
  <h2>Full access is normal. That's the problem.</h2>
  <p class="text">Most of these extensions need broad access to do their job: an ad blocker, a password manager or a grammar
  checker can't work without reading the pages you open. We rate all ${r.lowRisk} of them as low risk today. They're popular,
  maintained and have a named developer.</p>
  <p class="note">The risk is what happens next. Extensions get sold, and the new owner inherits the users, the reviews and
  every one of those permissions. Chrome installs the next update silently and never says that someone else is now behind it.
  In <a href="${incidentPath(INCIDENTS[0])}">one campaign reported this year</a>, attackers bought established extensions and
  turned them into password and crypto-wallet stealers.</p>
</section>
<section class="card">
  <h2>What else they can do</h2>
  <p class="text muted">How many of the ${r.analyzed} extensions ask for each permission.</p>
  <ul class="bars">${bars}</ul>
</section>
<section class="card">
  <h2>Full access, no update in over a year</h2>
  <p class="text">${r.staleBroad} extensions with access to every website, used by ${millions(r.staleBroadInstalls)} people combined,
  haven't shipped an update in more than a year. That doesn't make them unsafe, and some are simply finished. But a popular extension
  that's no longer maintained is exactly what buyers look for.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Extension</th><th>Users</th><th>Last updated</th></tr></thead>
    <tbody>${stale}</tbody>
  </table></div>
</section>
<section class="card">
  <h2>How we checked</h2>
  <ul class="steps">
    <li>The list is the ${r.listed} extensions with the most users across the Chrome Web Store's categories.</li>
    <li>Developer, user count, last update and trader status come from each public store listing, read on ${date}.</li>
    <li>Permissions come from the manifest of the version currently in the store: required permissions, host permissions and the
    sites its content scripts run on. Optional permissions an extension may ask for later aren't counted.
    ${r.listed - r.analyzed ? `We couldn't read the package of ${r.listed - r.analyzed} extensions, so the figures cover ${r.analyzed}.` : ''}</li>
    <li>User counts are the store's rounded numbers. They count installs, not people, so the totals overlap.</li>
    <li>"Not registered as a business" means the developer declared themselves a non-trader in the store. For people in the EU,
    consumer rights then don't apply to that developer.</li>
  </ul>
  <p class="note">Every extension above links to its own page with the full store details. The raw data is
  <a href="${REPORT_PATH}.json">available as JSON</a>, free to reuse with a link back.</p>
</section>
${CTA}`,
  });
}

export function renderSitemap(popular) {
  const urls = ['/', '/popular', REPORT_PATH, ...INCIDENTS.map(incidentPath), ...popular.map((e) => extensionPath(e.id, e.name))];
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
