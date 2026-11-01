import { assessRisk, isFromStore } from './lib/risk.js';
import { snapshotOf, diffSnapshots, diffStoreInfo } from './lib/changes.js';
import { fetchStoreInfoBatch } from './lib/store.js';
import { IS_FIREFOX } from './lib/platform.js';
import { planSiteRules } from './lib/sites.js';

const STORE_CHECK_ALARM = 'store-check';
const STORE_CHECK_MINUTES = 6 * 60;
const MAX_ALERTS = 200;

// Storage is read-modify-write, so every task runs one after another.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch((err) => console.error(err));
  return run;
}

// What the checks keep between runs. Site rules and the rest are read where needed.
function load() {
  return chrome.storage.local.get({ snapshots: {}, storeInfo: {}, alerts: [] });
}

// Every other extension. Themes and apps are left out.
async function installedExtensions() {
  const all = await chrome.management.getAll();
  return all.filter((e) => e.type === 'extension' && e.id !== chrome.runtime.id);
}

// Two alerts of the same type can be made in the same millisecond (a new
// email and a new website), so ids also carry a counter.
let alertCount = 0;
function makeAlert(ext, change) {
  return {
    ...change,
    id: `${ext.id}:${change.type}:${Date.now()}:${alertCount++}`,
    extId: ext.id,
    extName: ext.name,
    at: Date.now(),
    seen: false,
  };
}

// The badge counts alerts not seen yet; red if one of them is serious.
async function updateBadge(alerts) {
  const unseen = alerts.filter((a) => !a.seen);
  await chrome.action.setBadgeText({ text: unseen.length ? String(unseen.length) : '' });
  const high = unseen.some((a) => a.severity === 'high');
  await chrome.action.setBadgeBackgroundColor({ color: high ? '#d93025' : '#e37400' });
}

// The same event reported again within this time, while the first alert is
// still in the list, is dropped. This happens when a store page flickers
// between two states, or a developer switches a field back and forth.
const REPEAT_MS = 7 * 24 * 60 * 60 * 1000;

function isRepeat(alert, alerts) {
  return alerts.some((a) => a.extId === alert.extId && a.type === alert.type && a.detail === alert.detail
    && alert.at - a.at < REPEAT_MS);
}

// Saves new alerts, newest first, and notifies only for serious ones.
async function addAlerts(candidates) {
  if (!candidates.length) return;
  const { alerts } = await load();
  const fresh = candidates.filter((a) => !isRepeat(a, alerts));
  if (!fresh.length) return;
  const next = [...fresh, ...alerts].slice(0, MAX_ALERTS);
  await chrome.storage.local.set({ alerts: next });
  await updateBadge(next);
  for (const alert of fresh.filter((a) => a.severity === 'high')) {
    chrome.notifications.create(alert.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: alert.title,
      message: alert.detail,
      priority: 2,
    });
  }
}

// Compares installed extensions with what we saw last time.
// With `baseline`, it only records the current state (first run). A scan
// that runs before any baseline exists also counts as one, so a check that
// sneaks in ahead of the first-run scan doesn't flag every extension as new.
async function scanInstalled({ baseline = false } = {}) {
  const { snapshots, storeInfo } = await load();
  const { lastScanAt } = await chrome.storage.local.get({ lastScanAt: null });
  if (!lastScanAt) baseline = true;
  const exts = await installedExtensions();
  const next = {};
  const fresh = [];
  for (const ext of exts) {
    const cur = snapshotOf(ext);
    const prev = snapshots[ext.id];
    if (!baseline && prev) {
      fresh.push(...diffSnapshots(prev, cur).map((c) => makeAlert(ext, c)));
    } else if (!baseline) {
      // The store hasn't been checked yet here, so this only sees install
      // signals (sideloading, update source) and the permissions.
      const risk = assessRisk(ext, { store: storeInfo[ext.id] });
      if (risk.level === 'high') {
        fresh.push(makeAlert(ext, {
          type: 'installed',
          severity: 'high',
          title: `New extension: ${ext.name} (high risk)`,
          detail: risk.reasons.filter((r) => r.kind === 'bad').slice(0, 2).map((r) => r.title).join('; '),
        }));
      } else if (risk.access.level === 'full') {
        fresh.push(makeAlert(ext, {
          type: 'installed',
          severity: 'medium',
          title: `New extension with full access: ${ext.name}`,
          detail: risk.access.reasons.slice(0, 2).map((r) => r.title).join('; '),
        }));
      }
    }
    next[ext.id] = cur;
  }
  await chrome.storage.local.set({ snapshots: next, lastScanAt: Date.now() });
  await addAlerts(fresh);
}

