import { assessRisk, isFromChromeWebStore, updateSource } from '../lib/risk.js';
import { edgeStorePageUrl, storePageUrl } from '../lib/store.js';

const app = document.getElementById('app');
const inTab = new URLSearchParams(location.search).get('view') === 'tab';
if (inTab) document.body.classList.add('tab');

const expanded = new Set();
let busy = false;
let data = { exts: [], storeInfo: {}, alerts: [], lastStoreCheckAt: null, storeError: null };

// Builds DOM nodes. Extension names and store data come from third parties,
// so text is always set as text, never as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function timeAgo(ms) {
  if (!ms) return 'never';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const RISK_LABEL = { high: 'High risk', watch: 'Watch', low: 'Low risk' };
const ACCESS_LABEL = { full: 'Full access', limited: 'Limited access', basic: 'Basic access' };
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

async function load() {
  const [all, stored] = await Promise.all([
    chrome.management.getAll(),
    chrome.storage.local.get({
      storeInfo: {}, alerts: [], lastStoreCheckAt: null, storeError: null, installedAt: null, ratePrompt: null,
    }),
  ]);
  const exts = all
    .filter((e) => e.type === 'extension' && e.id !== chrome.runtime.id)
    .map((ext) => {
      const store = stored.storeInfo[ext.id];
      const recentAccessIncrease = stored.alerts.some((a) => a.extId === ext.id
        && (a.type === 'new_permissions' || a.type === 'new_hosts') && Date.now() - a.at < RECENT_MS);
      const risk = assessRisk(ext, { store, ownershipChanged: Boolean(store?.ownershipChanged), recentAccessIncrease });
      return { ext, store, risk };
    })
    .sort((a, b) => (b.ext.enabled - a.ext.enabled)
      || (b.risk.score - a.risk.score)
      || (b.risk.access.score - a.risk.access.score)
      || a.ext.name.localeCompare(b.ext.name));
  data = { exts, ...stored };
}

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

async function refresh() {
  await load();
  render();
}

async function checkNow() {
  busy = true;
  render();
  try {
    await send('scan');
  } finally {
    busy = false;
    await refresh();
  }
}

function iconFor(ext) {
  const icons = [...(ext.icons ?? [])].sort((a, b) => a.size - b.size);
  const best = icons.find((i) => i.size >= 32) ?? icons.at(-1);
  const letter = h('div', { class: 'icon letter' }, (ext.name[0] ?? '?').toUpperCase());
  if (!best) return letter;
  return h('img', { class: 'icon', src: best.url, alt: '', onerror: (e) => e.target.replaceWith(letter) });
}

function header() {
  return h('header', {},
    h('div', { class: 'brand' },
      h('img', { src: '../../icons/icon48.png', alt: '' }),
      h('div', {}, h('h1', {}, 'Extension Guardian'), h('p', {}, 'Watches your extensions so you don\'t have to')),
    ),
    h('div', { class: 'header-actions' },
      !inTab && h('button', {
        class: 'ghost', title: 'Open in a tab',
        onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?view=tab') }),
      }, '⤢'),
      h('button', { class: 'primary', disabled: busy, onclick: checkNow }, busy ? 'Checking…' : 'Check now'),
    ),
  );
}

function summary() {
  const enabled = data.exts.filter((x) => x.ext.enabled);
  const high = enabled.filter((x) => x.risk.level === 'high').length;
  const watch = enabled.filter((x) => x.risk.level === 'watch').length;
  return h('section', { class: 'summary' },
    h('div', { class: 'stat' }, h('strong', {}, enabled.length), h('span', {}, 'active')),
    h('div', { class: `stat ${high ? 'high' : ''}` }, h('strong', {}, high), h('span', {}, 'high risk')),
    h('div', { class: `stat ${watch ? 'watch' : ''}` }, h('strong', {}, watch), h('span', {}, 'to watch')),
    h('div', { class: `stat ${data.alerts.length ? 'high' : ''}` }, h('strong', {}, data.alerts.length), h('span', {}, 'alerts')),
  );
}

