import { describePermission, hostLabel, isBroadHost } from './permissions.js';
import { updateSource } from './risk.js';

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

// Differences between two Chrome Web Store checks of the same extension.
export function diffStoreInfo(name, prev, cur) {
  if (!prev) return [];
  if (prev.status === 'ok' && cur.status === 'not_found') {
    return [{
      type: 'removed_from_store',
      severity: 'high',
      title: `${name} was removed from the Chrome Web Store`,
      detail: 'Google removes extensions for malware and policy violations. Consider removing it until you know why.',
    }];
  }
  if (prev.status !== 'ok' || cur.status !== 'ok') return [];

  const changes = [];
  // Only compare fields present in both checks, so a missing field (or a store
  // layout change) never looks like a new owner.
  for (const field of ['offeredBy', 'developerName']) {
    const a = prev[field];
    const b = cur[field];
    if (a && b && !same(a, b)) {
      changes.push({
        type: 'ownership_changed',
        severity: 'high',
        title: `${name} may have a new owner`,
        detail: `The developer changed from "${a}" to "${b}". Extensions are often sold and then turned into adware or spyware.`,
        from: a,
        to: b,
      });
      break;
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
