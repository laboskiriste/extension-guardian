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

for (const [id, label] of Object.entries(IDS)) {
  const res = await fetch(`https://chromewebstore.google.com/detail/${id}?hl=en`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) problems.push(`store: ${label} answered ${res.status}`);
  else check('store', label, parseStorePage(await res.text()));
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