function alertCard(alert) {
  const actions = [
    h('button', { class: 'link', onclick: () => { expanded.add(alert.extId); render(); document.getElementById(`ext-${alert.extId}`)?.scrollIntoView({ behavior: 'smooth' }); } }, 'Review'),
    alert.type === 'ownership_changed' && h('button', {
      class: 'link', onclick: async () => { await send('trust', { extId: alert.extId }); await send('dismiss', { id: alert.id }); refresh(); },
    }, 'I trust the new owner'),
    h('button', { class: 'link muted', onclick: async () => { await send('dismiss', { id: alert.id }); refresh(); } }, 'Dismiss'),
  ];
  return h('article', { class: `alert ${alert.severity}` },
    h('div', { class: 'alert-head' }, h('strong', {}, alert.title), h('time', {}, timeAgo(alert.at))),
    h('p', {}, alert.detail),
    h('div', { class: 'actions' }, actions),
  );
}

// Stores add update_url to the manifest, so this tells which store we came from.
const FROM_EDGE_STORE = updateSource({ updateUrl: chrome.runtime.getManifest().update_url }) === 'edge';

// Asked once, after a week of use, and never while a serious alert is open.
const RATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function showRatePrompt() {
  return !data.ratePrompt && data.installedAt && Date.now() - data.installedAt >= RATE_AFTER_MS
    && !data.alerts.some((a) => a.severity === 'high');
}

function ratePrompt() {
  const answer = async (value) => { await chrome.storage.local.set({ ratePrompt: value }); refresh(); };
  return h('article', { class: 'alert low rate' },
    h('strong', {}, 'Is Extension Guardian useful to you?'),
    h('p', {}, `A rating in ${FROM_EDGE_STORE ? 'Edge Add-ons' : 'the Chrome Web Store'} helps other people find it. It takes ten seconds.`),
    h('div', { class: 'actions' },
      h('a', {
        class: 'link', href: FROM_EDGE_STORE ? edgeStorePageUrl(chrome.runtime.id) : `${storePageUrl(chrome.runtime.id)}/reviews`, target: '_blank', onclick: () => answer('rated'),
      }, 'Rate it ↗'),
      h('button', { class: 'link muted', onclick: () => answer('dismissed') }, 'No thanks'),
    ),
  );
}

