// Builds the Firefox Add-ons package from the same code. Only the manifest
// differs; see firefox-manifest.mjs.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { firefoxManifest } from './firefox-manifest.mjs';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}build/firefox/`;
const manifest = firefoxManifest(JSON.parse(readFileSync(`${root}manifest.json`, 'utf8')));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}icons`, `${out}icons`, { recursive: true });
cpSync(`${root}src`, `${out}src`, { recursive: true });
writeFileSync(`${out}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const zip = `${root}../store/extension-guardian-${manifest.version}-firefox.zip`;
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'manifest.json', 'icons', 'src'], { cwd: out });
console.log(zip);
