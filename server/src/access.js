// What an extension is able to do, read from the manifest inside its store
// package. Nothing is installed or run: the package is downloaded, its
// manifest.json is read, and the same scoring the browser extension uses
// turns the permissions into a level and reasons.
import { assessAccess } from '../../extension/src/lib/risk.js';

// The package comes whole (the store ignores range requests), so very large
// ones are skipped instead of read into memory.
export const MAX_PACKAGE_BYTES = 30 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 12000;
export const ACCESS_CACHE_SECONDS = 24 * 60 * 60;

const crxUrl = (id) =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx3&x=id%3D${id}%26uc`;

class Unreadable extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// A CRX is a small header followed by an ordinary zip file.
function zipOf(crx) {
  const view = new DataView(crx.buffer, crx.byteOffset, crx.byteLength);
  if (crx.length < 16 || view.getUint32(0, true) !== 0x34327243) throw new Unreadable('format'); // "Cr24"
  const version = view.getUint32(4, true);
  let start;
  if (version === 3) start = 12 + view.getUint32(8, true);
  else if (version === 2) start = 16 + view.getUint32(8, true) + view.getUint32(12, true);
  else throw new Unreadable('format');
  if (start >= crx.length) throw new Unreadable('format');
  return crx.subarray(start);
}

// Reads one file out of a zip through its central directory, so the rest of
// the package is never unpacked.
export async function readZipFile(zip, wanted) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Unreadable('format');
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < entries; i++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== 0x02014b50) throw new Unreadable('format');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (name === wanted) {
      if (offset + 30 > zip.length) throw new Unreadable('format');
      const data = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      const packed = zip.subarray(data, data + size);
      if (method === 0) return packed;
      if (method !== 8) throw new Unreadable('format');
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Unreadable('format');
}

export async function manifestFromPackage(crx) {
  const bytes = await readZipFile(zipOf(crx), 'manifest.json');
  try {
    return JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
  } catch {
    throw new Unreadable('format');
  }
}

const isHostPattern = (p) => p === '<all_urls>' || p.includes('://');

// The same shape chrome.management gives the browser extension: API
// permissions, and the sites it can reach (host permissions, plus Manifest V2
// hosts listed with the permissions, plus where its content scripts run).
export function accessInput(manifest) {
  const listed = (manifest.permissions ?? []).filter((p) => typeof p === 'string');
  const hosts = [
    ...(manifest.host_permissions ?? []),
    ...listed.filter(isHostPattern),
    ...(manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
  ].filter((p) => typeof p === 'string');
  return { permissions: listed.filter((p) => !isHostPattern(p)), hostPermissions: [...new Set(hosts)] };
}

export function summarize(manifest) {
  const { score, level, reasons } = assessAccess(accessInput(manifest));
  return { status: 'ok', level, score, reasons, manifestVersion: manifest.manifest_version ?? null };
}

// Downloads the package, stopping as soon as it grows past the size limit.
async function download(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Unreadable(res.status === 404 ? 'not_found' : 'download');
  if (Number(res.headers.get('Content-Length')) > MAX_PACKAGE_BYTES) {
    await res.body.cancel();
    throw new Unreadable('large');
  }
  const chunks = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PACKAGE_BYTES) {
      await reader.cancel();
      throw new Unreadable('large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}

// { status: 'ok', level, score, reasons } or { status: 'unavailable', code }.
// Results are cached for a day; errors are not, so a later visit tries again
// (except "large", which will not change).
export async function lookupAccess(id, { fetchImpl = fetch, cache = null } = {}) {
  const key = `https://cache.internal/access/${id}`;
  try {
    const hit = await (await cache?.match(key))?.json();
    if (hit) return hit;
  } catch {
    // The cache is a help, never a requirement.
  }
  let result;
  try {
    result = summarize(await manifestFromPackage(await download(crxUrl(id), fetchImpl)));
  } catch (error) {
    result = { status: 'unavailable', code: error instanceof Unreadable ? error.code : 'unreachable' };
  }
  if (result.status === 'ok' || result.code === 'large') {
    await cache?.put(key, new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ACCESS_CACHE_SECONDS}` },
    })).catch(() => {});
  }
  return result;
}
