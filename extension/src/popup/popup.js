import { assessRisk, isFromStore, updateSource } from '../lib/risk.js';
import { edgeStorePageUrl, reviewPageUrl, searchPageUrl, storePageUrl } from '../lib/store.js';
import { IS_FIREFOX, STORE } from '../lib/platform.js';
import { normalizeSite } from '../lib/sites.js';
import { replacementFor } from '../lib/replacements.js';
import { ACCESS_LABEL, RISK_LABEL, listAsText } from '../lib/report.js';
import '../lib/family.js';

const app = document.getElementById('app');
const inTab = new URLSearchParams(location.search).get('view') === 'tab';
if (inTab) document.body.classList.add('tab');

const expanded = new Set();
// What the user is typing in each "Keep off on these sites" box, so a
// re-render doesn't wipe it, and why the last site they added was refused.
const siteDrafts = {};
const siteErrors = {};
// The name filter, shown once the list is long.
const FILTER_FROM = 8;
let filter = '';
// "Copied" or "Couldn't copy" next to the copy button, for a moment.
let copyNote = null;
// The control to focus once it is enabled again; see render().
let pendingFocus = null;
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

const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

// Reads installed extensions and stored results, and rates each extension.
// Sorted with turned-on and riskier extensions first.
async function load() {
  const [all, stored] = await Promise.all([
    chrome.management.getAll(),
    chrome.storage.local.get({
      storeInfo: {}, alerts: [], lastStoreCheckAt: null, storeError: null, installedAt: null, ratePrompt: null,
      siteRules: {}, pausedBySites: [],
    }),
  ]);
  const hasTabs = !IS_FIREFOX && await chrome.permissions.contains({ permissions: ['tabs'] });
  // Private windows' tabs are only visible when the user allows Guardian in incognito.
  const incognito = !IS_FIREFOX && await chrome.extension.isAllowedIncognitoAccess();
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
  data = { exts, ...stored, hasTabs, incognito };
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
        class: 'ghost', title: 'Open in a tab', 'aria-label': 'Open in a tab',
        onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?view=tab') }),
      }, '⤢'),
      h('button', { class: 'primary', 'data-key': 'check', disabled: busy, onclick: checkNow }, busy ? 'Checking…' : 'Check now'),
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
    h('div', { class: 'alert-head' }, h('strong', {}, alert.title), h('time', { datetime: new Date(alert.at).toISOString() }, timeAgo(alert.at))),
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
    h('p', {}, `A rating in ${FROM_EDGE_STORE ? 'Edge Add-ons' : STORE.the} helps other people find it. It takes ten seconds.`),
    h('div', { class: 'actions' },
      h('a', {
        class: 'link', href: FROM_EDGE_STORE ? edgeStorePageUrl(chrome.runtime.id) : reviewPageUrl(chrome.runtime.id), target: '_blank', onclick: () => answer('rated'),
      }, 'Rate it ↗'),
      h('button', { class: 'link muted', onclick: () => answer('dismissed') }, 'No thanks'),
    ),
  );
}