// Looks up each extension's store page and compares the developer.
async function checkStore(onlyIds = null) {
  const exts = (await installedExtensions())
    .filter(isFromStore)
    .filter((e) => !onlyIds || onlyIds.includes(e.id));

  if (!exts.length) return;

  let byId;
  try {
    byId = await fetchStoreInfoBatch(exts.map((e) => e.id));
  } catch (err) {
    console.warn('Store check failed:', err.message);
    await chrome.storage.local.set({ storeError: err.message });
    return;
  }
  const results = exts.filter((e) => byId[e.id]).map((e) => [e, byId[e.id]]);

  // If most pages suddenly look "removed", the store layout probably changed
  // and our parser is wrong. Don't scare the user with false alarms.
  const missing = results.filter(([, info]) => info.status === 'not_found').length;
  const parserSuspect = results.length >= 3 && missing > results.length / 2;

  const { storeInfo } = await load();
  const fresh = [];
  for (let [ext, info] of results) {
    const prev = storeInfo[ext.id];
    // Firefox add-ons installed from a file or another site were never on
    // Firefox Add-ons. Only one we saw listed before counts as removed.
    if (IS_FIREFOX && info.status === 'not_found' && prev?.status !== 'ok') {
      info = { status: 'unlisted', checkedAt: info.checkedAt };
    }
    if (parserSuspect && info.status === 'not_found') continue;
    const changes = diffStoreInfo(ext.name, prev, info);
    const owner = changes.find((c) => c.type === 'ownership_changed');
    info.ownershipChanged = owner
      ? { from: owner.from, to: owner.to, at: Date.now() }
      : prev?.ownershipChanged ?? null;
    storeInfo[ext.id] = info;
    fresh.push(...changes.map((c) => makeAlert(ext, c)));
  }
  await chrome.storage.local.set({ storeInfo, lastStoreCheckAt: Date.now(), storeError: null });
  await addAlerts(fresh);
}

// Drops everything we kept about extensions that are no longer installed,
// alerts included: once an extension is gone, its warnings are settled.
async function forget(ids) {
  const gone = new Set(ids);
  if (!gone.size) return;
  const { snapshots, storeInfo, alerts } = await load();
  const { siteRules, pausedBySites, allowedBySites } = await chrome.storage.local.get({ siteRules: {}, pausedBySites: [], allowedBySites: [] });
  for (const id of gone) {
    delete snapshots[id];
    delete storeInfo[id];
    delete siteRules[id];
  }
  const nextAlerts = alerts.filter((a) => !gone.has(a.extId));
  await chrome.storage.local.set({
    snapshots, storeInfo, siteRules,
    alerts: nextAlerts,
    pausedBySites: pausedBySites.filter((x) => !gone.has(x)),
    allowedBySites: allowedBySites.filter((x) => !gone.has(x)),
  });
  if (nextAlerts.length !== alerts.length) await updateBadge(nextAlerts);
}

// Finds ids we still keep data for that are no longer installed, for
// uninstalls we missed (Guardian was turned off at the time, say).
async function forgetMissing() {
  const installed = new Set((await installedExtensions()).map((e) => e.id));
  const { storeInfo, alerts } = await load();
  const { siteRules } = await chrome.storage.local.get({ siteRules: {} });
  const kept = [...Object.keys(storeInfo), ...Object.keys(siteRules), ...alerts.map((a) => a.extId)];
  await forget(kept.filter((id) => !installed.has(id)));
}

// "Keep off on these sites". Reading tab addresses needs the optional `tabs`
// permission, which the user grants when adding a first site. Every open tab
// counts, in every window, so a bank left open in a background tab stays covered.
// Firefox only lets an add-on turn off themes, so the feature is Chrome-only.
async function applySiteRules() {
  if (IS_FIREFOX || !(await chrome.permissions.contains({ permissions: ['tabs'] }))) return;
  const urls = (await chrome.tabs.query({})).map((tab) => tab.url).filter(Boolean);
  const { siteRules, pausedBySites, allowedBySites } = await chrome.storage.local.get({ siteRules: {}, pausedBySites: [], allowedBySites: [] });
  const plan = planSiteRules({
    urls, rules: siteRules, exts: await installedExtensions(), paused: pausedBySites, allowed: allowedBySites,
  });
  for (const id of plan.disable) await chrome.management.setEnabled(id, false).catch(console.warn);
  for (const id of plan.enable) await chrome.management.setEnabled(id, true).catch(console.warn);
  await chrome.storage.local.set({ pausedBySites: plan.paused, allowedBySites: plan.allowed });
}

