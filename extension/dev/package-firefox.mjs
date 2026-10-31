// Builds the Firefox Add-ons package from the same code. Only the manifest
// differs: Firefox runs the background as a module script instead of a
// service worker, and needs an add-on id and a data collection statement.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}build/firefox/`;
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));

delete manifest.minimum_chrome_version;
manifest.description = manifest.description.replace('the Chrome Web Store', 'the store');
manifest.background = { scripts: ['src/background.js'], type: 'module' };
manifest.browser_specific_settings = {
  gecko: {
    id: 'extension-guardian@laboskiriste',
    strict_min_version: '140.0',
    // Lookups go straight to addons.mozilla.org; nothing reaches the developer.
    data_collection_permissions: { required: ['none'] },
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}icons`, `${out}icons`, { recursive: true });
cpSync(`${root}src`, `${out}src`, { recursive: true });
writeFileSync(`${out}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const zip = `${root}../store/extension-guardian-${manifest.version}-firefox.zip`;
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'manifest.json', 'icons', 'src'], { cwd: out });
console.log(zip);
