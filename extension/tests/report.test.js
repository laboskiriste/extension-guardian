import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listAsText } from '../src/lib/report.js';
import { assessRisk } from '../src/lib/risk.js';

const NOW = Date.parse('2026-11-01T08:00:00Z');
const row = (ext, store) => ({ ext, store, risk: assessRisk(ext, { store, now: NOW }) });
const cws = 'https://clients2.google.com/service/update2/crx';

test('the list as text', () => {
  const rows = [
    row({ id: 'a'.repeat(32), name: 'Gone Tool', version: '1.0', enabled: true, installType: 'normal', updateUrl: cws, permissions: [], hostPermissions: [] },
      { status: 'not_found' }),
    row({ id: 'b'.repeat(32), name: 'Notes', version: '2.1', enabled: false, installType: 'normal', updateUrl: cws, permissions: ['storage'], hostPermissions: [] },
      { status: 'ok', developerName: 'Ana', email: 'ana@notes.example', users: '3,000', updated: 'October 1, 2026' }),
  ];
  assert.equal(listAsText(rows, { now: NOW }), [
    'Extension Guardian: 2 extensions, 1 turned on (2026-11-01)',
    '',
    'Gone Tool 1.0',
    `  Attention required · Basic access · ID ${'a'.repeat(32)}`,
    '  Warnings: No longer in the Chrome Web Store',
    '',
    'Notes 2.1 (turned off)',
    `  No warning signs · Basic access · ID ${'b'.repeat(32)}`,
    '  Developer: Ana',
    '',
  ].join('\n'));
});

test('an empty list', () => {
  assert.equal(listAsText([], { now: NOW }), 'Extension Guardian: 0 extensions, 0 turned on (2026-11-01)\n');
});

test('the recommendation text never offers reassurance for full access', async () => {
  const { actionText, ACTION_LABEL } = await import('../src/lib/report.js');
  assert.match(actionText('review', 'full'), /only if you need it/);
  assert.match(actionText('act', 'basic'), /remove it/);
  assert.match(actionText('monitor', 'basic'), /warn you if/);
  for (const label of Object.values(ACTION_LABEL)) assert.doesNotMatch(label, /\b(safe|fine|ok)\b/i);
});