function storeDetails(ext, store) {
  if (!isFromChromeWebStore(ext)) {
    const why = ext.installType === 'development' ? 'Loaded by you as an unpacked extension.'
      : ext.installType === 'admin' ? 'Installed by your organization.'
      : updateSource(ext) === 'edge' ? 'Installed from Microsoft Edge Add-ons. Developer checks only cover the Chrome Web Store for now.'
      : 'Not installed from the Chrome Web Store, so we can\'t check its developer.';
    return h('p', { class: 'muted' }, why);
  }
  if (!store) return h('p', { class: 'muted' }, 'Not checked yet. Press "Check now".');
  if (store.status === 'not_found') return h('p', { class: 'warn' }, 'This extension is no longer listed in the Chrome Web Store.');
  const rows = [
    ['Developer', store.developerName ?? store.offeredBy],
    ['Email', store.email],
    ['Website', store.website],
    ['Status', store.trader === 'trader' ? 'Registered business (EU trader)' : store.trader === 'non-trader' ? 'Individual (not an EU trader)' : null],
    ['Users', store.users],
    ['Last updated', store.updated],
    ['Checked', timeAgo(store.checkedAt)],
  ].filter(([, v]) => v);
  return h('dl', {}, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

function riskReasons(ext, store, risk) {
  const items = risk.reasons.map((r) =>
    h('li', { class: r.kind }, h('strong', {}, r.title), h('span', {}, r.detail)));
  if (!items.length) {
    const note = isFromChromeWebStore(ext) && !store
      ? 'No warning signs yet. The developer has not been checked, press "Check now".'
      : 'No warning signs found.';
    return h('p', { class: 'muted' }, note);
  }
  return h('ul', { class: 'reasons signals' }, items);
}

function extensionRow({ ext, store, risk }) {
  const open = expanded.has(ext.id);
  const toggle = () => { open ? expanded.delete(ext.id) : expanded.add(ext.id); render(); };
  return h('li', { id: `ext-${ext.id}`, class: `ext ${ext.enabled ? '' : 'disabled'} ${open ? 'open' : ''}` },
    h('button', { class: 'ext-head', onclick: toggle, 'aria-expanded': String(open) },
      iconFor(ext),
      h('div', { class: 'ext-name' },
        h('strong', {}, ext.name),
        h('span', {}, `v${ext.version} · ${ACCESS_LABEL[risk.access.level]}${ext.enabled ? '' : ' · turned off'}`),
      ),
      h('span', { class: `pill ${risk.level}` }, RISK_LABEL[risk.level]),
    ),
    open && h('div', { class: 'ext-body' },
      store?.ownershipChanged && h('p', { class: 'warn' },
        `Developer changed from "${store.ownershipChanged.from}" to "${store.ownershipChanged.to}".`),
      h('h3', {}, 'Why this risk level'),
      riskReasons(ext, store, risk),
      h('h3', {}, `What it can do · ${ACCESS_LABEL[risk.access.level]}`),
      risk.access.reasons.length
        ? h('ul', { class: 'reasons' }, risk.access.reasons.map((r) =>
            h('li', {}, h('strong', {}, r.title), h('span', {}, r.detail))))
        : h('p', { class: 'muted' }, 'Nothing sensitive. It only uses basic permissions.'),
      h('h3', {}, 'Who makes it'),
      storeDetails(ext, store),
      h('div', { class: 'actions' },
        ext.mayDisable && h('button', {
          class: 'secondary',
          onclick: async () => { await chrome.management.setEnabled(ext.id, !ext.enabled); refresh(); },
        }, ext.enabled ? 'Turn off' : 'Turn on'),
        ext.mayDisable && h('button', {
          class: 'danger',
          onclick: async () => { try { await chrome.management.uninstall(ext.id, { showConfirmDialog: true }); } catch {} refresh(); },
        }, 'Remove'),
        isFromChromeWebStore(ext) && h('a', { class: 'link', href: storePageUrl(ext.id), target: '_blank' }, 'View in store ↗'),
        ext.installType !== 'development' && updateSource(ext) === 'edge'
          && h('a', { class: 'link', href: edgeStorePageUrl(ext.id), target: '_blank' }, 'View in store ↗'),
      ),
    ),
  );
}

function render() {
  const unseenFirst = [...data.alerts].sort((a, b) => b.at - a.at);
  // Goes through h() so a missing section is skipped instead of printed as "false".
  app.replaceChildren(...h('div', {},
    header(),
    summary(),
    unseenFirst.length > 0 && h('section', { class: 'alerts' }, h('h2', {}, 'Alerts'), unseenFirst.map(alertCard)),
    showRatePrompt() && ratePrompt(),
    h('section', {},
      h('h2', {}, 'Your extensions'),
      data.exts.length
        ? h('ul', { class: 'list' }, data.exts.map(extensionRow))
        : h('p', { class: 'muted empty' }, 'No other extensions installed. Nice and clean.'),
    ),
    h('footer', {},
      data.storeError && h('p', { class: 'warn' }, 'Could not reach the Guardian server, so developer checks are paused.'),
      `Store last checked ${timeAgo(data.lastStoreCheckAt)} · Only extension IDs leave your device`),
  ).childNodes);
}

chrome.storage.onChanged.addListener(() => { if (!busy) refresh(); });

await refresh();
send('markSeen');
