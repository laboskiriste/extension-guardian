// "Keep off on these sites": an extension is turned off while one of its
// sites is open in the active tab, and turned back on when the user leaves.

// Turns what the user typed ("https://www.mybank.com/login", "mybank.com")
// into a bare host name, or null if it isn't one. Ports are dropped, since a
// site covers all of them. International names come back in the punycode
// form ("xn--...") that tab addresses use, so they still match.
export function normalizeSite(input) {
  const text = String(input ?? '').trim().toLowerCase().replace(/^\*\./, '');
  if (!text) return null;
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  // IPv6 addresses keep their brackets, as in tab addresses.
  if (/^\[[0-9a-f:.]+\]$/.test(host) || host === 'localhost') return host;
  if (!host.includes('.') || host.split('.').some((label) => !label) || !/^[a-z0-9.-]+$/.test(host)) return null;
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
// one the user turned off. `allowed` holds the ones the user turned back on
// by hand while on one of their sites: they stay on until the user leaves.
export function planSiteRules({ url, rules, exts, paused, allowed = [] }) {
  const byId = new Map(exts.map((e) => [e.id, e]));
  const here = (id) => matchesSite(url, rules[id] ?? []);
  const disable = [];
  const enable = [];
  const nextPaused = new Set();
  const nextAllowed = new Set();

  // Uninstalled extensions simply drop out of both lists.
  for (const id of new Set(paused)) {
    const ext = byId.get(id);
    if (!ext) continue;
    if (ext.enabled) {
      // The user turned it back on by hand: it's theirs again.
      if (here(id)) nextAllowed.add(id);
    } else if (here(id)) {
      nextPaused.add(id);
    } else {
      enable.push(id);
    }
  }
  for (const id of allowed) {
    if (byId.has(id) && here(id)) nextAllowed.add(id);
  }
  for (const [id, sites] of Object.entries(rules)) {
    const ext = byId.get(id);
    if (!ext?.enabled || !ext.mayDisable || !sites.length || nextAllowed.has(id)) continue;
    if (matchesSite(url, sites)) {
      disable.push(id);
      nextPaused.add(id);
    }
  }
  return { disable, enable, paused: [...nextPaused], allowed: [...nextAllowed] };
}
