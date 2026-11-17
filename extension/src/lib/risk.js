import { PERMISSIONS, BROAD_HOST, isBroadHost, hostLabel } from './permissions.js';
import { STORE } from './platform.js';

// Chrome Web Store, and addons.mozilla.org for Firefox (which usually reports no update URL at all).
const STORE_UPDATE_HOSTS = ['clients2.google.com', 'update.googleapis.com', 'versioncheck.addons.mozilla.org'];
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
  if (STORE_UPDATE_HOSTS.includes(host)) return 'store';
  if (EDGE_UPDATE_HOSTS.includes(host)) return 'edge';
  return host;
}

// Whether the store we check (Chrome Web Store, or Firefox Add-ons in Firefox)
// should have a page for this extension. Includes extensions added by other
// programs, as long as they update from the store.
export function isFromStore(ext) {
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

// What to do about an extension, from what it can access and what was seen:
// "monitor", "review" or "act". Full access is never just "monitor", since no
// warning sign is not a guarantee: the access is the same either way.
export function recommend(accessLevel, riskLevel) {
  if (riskLevel === 'high') return 'act';
  if (riskLevel === 'watch') return 'review';
  return accessLevel === 'full' ? 'review' : 'monitor';
}

export function riskLevelFor(score) {
  if (score >= 40) return 'high';
  if (score >= 15) return 'watch';
  return 'low';
}

/**
 * How likely the extension is to be harmful, from signals about who makes it
 * and how it got here. Reasons have kind "bad" (a warning sign) or "info" (neutral context, no weight).
 *
 * Critical signals (new owner, removed from the store, installed by another
 * program, updates from outside the store) always make the risk high.
 * Popularity, update date, contact details and trader status are not part of
 * the score at all: popular extensions are the ones worth buying or hijacking,
 * and a small or finished one is not unsafe for being small or finished. They
 * are listed as neutral context (kind "info").
 */
export function assessRisk(ext, { store, ownershipChanged = false, recentAccessIncrease = false, now = Date.now() } = {}) {
  const access = assessAccess(ext);
  const full = access.level === 'full';
  const critical = [];
  const soft = [];

  if (ownershipChanged) {
    critical.push({
      title: 'The developer has changed',
      detail: 'This extension may have been sold. Sold extensions are often turned into adware or spyware.',
    });
  }
  if (store?.status === 'unlisted') {
    soft.push({
      weight: full ? 20 : 10,
      title: `Not listed on ${STORE.the}`,
      detail: `It was installed from a file or another website. ${STORE.owner} signed it, but it has no public store page, so we can't check who makes it.`,
    });
  }
  if (store?.status === 'not_found') {
    critical.push({
      title: `No longer in ${STORE.the}`,
      detail: `${STORE.owner} removes extensions for malware and policy violations. It may also have been taken down by its developer.`,
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
        detail: `You did not add it yourself. It is a normal ${STORE.name} extension, often added by ${STORE.browser} or by software from the same company.`,
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
      detail: `New versions come from ${source} and are not reviewed by ${STORE.owner}.`,
    });
  }

  // A popular extension asking for more is exactly what a newly sold extension
  // looks like.
  const firm = [];
  if (recentAccessIncrease) {
    firm.push({
      weight: 15,
      title: 'Recently asked for more access',
      detail: 'A recent update added permissions. Check that the extension still needs them.',
    });
  }

  const context = [];
  if (store?.status === 'ok') {
    const users = parseUsers(store.users);
    if (users != null) {
      context.push({
        title: `${store.users} users`,
        detail: 'For context only. Popular extensions are not safer: they are the ones most worth buying or hijacking.',
      });
    }
    if (Number.isFinite(Date.parse(store.updated ?? ''))) {
      context.push({
        title: `Last updated ${store.updated}`,
        detail: 'Maintenance information. A recent update is not a sign of safety, and an old one is not a sign of danger.',
      });
    }
    if (store.trader === 'trader') {
      context.push({
        title: 'Registered business',
        detail: 'The developer has identified itself as a trader under EU law, with a public address. This is not a security check.',
      });
    }
    if (!store.email && !store.website) {
      context.push({ title: 'No developer contact', detail: 'The store lists no email or website for the developer.' });
    }
  }

  const softScore = soft.reduce((sum, r) => sum + r.weight, 0);
  const firmScore = firm.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.min(100, critical.length * 40 + firmScore + softScore);
  const level = critical.length ? 'high' : riskLevelFor(score);

  const reasons = [
    ...critical.map((r) => ({ ...r, weight: 40, kind: 'bad' })),
    ...firm.map((r) => ({ ...r, kind: 'bad' })),
    ...soft.sort((a, b) => b.weight - a.weight).map((r) => ({ ...r, kind: 'bad' })),
    ...context.map((r) => ({ ...r, weight: 0, kind: 'info' })),
  ];
  return { score, level, reasons, access };
}