// A scan or store check that is queued but hasn't started yet takes in later
// requests instead of queueing another. When Chrome updates ten extensions
// at startup, that is one scan and one server call instead of ten.
let pendingScan = null;
function queueScan() {
  if (!pendingScan) {
    pendingScan = serial(() => { pendingScan = null; return scanInstalled(); });
  }
  return pendingScan;
}

let pendingCheck = null;
// `ids` null means every extension.
function queueStoreCheck(ids = null) {
  if (pendingCheck) {
    if (!ids) pendingCheck.ids = null;
    else pendingCheck.ids?.push(...ids);
    return pendingCheck.run;
  }
  const pending = { ids: ids && [...ids] };
  pending.run = serial(() => {
    pendingCheck = null;
    return checkStore(pending.ids && [...new Set(pending.ids)]);
  });
  pendingCheck = pending;
  return pending.run;
}

// onInstalled and onStartup both call this. Chrome keeps alarms across
// restarts, so it only creates one when it is missing.
async function ensureAlarm() {
  if (!(await chrome.alarms.get(STORE_CHECK_ALARM))) {
    await chrome.alarms.create(STORE_CHECK_ALARM, { delayInMinutes: 1, periodInMinutes: STORE_CHECK_MINUTES });
  }
}

// Work is queued right away, before any await, so nothing else (a "Check now"
// from the popup, an extension update) can run ahead of the first-run scan.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  ensureAlarm();
  // When the popup may first ask for a rating. Users updating from 0.1.0 start counting now.
  serial(async () => {
    const { installedAt } = await chrome.storage.local.get('installedAt');
    if (!installedAt) await chrome.storage.local.set({ installedAt: Date.now() });
  });
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
    serial(() => scanInstalled({ baseline: true }));
    serial(() => checkStore());
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  serial(forgetMissing);
  // Tabs restored at startup don't always report their address as an update.
  serial(applySiteRules);
  queueScan();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== STORE_CHECK_ALARM) return;
  serial(forgetMissing);
  queueStoreCheck();
});

// Fires for new installs and for updates of existing extensions.
chrome.management.onInstalled.addListener((ext) => {
  if (ext.type !== 'extension') return;
  queueScan();
  queueStoreCheck([ext.id]);
});

chrome.management.onUninstalled.addListener((id) => serial(() => forget([id])));

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?view=tab') });
  chrome.notifications.clear(id);
});

const handlers = {
  async scan() {
    await queueScan();
    await queueStoreCheck();
  },
  async markSeen() {
    const { alerts } = await load();
    const next = alerts.map((a) => ({ ...a, seen: true }));
    await chrome.storage.local.set({ alerts: next });
    await updateBadge(next);
  },
  async dismiss({ id }) {
    const { alerts } = await load();
    const next = alerts.filter((a) => a.id !== id);
    await chrome.storage.local.set({ alerts: next });
    await updateBadge(next);
  },
  async setSites({ extId, sites }) {
    const { siteRules } = await chrome.storage.local.get({ siteRules: {} });
    if (sites.length) siteRules[extId] = sites;
    else delete siteRules[extId];
    await chrome.storage.local.set({ siteRules });
    await applySiteRules();
  },
  // The user has reviewed the new owner and wants to keep the extension.
  async trust({ extId }) {
    const { storeInfo } = await load();
    if (storeInfo[extId]) storeInfo[extId].ownershipChanged = null;
    await chrome.storage.local.set({ storeInfo });
  },
};

if (!IS_FIREFOX) {
  const siteCheck = () => serial(applySiteRules);
  chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url) siteCheck(); });
  chrome.tabs.onRemoved.addListener(siteCheck);
  chrome.permissions.onAdded.addListener(siteCheck);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  // `scan` queues its own steps; the rest edit storage and must wait their turn.
  const run = msg.type === 'scan' ? handler(msg) : serial(() => handler(msg));
  run.then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
