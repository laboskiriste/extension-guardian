// Reads public developer information from an extension's Chrome Web Store page.
// The page has no API, so this parses the "Details" list, which renders as
// <div>Label</div><div>Value</div> pairs. Class names are generated, so we
// match on the visible labels only (requested with ?hl=en).
//
// Chrome does not let extensions load store pages, so the parsing runs on our
// server (guardian-server), and the extension asks the server for results.

import { API_BASE } from '../config.js';
import { IS_FIREFOX } from './platform.js';

const STORE_URL = 'https://chromewebstore.google.com/detail/';
const AMO_URL = 'https://addons.mozilla.org/firefox/addon/';
const AMO_API = 'https://addons.mozilla.org/api/v5/addons/addon/';

export function storePageUrl(id) {
  return IS_FIREFOX ? `${AMO_URL}${encodeURIComponent(id)}/` : `${STORE_URL}${id}`;
}

export function reviewPageUrl(id) {
  return IS_FIREFOX ? `${storePageUrl(id)}reviews/` : `${storePageUrl(id)}/reviews`;
}

export function edgeStorePageUrl(id) {
  return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
}

function decode(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(html) {
  return decode(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function detailValue(html, label) {
  const m = new RegExp(`>${label}</div><div[^>]*>([^<]+)<`).exec(html);
  return m ? decode(m[1]) : null;
}

function developerBlock(html) {
  const start = html.indexOf('>Developer</div>');
  if (start < 0) return null;
  const end = html.indexOf('</li>', start);
  return html.slice(start + '>Developer</div>'.length, end < 0 ? undefined : end);
}

function parseDeveloper(block) {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(block)?.[0] ?? null;
  const href = /href="(https?:\/\/[^"]+)"/.exec(block)?.[1];
  let website = null;
  if (href) {
    try {
      website = new URL(decode(href)).hostname.replace(/^www\./, '');
    } catch {}
  }
  // Name and postal address sit in the first div, separated by <br>, before
  // the Website link and the Email/Phone <details>.
  const nameHtml = block
    .replace(/<details[\s\S]*?<\/details>/g, '')
    .replace(/<a[\s\S]*?<\/a>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '');
  const [first, ...rest] = nameHtml.split(/<br\s*\/?>/);
  const name = stripTags(first) || null;
  const address = stripTags(rest.join(' ')) || null;
  return { name, address, email, website };
}

export function parseStorePage(html) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim();
  const block = developerBlock(html);
  // Pages for removed extensions keep the generic store title and have no details.
  if (!block && (!title || title === 'Chrome Web Store')) {
    return { status: 'not_found' };
  }
  const developer = block ? parseDeveloper(block) : {};
  let trader = null;
  if (html.includes('>Non-trader</div>')) trader = 'non-trader';
  else if (html.includes('>Trader</div>')) trader = 'trader';

  return {
    status: 'ok',
    title: title ? decode(title.replace(/\s*-\s*Chrome Web Store$/, '')) : null,
    offeredBy: detailValue(html, 'Offered by'),
    developerName: developer.name ?? null,
    developerAddress: developer.address ?? null,
    email: developer.email ?? null,
    website: developer.website ?? null,
    trader,
    version: detailValue(html, 'Version'),
    updated: detailValue(html, 'Updated'),
    users: />([\d,.]+\+?) users</.exec(html)?.[1] ?? null,
    // The listing's icon, used by the web checker. Only Google's image host is accepted.
    icon: /<meta property="og:image" content="(https:\/\/lh3\.googleusercontent\.com\/[^"]+)"/.exec(html)?.[1] ?? null,
  };
}

// Translated fields come back as { "en-US": "..." }, or a plain string.
const amoText = (v) => (typeof v === 'string' ? v : v?.['en-US'] ?? Object.values(v ?? {}).find(Boolean)) || null;

// Firefox Add-ons has a public API, so Firefox asks it directly instead of
// going through our server. Same result shape as parseStorePage.
export function parseAmoAddon(addon) {
  if (addon.is_disabled || addon.status !== 'public') return { status: 'not_found' };
  const authors = (addon.authors ?? []).map((a) => a.name).filter(Boolean);
  let website = null;
  try {
    website = new URL(amoText(addon.homepage?.url)).hostname.replace(/^www\./, '');
  } catch {}
  const updated = addon.last_updated ? new Date(addon.last_updated) : null;
  return {
    status: 'ok',
    title: amoText(addon.name),
    offeredBy: null,
    developerName: authors.join(', ') || null,
    developerAddress: null,
    email: amoText(addon.support_email),
    website,
    trader: null,
    version: addon.current_version?.version ?? null,
    updated: updated && !Number.isNaN(updated.getTime())
      ? updated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      : null,
    users: Number.isFinite(addon.average_daily_users) ? addon.average_daily_users.toLocaleString('en-US') : null,
    icon: null,
  };
}

async function fetchAmoInfo(id, fetchImpl) {
  const res = await fetchImpl(`${AMO_API}${encodeURIComponent(id)}/?lang=en-US`, { credentials: 'omit' });
  // Unlisted and deleted add-ons answer 401 or 404.
  if (res.status === 404 || res.status === 401) return { status: 'not_found', checkedAt: Date.now() };
  if (!res.ok) throw new Error(`Firefox Add-ons returned ${res.status}`);
  return { ...parseAmoAddon(await res.json()), checkedAt: Date.now() };
}

export async function fetchAmoInfoBatch(ids, fetchImpl = fetch) {
  const results = {};
  let failure = null;
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(ids.slice(i, i + 4).map(async (id) => {
      try {
        results[id] = await fetchAmoInfo(id, fetchImpl);
      } catch (err) {
        failure = err;
      }
    }));
  }
  // Like the server path: one failed add-on keeps its old data, but if every
  // lookup failed the store is unreachable.
  if (failure && !Object.keys(results).length) throw failure;
  return results;
}

export const MAX_IDS_PER_REQUEST = 20;

// Returns { [id]: info } for ids the server could check. Ids that failed on
// the server's side (status "error") are left out, so callers keep old data.
export async function fetchStoreInfoBatch(ids, fetchImpl = fetch) {
  if (IS_FIREFOX) return fetchAmoInfoBatch(ids, fetchImpl);
  const results = {};
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
    const res = await fetchImpl(`${API_BASE}/v1/store?ids=${chunk.join(',')}`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`Guardian server returned ${res.status}`);
    const body = await res.json();
    for (const [id, info] of Object.entries(body.results ?? {})) {
      if (info.status === 'ok' || info.status === 'not_found') results[id] = info;
    }
  }
  return results;
}
