import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSite, matchesSite, planSiteRules } from '../src/lib/sites.js';

test('normalizeSite turns what people type into a host name', () => {
  assert.equal(normalizeSite('mybank.com'), 'mybank.com');
  assert.equal(normalizeSite('  https://www.MyBank.com/login?x=1 '), 'mybank.com');
  assert.equal(normalizeSite('online.mybank.co.uk'), 'online.mybank.co.uk');
  assert.equal(normalizeSite('localhost:3000'), 'localhost');
  assert.equal(normalizeSite('mybank'), null);
  assert.equal(normalizeSite(''), null);
  assert.equal(normalizeSite('not a site'), null);
});

test('matchesSite covers subdomains but not lookalikes', () => {
  const sites = ['mybank.com'];
  assert.ok(matchesSite('https://mybank.com/', sites));
  assert.ok(matchesSite('https://www.mybank.com/', sites));
  assert.ok(matchesSite('https://login.mybank.com/x', sites));
  assert.ok(!matchesSite('https://notmybank.com/', sites));
  assert.ok(!matchesSite('https://mybank.com.evil.io/', sites));
  assert.ok(!matchesSite('chrome://extensions/', sites));
  assert.ok(!matchesSite('garbage', sites));
});

const ext = (id, extra = {}) => ({ id, enabled: true, mayDisable: true, ...extra });

test('planSiteRules turns off on a matching site and back on after', () => {
  const rules = { a: ['mybank.com'] };
  const on = planSiteRules({ url: 'https://mybank.com/', rules, exts: [ext('a'), ext('b')], paused: [] });
  assert.deepEqual(on, { disable: ['a'], enable: [], paused: ['a'] });
  const off = planSiteRules({ url: 'https://example.com/', rules, exts: [ext('a', { enabled: false })], paused: ['a'] });
  assert.deepEqual(off, { disable: [], enable: ['a'], paused: [] });
});

test('planSiteRules skips extensions it may not turn off', () => {
  const plan = planSiteRules({ url: 'https://mybank.com/', rules: { a: ['mybank.com'] }, exts: [ext('a', { mayDisable: false })], paused: [] });
  assert.deepEqual(plan.disable, []);
});

test('planSiteRules forgets an extension the user turned back on, or uninstalled', () => {
  const plan = planSiteRules({ url: 'https://example.com/', rules: { a: ['mybank.com'] }, exts: [ext('a')], paused: ['a', 'gone'] });
  assert.deepEqual(plan, { disable: [], enable: [], paused: [] });
});
