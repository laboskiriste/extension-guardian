import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, isBroadHost, hostLabel, describePermission } from '../src/lib/permissions.js';

// Permissions that don't give access to anything private, so they have no
// entry and add nothing to the access score. Every Chrome permission (and
// Firefox's webRequestBlocking) must be either here or in PERMISSIONS, so a
// new one is a decision and not an oversight.
const BENIGN = [
  'accessibilityFeatures.modify', 'accessibilityFeatures.read', 'activeTab', 'alarms', 'audio', 'background',
  'clipboardWrite', 'contextMenus', 'declarativeContent', 'declarativeNetRequest', 'dns', 'documentScan',
  'downloads.ui', 'enterprise.deviceAttributes', 'enterprise.hardwarePlatform', 'enterprise.networkingAttributes',
  'favicon', 'fileBrowserHandler', 'fileSystemProvider', 'fontSettings', 'gcm', 'idle', 'loginState',
  'notifications', 'offscreen', 'power', 'printerProvider', 'printing', 'printingMetrics', 'processes', 'runtime',
  'search', 'sidePanel', 'storage', 'system.cpu', 'system.display', 'system.memory', 'system.storage', 'tabGroups',
  'tts', 'ttsEngine', 'unlimitedStorage', 'wallpaper',
];

// From https://developer.chrome.com/docs/extensions/reference/permissions-list
const ALL = [
  ...BENIGN,
  'bookmarks', 'browsingData', 'certificateProvider', 'clipboardRead', 'contentSettings', 'cookies', 'debugger',
  'declarativeNetRequestFeedback', 'declarativeNetRequestWithHostAccess', 'desktopCapture', 'downloads',
  'downloads.open', 'enterprise.platformKeys', 'geolocation', 'history', 'identity', 'identity.email', 'management',
  'nativeMessaging', 'pageCapture', 'platformKeys', 'privacy', 'proxy', 'readingList', 'scripting', 'sessions',
  'tabCapture', 'tabs', 'topSites', 'userScripts', 'vpnProvider', 'webAuthenticationProxy', 'webNavigation',
  'webRequest', 'webRequestAuthProvider', 'webRequestBlocking',
];

test('every permission is described or known to be harmless', () => {
  for (const name of ALL) {
    assert.ok(PERMISSIONS[name] || BENIGN.includes(name), `${name} has no entry`);
    assert.ok(!(PERMISSIONS[name] && BENIGN.includes(name)), `${name} is in both lists`);
  }
  for (const name of Object.keys(PERMISSIONS)) assert.ok(ALL.includes(name), `${name} is not a known permission`);
});

test('every described permission has a weight, a title and a detail', () => {
  for (const [name, info] of Object.entries(PERMISSIONS)) {
    assert.ok(Number.isInteger(info.weight) && info.weight > 0, `${name} weight`);
    if ('broadWeight' in info) assert.ok(info.broadWeight > info.weight, `${name} broadWeight`);
    assert.match(info.title, /^[A-Z].*[^.]$/, `${name} title is a short phrase`);
    assert.match(info.detail, /\.$/, `${name} detail ends with a full stop`);
  }
  assert.equal(describePermission('cookies'), 'Can read your cookies');
  assert.equal(describePermission('storage'), 'storage');
});

test('host patterns: which ones mean every website', () => {
  for (const p of ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*', 'https://*/', 'wss://*/*']) {
    assert.ok(isBroadHost(p), p);
  }
  for (const p of ['https://*.google.com/*', '*://mail.google.com/*', 'file:///*', 'https://example.com/*']) {
    assert.ok(!isBroadHost(p), p);
  }
});

test('host patterns get short labels', () => {
  assert.equal(hostLabel('https://*.google.com/*'), 'google.com');
  assert.equal(hostLabel('*://mail.yahoo.com/*'), 'mail.yahoo.com');
  assert.equal(hostLabel('http://localhost:8080/*'), 'localhost:8080');
  assert.equal(hostLabel('file:///*'), 'files on your computer');
  assert.equal(hostLabel('weird'), 'weird');
});
