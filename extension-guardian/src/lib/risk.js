import { PERMISSIONS, BROAD_HOST, isBroadHost, hostLabel } from './permissions.js';

const CWS_UPDATE_HOSTS = ['clients2.google.com', 'update.googleapis.com'];
const EDGE_UPDATE_HOSTS = ['edge.microsoft.com'];
const DAY = 24 * 60 * 60 * 1000;

export function updateSource(ext) {
  if (!ext.updateUrl) return 'store';
  let host;
  try {
    host = new URL(ext.updateUrl).hostname;
  } catch {
    return 'unknown';
  }
  if (CWS_UPDATE_HOSTS.includes(host)) return 'store';
  if (EDGE_UPDATE_HOSTS.includes(host)) return 'edge';
  return host;
}

// Whether the Chrome Web Store has a page for this extension we can check.
// Includes extensions added by other programs, as long as they update from the store.
export function isFromChromeWebStore(ext) {
  return ext.installType !== 'development' && updateSource(ext) === 'store';
}

/**
 * What the extension is able to do, from its permissions.
 * This says nothing about whether it is trustworthy: a password manager
 * needs full access to work.
 */
export function assessAccess(ext) {
  const reasons = [];
  const hosts = ext.hostPermissions ?? [];
  const broad = hosts.some(isBroadHost);

  if (broad) {
    reasons.push({ ...BROAD_HOST });
  } else if (hosts.length) {
    const labels = [...new Set(hosts.map(hostLabel))];
    const shown = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` and ${labels.length - 3} more` : '');
    reasons.push({
      weight: Math.min(5 + labels.length, 15),
      title: `Can read and change data on ${labels.length} site${labels.length === 1 ? '' : 's'}`,
      detail: shown,
    });
  }

  for (const name of ext.permissions ?? []) {
    const info = PERMISSIONS[name];
    if (!info) continue;
    const weight = broad && info.broadWeight ? info.broadWeight : info.weight;
    reasons.push({ weight, title: info.title, detail: info.detail });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const score = Math.min(100, reasons.reduce((sum, r) => sum + r.weight, 0));
  let level = 'basic';
  if (broad || score >= 40) level = 'full';
  else if (score >= 10 || hosts.length) level = 'limited';
  return { score, level, reasons };
}

// "22,000,000" or "1,000,000+" -> number
export function parseUsers(text) {
  const n = Number(String(text ?? '').replace(/[^\d]/g, ''));
  return text && Number.isFinite(n) ? n : null;
}

export function riskLevelFor(score) {
  if (score >= 40) return 'high';
  if (score >= 15) return 'watch';
  return 'low';
}

/**
 * How likely the extension is to be harmful, from signals about who makes it
 * and how it got here. Reasons have kind "bad" or "good".
 *
 * Critical signals (new owner, removed from the store, installed by another
 * program, updates from outside the store) always make the risk high: a big
 * user count must never hide them. Store signals like user count and update
 * date only adjust the softer part of the score.
 */
export function assessRisk(ext, { store, ownershipChanged = false, recentAccessIncrease = false, now = Date.now() } = {}) {
  const access = assessAccess(ext);
  const full = access.level === 'full';
  const critical = [];
  const soft = [];
  const good = [];

  if (ownershipChanged) {
    critical.push({
      title: 'The developer has changed',
      detail: 'This extension may have been sold. Sold extensions are often turned into adware or spyware.',
    });
  }
  if (store?.status === 'not_found') {
    critical.push({
      title: 'No longer in the Chrome Web Store',
      detail: 'Google removes extensions for malware and policy violations. It may also have been taken down by its developer.',
    });
  }
  if (ext.installType === 'sideload') {
    // Chrome itself and trusted software (e.g. Google Docs Offline) also add
    // extensions this way. If it is a live store extension, that's only a
    // mild signal; otherwise it is the classic adware pattern.
    if (updateSource(ext) === 'store' && store?.status === 'ok') {
      soft.push({
        weight: 15,
        title: 'Installed by another program',
        detail: 'You did not add it yourself. It is a normal Chrome Web Store extension, often added by Chrome or by software from the same company.',
      });
    } else {
      critical.push({
        title: 'Installed by another program',
        detail: 'You did not install this from the store yourself. Unwanted software often installs extensions this way.',
      });
    }
  }
  const source = updateSource(ext);
  if (source !== 'store' && source !== 'edge' && ext.installType !== 'development') {
    critical.push({
      title: 'Updates from outside the store',
      detail: `New versions come from ${source} and are not reviewed by Google.`,
    });
  }

  // Not offset by good signals: a popular extension asking for more is exactly
  // what a newly sold extension looks like.
  const firm = [];
  if (recentAccessIncrease) {
    firm.push({
      weight: 15,
      title: 'Recently asked for more access',
      detail: 'A recent update added permissions. Check that the extension still needs them.',
    });
  }

  if (store?.status === 'ok') {
    const users = parseUsers(store.users);
    if (users != null) {
      if (users < 1000) {
        soft.push({
          weight: full ? 20 : 5,
          title: `Only ${users.toLocaleString('en-US')} users`,
          detail: full
            ? 'Few people use it, so problems are less likely to be noticed and reported, yet it can see every website.'
            : 'Few people use it, so problems are less likely to be noticed and reported.',
        });
      } else if (users >= 100000) {
        good.push({
          weight: users >= 1000000 ? 15 : 10,
          title: `Used by ${store.users} people`,
          detail: 'Problems in popular extensions tend to be noticed and reported quickly.',
        });
      }
    }

    const updated = Date.parse(store.updated ?? '');
    if (Number.isFinite(updated)) {
      const days = (now - updated) / DAY;
      if (days > 730) {
        soft.push({
          weight: full ? 20 : 10,
          title: 'Not updated in over 2 years',
          detail: 'Abandoned extensions miss security fixes and are often the ones that get sold.',
        });
      } else if (days > 365) {
        soft.push({ weight: 5, title: 'Not updated in over a year', detail: `Last updated ${store.updated}.` });
      } else if (days <= 180) {
        good.push({ weight: 5, title: 'Actively maintained', detail: `Last updated ${store.updated}.` });
      }
    }

    if (store.trader === 'trader') {
      good.push({
        weight: 5,
        title: 'Registered business',
        detail: 'The developer has identified itself as a trader under EU law, with a public address.',
      });
    }
    if (!store.email && !store.website) {
      soft.push({ weight: 5, title: 'No developer contact', detail: 'The store lists no email or website for the developer.' });
    }
  }

  const softScore = soft.reduce((sum, r) => sum + r.weight, 0);
  const goodScore = good.reduce((sum, r) => sum + r.weight, 0);
  const firmScore = firm.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.min(100, critical.length * 40 + firmScore + Math.max(0, softScore - goodScore));
  const level = critical.length ? 'high' : riskLevelFor(score);

  const reasons = [
    ...critical.map((r) => ({ ...r, weight: 40, kind: 'bad' })),
    ...firm.map((r) => ({ ...r, kind: 'bad' })),
    ...soft.sort((a, b) => b.weight - a.weight).map((r) => ({ ...r, kind: 'bad' })),
    ...good.sort((a, b) => b.weight - a.weight).map((r) => ({ ...r, kind: 'good' })),
  ];
  return { score, level, reasons, access };
}
