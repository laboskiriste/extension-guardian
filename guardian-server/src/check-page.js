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

function resultHtml(id, info) {
  if (info.status === 'error') {
    return `<section class="card"><p>The Chrome Web Store didn't answer just now. Please try again in a minute.</p></section>`;
  }
  const { verdict, signals } = storeSignals(info);
  const v = VERDICTS[verdict];
  const name = info.title ? escapeHtml(info.title) : `Extension ${id}`;
  const list = signals.map((s) => `
    <li class="${s.kind}"><span class="mark" aria-hidden="true">${s.kind === 'good' ? '✓' : '!'}</span>
      <div><strong>${escapeHtml(s.title)}</strong><br><span class="muted">${escapeHtml(s.detail)}</span></div></li>`).join('');
  const storeUrl = `https://chromewebstore.google.com/detail/${id}`;
  return `
  <section class="card">
    <h2>${name}</h2>
    <p class="verdict ${verdict}"><strong>${v.label}.</strong> ${v.text}</p>
    ${list ? `<ul class="signals">${list}</ul>` : ''}
    ${info.status === 'ok' ? `<h3>Who makes it</h3><dl>${developerRows(info)}</dl>
    <p><a href="${storeUrl}" rel="noopener">View in the Chrome Web Store</a></p>` : ''}
  </section>
  <section class="card cta">
    <h3>What this page can't see</h3>
    <p>A store listing doesn't show what an extension can access on your computer, and it can't warn you later.
    Extensions get sold, and the next silent update can change everything.</p>
    <p><strong>Extension Guardian</strong> watches the extensions you have installed and warns you when one changes owner,
    gains new permissions or disappears from the store. Free, open source, no account.</p>
    <p><a class="button" href="${STORE_LINK}" rel="noopener">Add to Chrome</a></p>
  </section>`;
}

export function renderCheckPage({ query = '', id = null, info = null } = {}) {
  const title = info?.title
    ? `Is ${escapeHtml(info.title)} safe? · Extension Guardian`
    : 'Is this Chrome extension safe? · Extension Guardian';
  const invalid = query && !id;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Paste a Chrome Web Store link to see who makes an extension, how many people use it, and whether it is maintained. Free, no sign-up.">
<style>
  :root { color-scheme: light dark; --accent: #1f7a4d; --bad: #b3261e; --mixed: #9a6700; --line: #8884; }
  body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 30px; line-height: 1.25; margin-bottom: 4px; }
  h2 { font-size: 22px; margin: 0 0 8px; }
  h3 { font-size: 17px; margin: 20px 0 6px; }
  .muted { opacity: .72; }
  form { display: flex; gap: 8px; margin: 20px 0 8px; flex-wrap: wrap; }
  input { flex: 1 1 320px; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; }
  button, .button { font: inherit; font-weight: 600; padding: 10px 18px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; text-decoration: none; display: inline-block; }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin: 20px 0; }
  .verdict { padding: 10px 12px; border-radius: 8px; border-left: 4px solid; }
  .verdict.good { border-color: var(--accent); } .verdict.mixed { border-color: var(--mixed); } .verdict.bad { border-color: var(--bad); }
  .signals { list-style: none; padding: 0; }
  .signals li { display: flex; gap: 10px; margin: 10px 0; }
  .mark { font-weight: 700; width: 1.2em; flex: none; }
  .good .mark { color: var(--accent); } .bad .mark { color: var(--bad); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
  dt { opacity: .72; } dd { margin: 0; overflow-wrap: anywhere; }
  .error { color: var(--bad); }
  footer { margin-top: 40px; font-size: 14px; }
</style>
</head>
<body>
<h1>Is this Chrome extension safe?</h1>
<p class="muted">Paste a Chrome Web Store link or extension ID. You'll see who makes it, how many people use it, and whether it's maintained.</p>
<form method="get" action="/">
  <input name="q" value="${escapeHtml(query)}" placeholder="https://chromewebstore.google.com/detail/…" aria-label="Chrome Web Store link or extension ID" required>
  <button type="submit">Check</button>
</form>
${invalid ? '<p class="error">That doesn\'t look like a Chrome Web Store link. Copy the address of the extension\'s store page and paste it here.</p>' : ''}
${id && info ? resultHtml(id, info) : ''}
<footer class="muted">
  Made by <a href="${STORE_LINK}">Extension Guardian</a> · <a href="${GITHUB_LINK}">Source</a> · <a href="/privacy">Privacy</a><br>
  Based only on the public Chrome Web Store listing. Not a malware scan.
</footer>
</body>
</html>`;
}
