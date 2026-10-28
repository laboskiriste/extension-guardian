import { assessRisk, isFromChromeWebStore } from './lib/risk.js';
import { snapshotOf, diffSnapshots, diffStoreInfo } from './lib/changes.js';
import { fetchStoreInfoBatch } from './lib/store.js';

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

function load() {
  return chrome.storage.local.get({ snapshots: {}, storeInfo: {}, alerts: [] });
}

async function installedExtensions() {
  const all = await chrome.management.getAll();
  return all.filter((e) => e.type === 'extension' && e.id !== chrome.runtime.id);
}

function makeAlert(ext, change) {
  return {
    ...change,
    id: `${ext.id}:${change.type}:${Date.now()}`,
    extId: ext.id,
    extName: ext.name,
    at: Date.now(),
    seen: false,
  };
}

async function updateBadge(alerts) {
  const unseen = alerts.filter((a) => !a.seen);
  await chrome.action.setBadgeText({ text: unseen.length ? String(unseen.length) : '' });
  const high = unseen.some((a) => a.severity === 'high');
  await chrome.action.setBadgeBackgroundColor({ color: high ? '#d93025' : '#e37400' });
}

async function addAlerts(fresh) {
  if (!fresh.length) return;
  const { alerts } = await load();
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
// With `baseline`, it only records the current state (first run).
async function scanInstalled({ baseline = false } = {}) {
  const { snapshots, storeInfo } = await load();
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

// Looks up each extension's Chrome Web Store page and compares the developer.
async function checkStore(onlyIds = null) {
  const exts = (await installedExtensions())
    .filter(isFromChromeWebStore)
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
  for (const [ext, info] of results) {
    const prev = storeInfo[ext.id];
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

async function forget(id) {
  const { snapshots, storeInfo } = await load();
  delete snapshots[id];
  delete storeInfo[id];
  await chrome.storage.local.set({ snapshots, storeInfo });
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get(STORE_CHECK_ALARM))) {
    chrome.alarms.create(STORE_CHECK_ALARM, { delayInMinutes: 1, periodInMinutes: STORE_CHECK_MINUTES });
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  ensureAlarm();
  if (reason === 'install') {
    serial(() => scanInstalled({ baseline: true }));
    serial(() => checkStore());
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  serial(() => scanInstalled());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STORE_CHECK_ALARM) serial(() => checkStore());
});

// Fires for new installs and for updates of existing extensions.
chrome.management.onInstalled.addListener((ext) => {
  if (ext.type !== 'extension') return;
  serial(() => scanInstalled());
  serial(() => checkStore([ext.id]));
});

chrome.management.onUninstalled.addListener((id) => serial(() => forget(id)));

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?view=tab') });
  chrome.notifications.clear(id);
});

const handlers = {
  async scan() {
    await serial(() => scanInstalled());
    await serial(() => checkStore());
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
  // The user has reviewed the new owner and wants to keep the extension.
  async trust({ extId }) {
    const { storeInfo } = await load();
    if (storeInfo[extId]) storeInfo[extId].ownershipChanged = null;
    await chrome.storage.local.set({ storeInfo });
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  // `scan` queues its own steps; the rest edit storage and must wait their turn.
  const run = msg.type === 'scan' ? handler(msg) : serial(() => handler(msg));
  run.then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
