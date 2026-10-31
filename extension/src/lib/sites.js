// "Keep off on these sites": an extension is turned off while one of its
// sites is open in the active tab, and turned back on when the user leaves.

// Turns what the user typed ("https://www.mybank.com/login", "mybank.com")
// into a bare host name, or null if it isn't one.
export function normalizeSite(input) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (host !== 'localhost' && !host.includes('.')) return null;
  return host;
}

// A site also covers its subdomains: "mybank.com" matches "login.mybank.com".
export function matchesSite(url, sites) {
  let host;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    host = parsed.hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}

// Decides which extensions to turn off and on for the active tab's URL.
// `paused` holds the extensions we turned off ourselves, so we never turn on
// one the user turned off.
export function planSiteRules({ url, rules, exts, paused }) {
  const byId = new Map(exts.map((e) => [e.id, e]));
  const disable = [];
  const enable = [];
  const nextPaused = new Set(paused);

  for (const [id, sites] of Object.entries(rules)) {
    const ext = byId.get(id);
    if (!ext?.enabled || !ext.mayDisable || !sites.length) continue;
    if (matchesSite(url, sites)) {
      disable.push(id);
      nextPaused.add(id);
    }
  }
  for (const id of paused) {
    const ext = byId.get(id);
    if (!ext) {
      nextPaused.delete(id);
    } else if (!matchesSite(url, rules[id] ?? []) && !ext.enabled) {
      enable.push(id);
      nextPaused.delete(id);
    } else if (ext.enabled && !disable.includes(id)) {
      // The user turned it back on by hand: it's theirs again.
      nextPaused.delete(id);
    }
  }
  return { disable, enable, paused: [...nextPaused] };
}
