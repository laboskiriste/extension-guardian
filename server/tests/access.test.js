import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/handler.js';
import { lookupAccess, manifestFromPackage, accessInput, MAX_PACKAGE_BYTES } from '../src/access.js';

const ID = 'a'.repeat(32);

// A minimal zip with one deflated or stored file, wrapped as a CRX3.
function zipWith(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method = 8] of entries) {
    const raw = Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

function crx3(zip, header = Buffer.from('signature-bytes')) {
  const top = Buffer.alloc(12);
  top.write('Cr24', 0);
  top.writeUInt32LE(3, 4);
  top.writeUInt32LE(header.length, 8);
  return new Uint8Array(Buffer.concat([top, header, zip]));
}

const manifest = (extra) => JSON.stringify({ manifest_version: 3, name: 'Test', version: '1', ...extra });
const packageOf = (extra, method) => crx3(zipWith([['icon.png', 'not json', 0], ['manifest.json', manifest(extra), method]]));
const respond = (bytes, init) => async () => new Response(bytes, init);

const memory = new Map();
const cache = {
  match: async (k) => (memory.has(k) ? new Response(memory.get(k)) : undefined),
  put: async (k, r) => { memory.set(k, await r.text()); },
};

test('reads the manifest from a CRX3 package, deflated or stored', async () => {
  for (const method of [8, 0]) {
    const m = await manifestFromPackage(packageOf({ permissions: ['tabs'] }, method));
    assert.deepEqual(m.permissions, ['tabs']);
  }
});

test('Manifest V2 hosts and content scripts count as sites it can reach', () => {
  const input = accessInput({
    permissions: ['storage', 'https://*.example.com/*', '<all_urls>'],
    host_permissions: ['https://mail.google.com/*'],
    content_scripts: [{ matches: ['https://a.test/*', 'https://mail.google.com/*'] }],
  });
  assert.deepEqual(input.permissions, ['storage']);
  assert.deepEqual(input.hostPermissions.sort(), ['<all_urls>', 'https://*.example.com/*', 'https://a.test/*', 'https://mail.google.com/*']);
});

test('an extension that can read every site is full access', async () => {
  const result = await lookupAccess(ID, {
    fetchImpl: respond(packageOf({ permissions: ['cookies', 'webRequest'], host_permissions: ['<all_urls>'] })),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.level, 'full');
  assert.equal(result.manifestVersion, 3);
  assert.match(result.reasons[0].title, /all websites/);
});

test('an extension with no sensitive permissions is basic access', async () => {
  const result = await lookupAccess(ID, { fetchImpl: respond(packageOf({ permissions: ['storage'] })) });
  assert.equal(result.level, 'basic');
  assert.deepEqual(result.reasons, []);
});

test('unreadable packages come back as unavailable, with a code', async () => {
  assert.deepEqual(await lookupAccess(ID, { fetchImpl: respond('<html>not a crx</html>') }), { status: 'unavailable', code: 'format' });
  assert.deepEqual(await lookupAccess(ID, { fetchImpl: respond('', { status: 404 }) }), { status: 'unavailable', code: 'not_found' });
  assert.deepEqual(await lookupAccess(ID, { fetchImpl: respond('', { status: 500 }) }), { status: 'unavailable', code: 'download' });
  assert.deepEqual(await lookupAccess(ID, { fetchImpl: async () => { throw new Error('boom'); } }), { status: 'unavailable', code: 'unreachable' });
  const noManifest = crx3(zipWith([['readme.txt', 'hi']]));
  assert.equal((await lookupAccess(ID, { fetchImpl: respond(noManifest) })).code, 'format');
});

test('packages over the size limit are not read', async () => {
  const announced = respond(packageOf({}), { headers: { 'Content-Length': String(MAX_PACKAGE_BYTES + 1) } });
  assert.equal((await lookupAccess(ID, { fetchImpl: announced })).code, 'large');
  // No Content-Length: the limit applies while streaming.
  const big = new Uint8Array(MAX_PACKAGE_BYTES + 1);
  assert.equal((await lookupAccess(ID, { fetchImpl: respond(big) })).code, 'large');
});

test('good results are cached for a day, errors are not', async () => {
  let calls = 0;
  const counting = async () => { calls++; return new Response(packageOf({ permissions: ['storage'] })); };
  await lookupAccess(ID, { fetchImpl: counting, cache });
  await lookupAccess(ID, { fetchImpl: counting, cache });
  assert.equal(calls, 1);
  const other = 'b'.repeat(32);
  await lookupAccess(other, { fetchImpl: respond('', { status: 500 }), cache });
  assert.equal(memory.has(`https://cache.internal/access/${other}`), false);
});

test('the download asks the store for the CRX of that id', async () => {
  let asked;
  await lookupAccess(ID, { fetchImpl: async (url) => { asked = url; return new Response('', { status: 404 }); } });
  assert.match(asked, /^https:\/\/clients2\.google\.com\/service\/update2\/crx\?/);
  assert.ok(asked.includes(`id%3D${ID}`));
});

test('the extension page shows what it can do, and still works when the package can\'t be read', async () => {
  const DARK = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
  const listing = readFileSync(new URL('../../extension/tests/fixtures/dark-reader.html', import.meta.url), 'utf8');
  const fetchFor = (pkg) => async (url) => (String(url).includes('chromewebstore.google.com')
    ? new Response(listing)
    : pkg());
  const get = (fetchImpl) => handleRequest(new Request(`http://x/extension/dark-reader/${DARK}`), { fetchImpl });

  const full = await (await get(fetchFor(() => new Response(packageOf({ permissions: ['cookies'], host_permissions: ['<all_urls>'] }))))).text();
  assert.match(full, /What it can do/);
  assert.match(full, /Full access/);
  assert.match(full, /Can read and change data on all websites/);

  const basic = await (await get(fetchFor(() => new Response(packageOf({ permissions: ['storage'] }))))).text();
  assert.match(basic, /Basic access/);

  const broken = await get(fetchFor(() => new Response('', { status: 500 })));
  assert.equal(broken.status, 200);
  assert.match(await broken.text(), /couldn&#39;t read its permissions|couldn't read its permissions/);
});
