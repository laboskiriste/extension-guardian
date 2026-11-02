import { describePermission, hostLabel, isBroadHost } from './permissions.js';
import { updateSource } from './risk.js';
import { STORE } from './platform.js';

// What we remember about an installed extension between checks.
export function snapshotOf(ext) {
  return {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    permissions: [...(ext.permissions ?? [])].sort(),
    hostPermissions: [...(ext.hostPermissions ?? [])].sort(),
    installType: ext.installType,
    updateSource: updateSource(ext),
  };
}

function added(before, after) {
  const prev = new Set(before);
  return after.filter((x) => !prev.has(x));
}

function same(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// "Raymond Hill (gorhill)" and "Raymond Hill", or "Dark Reader" and
// "Dark Reader Ltd", are the same owner: legal suffixes, nicknames in
// brackets and punctuation are ignored, and one name may contain the other.
const LEGAL = /\b(ltd|limited|llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|gmbh|ag|sa|sas|sarl|srl|s\.r\.l|bv|b\.v|oy|ab|as|aps|plc|pty|kk|ug|doo|d\.o\.o|dooel|sp\. z o\.o)\b\.?/g;
function ownerKey(name) {
  return name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(LEGAL, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sameOwner(a, b) {
  const x = ownerKey(a);
  const y = ownerKey(b);
  return !!x && !!y && (x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
}

// Differences between two snapshots of the same extension, e.g. after an update.
export function diffSnapshots(prev, cur) {
  const changes = [];
  const perms = added(prev.permissions, cur.permissions);
  if (perms.length) {
    changes.push({
      type: 'new_permissions',
      severity: 'medium',
      title: `${cur.name} asked for new permissions`,
      detail: perms.map(describePermission).join('; '),
    });
  }
  const hosts = added(prev.hostPermissions, cur.hostPermissions);
  if (hosts.length) {
    const broad = hosts.some(isBroadHost) && !prev.hostPermissions.some(isBroadHost);
    changes.push({
      type: 'new_hosts',
      severity: broad ? 'high' : 'medium',
      title: broad ? `${cur.name} can now access all websites` : `${cur.name} can now access more websites`,
      detail: broad
        ? 'After its latest update it can read and change everything on every page you open.'
        : [...new Set(hosts.map(hostLabel))].join(', '),
    });
  }
  if (prev.updateSource !== cur.updateSource) {
    changes.push({
      type: 'update_source_changed',
      severity: 'high',
      title: `${cur.name} now updates from a different place`,
      detail: `Updates used to come from ${prev.updateSource} and now come from ${cur.updateSource}.`,
    });
  }
  return changes;
}

// Differences between two store checks of the same extension.
export function diffStoreInfo(name, prev, cur) {
  if (!prev) return [];
  if (prev.status === 'ok' && cur.status === 'not_found') {
    return [{
      type: 'removed_from_store',
      severity: 'high',
      title: `${name} was removed from ${STORE.the}`,
      detail: `${STORE.owner} removes extensions for malware and policy violations. Consider removing it until you know why.`,
    }];
  }
  if (prev.status !== 'ok' || cur.status !== 'ok') return [];

  const changes = [];
  const owner = (a, b) => ({
    type: 'ownership_changed',
    severity: 'high',
    title: `${name} may have a new owner`,
    detail: `The developer changed from "${a}" to "${b}". Extensions are often sold and then turned into adware or spyware.`,
    from: a,
    to: b,
  });
  // Only compare fields present in both checks, so a missing field (or a store
  // layout change) never looks like a new owner.
  let compared = false;
  // Firefox lists every author. Some still there means a change in the team,
  // not a sale; the handover pattern (a buyer added, then the original
  // author removed) still shows up, as two medium alerts.
  // Checks saved before 0.1.5 have only the joined names.
  if (cur.authors?.length && !prev.authors && prev.developerName) {
    prev = { ...prev, authors: prev.developerName.split(', ') };
  }
  if (prev.authors?.length && cur.authors?.length) {
    compared = true;
    const keyed = (list) => new Set(list.map((x) => x.trim().toLowerCase()));
    const before = keyed(prev.authors);
    const after = keyed(cur.authors);
    const addedAuthors = cur.authors.filter((x) => !before.has(x.trim().toLowerCase()));
    const removedAuthors = prev.authors.filter((x) => !after.has(x.trim().toLowerCase()));
    if (addedAuthors.length || removedAuthors.length) {
      if (removedAuthors.length === prev.authors.length) {
        changes.push(owner(prev.developerName, cur.developerName));
      } else {
        const parts = [];
        if (addedAuthors.length) parts.push(`added ${addedAuthors.join(', ')}`);
        if (removedAuthors.length) parts.push(`removed ${removedAuthors.join(', ')}`);
        changes.push({
          type: 'authors_changed',
          severity: 'medium',
          title: `${name}: authors changed`,
          detail: `The add-on ${parts.join(' and ')}. A sale sometimes starts with the buyer being added as an author.`,
        });
      }
    }
  }
  for (const field of ['offeredBy', 'developerName']) {
    const a = prev[field];
    const b = cur[field];
    if (!a || !b || (field === 'developerName' && prev.authors?.length && cur.authors?.length)) continue;
    compared = true;
    if (!same(a, b)) {
      changes.push(owner(a, b));
      break;
    }
  }
  // Non-trader pages show only "Offered by", trader pages only the developer's
  // legal name. When an extension is sold to a company the page switches from
  // one to the other, so no field is in both checks: compare the two names.
  const a = prev.developerName ?? prev.offeredBy;
  const b = cur.developerName ?? cur.offeredBy;
  if (!compared && a && b && !sameOwner(a, b)) {
    // A developer who registers as a trader often keeps the email; the name
    // changing alone is then likely the same person under a legal name.
    if (prev.email && cur.email && same(prev.email, cur.email)) {
      changes.push({
        type: 'developer_renamed',
        severity: 'medium',
        title: `${name}: developer name changed`,
        detail: `Changed from "${a}" to "${b}" with the same email. This is usually the developer registering as a business, but it can also mean the extension was sold.`,
      });
    } else {
      changes.push(owner(a, b));
    }
  }
  for (const [field, label] of [['email', 'email'], ['website', 'website']]) {
    const a = prev[field];
    const b = cur[field];
    if (a && b && !same(a, b)) {
      changes.push({
        type: 'contact_changed',
        severity: 'medium',
        title: `${name}: developer ${label} changed`,
        detail: `Changed from ${a} to ${b}. This sometimes means the extension was sold.`,
      });
    }
  }
  return changes;
}