function storeDetails(ext, store) {
  if (!isFromStore(ext)) {
    const why = ext.installType === 'development' ? 'Loaded by you as an unpacked extension.'
      : ext.installType === 'admin' ? 'Installed by your organization.'
      : updateSource(ext) === 'edge' ? 'Installed from Microsoft Edge Add-ons. Developer checks only cover the Chrome Web Store for now.'
      : `Not installed from ${STORE.the}, so we can't check its developer.`;
    return h('p', { class: 'muted' }, why);
  }
  if (!store) return h('p', { class: 'muted' }, 'Not checked yet. Press "Check now".');
  if (store.status === 'unlisted') return h('p', { class: 'muted' }, `Not listed on ${STORE.the}, so we can't check its developer.`);
  if (store.status === 'not_found') return removalHelp(ext);
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

// An extension gone from the store gets no more updates, security fixes
// included. Say what to do instead of only raising the alarm.
function removalHelp(ext) {
  const swap = IS_FIREFOX ? null : replacementFor(ext.id);
  return h('div', { class: 'removed' },
    h('p', { class: 'warn' }, `This extension is no longer listed in ${STORE.the}.`),
    h('p', {}, `${STORE.owner} may have removed it for malware or for breaking the rules, or the developer took it down.${
      IS_FIREFOX ? '' : ' Many older extensions were also removed in 2026 because Chrome no longer supports them (Manifest V2).'
    } Either way, it won't get updates or security fixes any more.`),
    h('h3', {}, 'What to do'),
    h('ol', {},
      h('li', {}, 'If you don\'t need it, remove it.'),
      swap?.id && h('li', {}, 'Switch to ',
        h('a', { class: 'link', href: storePageUrl(swap.id), target: '_blank', rel: 'noopener' }, `${swap.name} ↗`),
        `, ${swap.why}`),
      swap?.builtIn && h('li', {}, swap.builtIn),
      !swap && h('li', {}, 'If you need it, look for a maintained replacement and check it here after installing. ',
        h('a', { class: 'link', href: searchPageUrl(ext.name), target: '_blank', rel: 'noopener' }, 'Search the store ↗')),
    ),
  );
}

function riskReasons(ext, store, risk) {
  const items = risk.reasons.map((r) =>
    h('li', { class: r.kind }, h('strong', {}, r.title), h('span', {}, r.detail)));
  if (!items.length) {
    const note = isFromStore(ext) && !store
      ? 'No warning signs yet. The developer has not been checked, press "Check now".'
      : 'No warning signs found.';
    return h('p', { class: 'muted' }, note);
  }
  return h('ul', { class: 'reasons signals' }, items);
}

// Asks for the tabs permission straight from the click: Chrome only shows the
// prompt during a user action, and the popup may close while it's open.
function askForTabs() {
  return chrome.permissions.request({ permissions: ['tabs'] }).catch(() => false);
}

// The "Keep off on these sites" box in an extension's details. The
// background script does the turning off and on; this only edits the list.
function keepOffSites(ext) {
  const sites = data.siteRules[ext.id] ?? [];
  const save = (next) => send('setSites', { extId: ext.id, sites: next });
  const add = async (event) => {
    event.preventDefault();
    const typed = (siteDrafts[ext.id] ?? '').trim();
    const site = normalizeSite(typed);
    if (!site || sites.includes(site)) {
      if (typed) {
        siteErrors[ext.id] = site ? `${site} is already on the list.` : `"${typed}" doesn't look like a site. Try something like mybank.com.`;
      }
      render();
      return;
    }
    const granted = askForTabs();
    delete siteDrafts[ext.id];
    delete siteErrors[ext.id];
    await save([...sites, site]);
    await granted;
    refresh();
  };
  const error = siteErrors[ext.id];
  return h('div', { class: 'sites' },
    h('h3', {}, 'Keep off on these sites'),
    h('p', { class: 'muted' }, `Guardian turns ${ext.name} off while one of these sites is open in any tab, and back on when you close it. Reload a page that was already open. Tab addresses never leave your device.`),
    sites.length > 0 && !data.incognito && h('p', { class: 'muted' },
      'Private windows count only if you allow Guardian in incognito, on its page in chrome://extensions.'),
    sites.length > 0 && h('ul', { class: 'chips' }, sites.map((site) => h('li', {},
      site,
      h('button', {
        class: 'chip-x', title: `Remove ${site}`, 'aria-label': `Remove ${site}`,
        // Focus moves to the input once the chip is gone.
        onclick: async () => { await save(sites.filter((s) => s !== site)); app.querySelector(`[data-key="site-${ext.id}"]`)?.focus(); refresh(); },
      }, '×'),
    ))),
    sites.length > 0 && !data.hasTabs && h('p', { class: 'warn' },
      'Not active yet: Guardian needs to see the addresses of your open tabs. ',
      h('button', { class: 'link', onclick: async () => { await askForTabs(); refresh(); } }, 'Allow'),
    ),
    h('form', { class: 'site-form', onsubmit: add },
      h('input', {
        type: 'text', placeholder: 'mybank.com', 'aria-label': 'Site to keep it off on', value: siteDrafts[ext.id] ?? '',
        'data-key': `site-${ext.id}`, 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? `site-error-${ext.id}` : null,
        oninput: (e) => {
          siteDrafts[ext.id] = e.target.value;
          // Clear the message without a re-render, so typing isn't interrupted.
          if (siteErrors[ext.id]) {
            delete siteErrors[ext.id];
            e.target.removeAttribute('aria-invalid');
            document.getElementById(`site-error-${ext.id}`)?.remove();
          }
        },
      }),
      h('button', { class: 'secondary', type: 'submit' }, 'Add'),
    ),
    error && h('p', { class: 'warn', id: `site-error-${ext.id}`, role: 'alert' }, error),
  );
}

// One extension in the list: a header button, and the details when open.
function extensionRow({ ext, store, risk }) {
  const open = expanded.has(ext.id);
  const toggle = () => { open ? expanded.delete(ext.id) : expanded.add(ext.id); render(); };
  return h('li', { id: `ext-${ext.id}`, class: `ext ${ext.enabled ? '' : 'disabled'} ${open ? 'open' : ''}` },
    h('button', {
      class: 'ext-head', onclick: toggle, 'aria-expanded': String(open), 'aria-controls': open ? `body-${ext.id}` : null, 'data-key': `head-${ext.id}`,
    },
      iconFor(ext),
      h('div', { class: 'ext-name' },
        h('strong', {}, ext.name),
        h('span', {}, `v${ext.version} · ${ACCESS_LABEL[risk.access.level]}${
          !ext.enabled && data.pausedBySites.includes(ext.id) ? ' · off on this site' : ext.enabled ? '' : ' · turned off'}`),
      ),
      h('span', { class: `pill ${risk.level}` }, RISK_LABEL[risk.level]),
    ),
    open && h('div', { class: 'ext-body', id: `body-${ext.id}` },
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
      !IS_FIREFOX && ext.mayDisable && keepOffSites(ext),
      h('div', { class: 'actions' },
        // Firefox doesn't let one add-on turn off or remove another.
        !IS_FIREFOX && ext.mayDisable && h('button', {
          class: 'secondary', 'data-key': `toggle-${ext.id}`, 'aria-label': `${ext.enabled ? 'Turn off' : 'Turn on'} ${ext.name}`,
          onclick: async () => { await chrome.management.setEnabled(ext.id, !ext.enabled); refresh(); },
        }, ext.enabled ? 'Turn off' : 'Turn on'),
        !IS_FIREFOX && ext.mayDisable && h('button', {
          class: 'danger', 'aria-label': `Remove ${ext.name}`,
          onclick: async () => { try { await chrome.management.uninstall(ext.id, { showConfirmDialog: true }); } catch {} refresh(); },
        }, 'Remove'),
        IS_FIREFOX && h('span', { class: 'muted' }, 'Turn off or remove it in about:addons.'),
        isFromStore(ext) && store?.status !== 'not_found'
          && h('a', { class: 'link', href: storePageUrl(ext.id), target: '_blank' }, 'View in store ↗'),
        ext.installType !== 'development' && updateSource(ext) === 'edge'
          && h('a', { class: 'link', href: edgeStorePageUrl(ext.id), target: '_blank' }, 'View in store ↗'),
      ),
    ),
  );
}

// One line in the footer pointing to the other Tinyward extensions. Plain
// links from family.js: nothing is fetched or tracked.
function moreFromFamily() {
  const others = globalThis.TINYWARD.extensions.filter((e) => e.id !== 'extension-guardian');
  if (!others.length) return null;
  return h('p', { class: 'family' }, `More from ${globalThis.TINYWARD.family}: `,
    others.map((e, i) => [i > 0 && ' · ', h('a', {
      class: 'link', href: (IS_FIREFOX ? e.firefox : e.chrome) ?? e.website, target: '_blank', rel: 'noopener', title: e.short,
    }, e.name.split(':')[0])]));
}

// Shown when the last store check failed. Everything except the developer
// checks runs on the device and keeps working.
function offlineNotice() {
  const where = IS_FIREFOX ? STORE.the : 'the Guardian server';
  return h('article', { class: 'alert medium', role: 'status' },
    h('strong', {}, navigator.onLine === false ? 'You seem to be offline' : `Can't reach ${where}`),
    h('p', {}, `Developer and store checks are paused until ${where} answers. Permission checks still work.${
      data.lastStoreCheckAt ? ` Last successful check: ${timeAgo(data.lastStoreCheckAt)}.` : ''}`),
    h('div', { class: 'actions' }, h('button', { class: 'link', 'data-key': 'retry', disabled: busy, onclick: checkNow }, 'Try again')),
  );
}

function extensionList() {
  if (!data.exts.length) return h('p', { class: 'muted empty' }, 'No other extensions installed. Nice and clean.');
  const words = filter.trim().toLowerCase();
  const shown = words ? data.exts.filter((x) => x.ext.name.toLowerCase().includes(words)) : data.exts;
  return [
    data.exts.length >= FILTER_FROM && h('input', {
      type: 'search', class: 'filter', placeholder: 'Find an extension', 'aria-label': 'Find an extension by name',
      'data-key': 'filter', value: filter,
      oninput: (e) => { filter = e.target.value; render(); },
    }),
    shown.length
      ? h('ul', { class: 'list' }, shown.map(extensionRow))
      : h('p', { class: 'muted empty' }, `No extension matches "${filter.trim()}".`),
  ];
}

// Copies the list as plain text. Nothing is sent anywhere.
async function copyList() {
  const text = listAsText(data.exts);
  try {
    await navigator.clipboard.writeText(text);
    copyNote = 'Copied';
  } catch {
    // Some browsers refuse the clipboard API here; the old way still works.
    const area = h('textarea', { readonly: true, class: 'offscreen' }, text);
    document.body.append(area);
    area.select();
    copyNote = document.execCommand('copy') ? 'Copied' : 'Couldn\'t copy';
    area.remove();
  }
  render();
  setTimeout(() => { copyNote = null; render(); }, 2000);
}

function render() {
  // Every render replaces all nodes, so put focus (and the caret) back on
  // the same control afterwards. Without this, keyboard users lose their
  // place on every click and every background update.
  const active = document.activeElement;
  const focusKey = active?.dataset?.key ?? pendingFocus;
  pendingFocus = null;
  const caret = typeof active?.selectionStart === 'number' ? active.selectionStart : null;

  const unseenFirst = [...data.alerts].sort((a, b) => b.at - a.at);
  // Goes through h() so a missing section is skipped instead of printed as "false".
  app.replaceChildren(...h('div', {},
    header(),
    summary(),
    data.storeError && offlineNotice(),
    unseenFirst.length > 0 && h('section', { class: 'alerts' }, h('h2', {}, 'Alerts'), unseenFirst.map(alertCard)),
    showRatePrompt() && ratePrompt(),
    h('section', {},
      h('h2', {}, 'Your extensions'),
      extensionList(),
    ),
    h('footer', {},
      `Store last checked ${timeAgo(data.lastStoreCheckAt)} · Only extension IDs leave your device`,
      data.exts.length > 0 && h('p', { class: 'export' },
        h('button', { class: 'link', 'data-key': 'copy', onclick: copyList }, 'Copy the list as text'),
        copyNote && h('span', { role: 'status' }, ` · ${copyNote}`)),
      moreFromFamily()),
  ).childNodes);

  const target = focusKey && app.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
  // A disabled button ("Checking…") can't take focus: try again next render.
  if (target?.disabled) {
    pendingFocus = focusKey;
  } else if (target) {
    target.focus();
    if (caret != null) target.setSelectionRange?.(caret, caret);
  }
}

chrome.storage.onChanged.addListener(() => { if (!busy) refresh(); });

await refresh();
send('markSeen');
