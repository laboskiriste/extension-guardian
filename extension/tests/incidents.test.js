// What Guardian's change detection can and cannot see in the attack pattern
// behind real incidents (Socket's "Superior" campaign, 2026). The scenarios are
// synthetic: no manifest or publisher snapshot from before or after the real
// malicious updates is public. The 18 real Chrome cases are listed with their
// history marked as not available, so nothing here claims a detection rate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotOf, diffSnapshots, diffStoreInfo } from '../src/lib/changes.js';
import { INCIDENTS } from '../../server/src/incidents.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/incidents/${name}`, import.meta.url), 'utf8'));
const { cases } = load('superior-2026-cases.json');
const { scenarios } = load('scenarios.json');

const snapshot = (s) => snapshotOf({
  id: 'a'.repeat(32), name: 'Example', version: s.version, permissions: s.permissions, hostPermissions: s.hostPermissions,
  installType: 'normal', updateUrl: 'https://clients2.google.com/service/update2/crx',
});

const eventsOf = ({ before, after }) => [
  ...diffSnapshots(snapshot(before), snapshot(after)),
  ...diffStoreInfo('Example', before.store, after.store),
];

test('the real cases are listed, in sync with the incident page, with no invented history', () => {
  const published = INCIDENTS.find((i) => i.slug === 'superior-2026').extensions.filter((e) => e.store === 'chrome');
  assert.deepEqual(cases.map((c) => c.id).sort(), published.map((e) => e.id).sort());
  assert.equal(cases.length, 18);
  assert.equal(cases.filter((c) => c.acquired).length, 4, 'four of the Chrome extensions were bought from their developers');
  for (const c of cases) assert.equal(c.history, 'not available', `${c.name} has no public snapshot, so none is made up`);
});

test('each scenario raises exactly the alerts it should', () => {
  for (const s of scenarios) {
    const types = eventsOf(s).map((c) => c.type).sort();
    assert.deepEqual(types, [...s.expect].sort(), s.name);
  }
});

test('legitimate changes are not high-severity alerts, and store errors never read as removal', () => {
  for (const s of scenarios.filter((x) => x.kind === 'legitimate')) {
    assert.ok(!eventsOf(s).some((c) => c.severity === 'high'), s.name);
  }
  const errored = scenarios.find((s) => s.name.endsWith('the store did not answer'));
  assert.deepEqual(eventsOf(errored), []);
});

test('the blind spots are written down, and really produce no alert', () => {
  const blind = scenarios.filter((s) => s.limitation);
  assert.equal(blind.length, 2);
  for (const s of blind) {
    assert.deepEqual(eventsOf(s), [], s.name);
    assert.ok(s.limitation.length > 20, `${s.name} explains the limit`);
  }
});

test('summary of what is detectable (printed for the methodology page)', () => {
  const attacks = scenarios.filter((s) => s.kind === 'attack');
  const caught = attacks.filter((s) => eventsOf(s).length > 0);
  const blind = attacks.filter((s) => eventsOf(s).length === 0);
  const beforeDisclosure = attacks.filter((s) => !s.after_disclosure && eventsOf(s).length > 0);
  console.log(`# attack patterns: ${attacks.length}; with an observable change: ${caught.length} (${beforeDisclosure.length} before public disclosure); no observable change: ${blind.length}`);
  assert.equal(attacks.length, 6);
  assert.equal(blind.length, 2);
  assert.equal(beforeDisclosure.length, 3);
});
