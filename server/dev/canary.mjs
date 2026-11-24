// Daily check that the store parser still works (run by .github/workflows/canary.yml).
// If Google changes the store page layout, the parser can stop finding the
// developer without any error, and the owner check silently stops working.
// This reads three well-known listings directly and through the live server,
// and fails (GitHub then emails the repo owner) if anything is missing.
import { parseStorePage } from '../../extension/src/lib/store.js';

const SERVER = 'https://app.extensionguardian.workers.dev';
const IDS = {
  ddkjiahejlhfcafbddmgiahcphecmpfh: 'uBlock Origin Lite (non-trader)',
  eimadpbcbfnmbkopoojfekhnkhdbieeh: 'Dark Reader (trader)',
  mpceklcidiadoneogfmpkjpadihmlcjd: 'Extension Guardian',
};
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const problems = [];
const check = (where, label, info) => {
  const missing = ['title', 'version', 'users'].filter((f) => !info?.[f]);
  if (info?.status !== 'ok') problems.push(`${where}: ${label} has status ${info?.status} (${info?.code ?? ''})`);
  else if (!info.offeredBy && !info.developerName) problems.push(`${where}: ${label} has no developer`);
  else if (missing.length) problems.push(`${where}: ${label} is missing ${missing.join(', ')}`);
  else console.log(`ok  ${where}: ${label}: ${info.developerName ?? info.offeredBy}, ${info.users} users`);
};

// The store page sometimes comes back without the user count or developer for a
// single request, so a listing gets a few tries before it counts as a problem.
const ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readStore = async (id) => {
  const res = await fetch(`https://chromewebstore.google.com/detail/${id}?hl=en`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
    signal: AbortSignal.timeout(20000),
  });
  return res.ok ? { info: parseStorePage(await res.text()) } : { status: res.status };
};

const isComplete = (info) => info?.status === 'ok' && ['title', 'version', 'users'].every((f) => info[f]);

for (const [id, label] of Object.entries(IDS)) {
  let result;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      result = await readStore(id);
    } catch (err) {
      result = { error: err.message };
    }
    if (isComplete(result.info)) break;
    if (attempt < ATTEMPTS) await sleep(5000 * attempt);
  }
  if (result.info) check('store', label, result.info);
  else problems.push(`store: ${label} ${result.status ? `answered ${result.status}` : `failed (${result.error})`}`);
}

const res = await fetch(`${SERVER}/v1/store?ids=${Object.keys(IDS).join(',')}`, { signal: AbortSignal.timeout(30000) });
if (!res.ok) problems.push(`server answered ${res.status}`);
else {
  const { results } = await res.json();
  for (const [id, label] of Object.entries(IDS)) check('server', label, results?.[id]);
}

if (problems.length) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
