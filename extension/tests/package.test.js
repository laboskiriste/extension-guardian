// Checks the package itself: syntax of every script, files the manifest and
// pages point to, what goes into the zip, and the Firefox manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest } from '../dev/firefox-manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

function filesIn(dir) {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)));
}

test('every script parses', () => {
  const scripts = [...filesIn('src'), ...filesIn('dev'), ...filesIn('tests')].filter((f) => /\.m?js$/.test(f));
  assert.ok(scripts.length > 10);
  for (const file of scripts) {
    // Throws with the syntax error if the file doesn't parse.
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' });
  }
});

test('the zip holds only what the extension runs', () => {
  // `npm run package` zips manifest.json, _locales/, icons/ and src/.
  for (const file of [...filesIn('icons'), ...filesIn('src')]) {
    assert.match(file, /\.(js|html|css|png)$/, file);
    assert.ok(!/(^|\/)\./.test(file), `hidden file ${file}`);
    assert.ok(!/\.test\.js$/.test(file), `test file ${file}`);
  }
  assert.match(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts.package, /zip -qr \S+ manifest\.json _locales icons src &&/);
});

test('files the manifest and pages point to exist', () => {
  const refs = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const ref of refs) assert.ok(existsSync(join(root, ref)), ref);
  for (const page of filesIn('src').filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(join(root, page), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      assert.ok(existsSync(join(root, dirname(page), ref)), `${page} -> ${ref}`);
    }
  }
});

test('the permissions are what the store listing promises', () => {
  // Adding one shows users a new warning and needs a new store review.
  assert.deepEqual(manifest.permissions, ['management', 'storage', 'alarms', 'notifications']);
  assert.deepEqual(manifest.optional_permissions, ['tabs']);
  assert.equal(manifest.host_permissions, undefined);
});

test('the Firefox manifest', () => {
  const ff = firefoxManifest(manifest);
  assert.equal(ff.manifest_version, 3);
  assert.equal(ff.version, manifest.version);
  assert.deepEqual(ff.background, { scripts: ['src/background.js'], type: 'module' });
  assert.equal(ff.minimum_chrome_version, undefined);
  assert.equal(ff.optional_permissions, undefined, 'never asks for tabs');
  assert.deepEqual(ff.permissions, manifest.permissions);
  assert.equal(ff.browser_specific_settings.gecko.id, 'extension-guardian@laboskiriste');
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  assert.equal(ff.description, '__MSG_extDescription__', 'the same store-neutral text as Chrome');
  assert.ok(manifest.background.service_worker, 'the Chrome manifest is left alone');
});
