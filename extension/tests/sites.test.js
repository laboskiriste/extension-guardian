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

test('normalizeSite handles international names, ports, IP addresses and wildcards', () => {
  assert.equal(normalizeSite('банка.мк'), 'xn--80aab1bo.xn--j1ad');
  assert.equal(normalizeSite('xn--80aab1bo.xn--j1ad'), 'xn--80aab1bo.xn--j1ad');
  assert.equal(normalizeSite('https://münchen.de/'), 'xn--mnchen-3ya.de');
  assert.equal(normalizeSite('mybank.com:8443'), 'mybank.com');
  assert.equal(normalizeSite('http://localhost:8080/admin'), 'localhost');
  assert.equal(normalizeSite('192.168.1.1:8443'), '192.168.1.1');
  assert.equal(normalizeSite('[::1]:3000'), '[::1]');
  assert.equal(normalizeSite('*.mybank.com'), 'mybank.com');
  assert.equal(normalizeSite('mybank.com.'), 'mybank.com');
  assert.equal(normalizeSite('a..b'), null);
  assert.equal(normalizeSite('*.*.com'), null);
  assert.equal(normalizeSite('http://'), null);
});

test('international, IP and localhost sites match tab addresses', () => {
  assert.ok(matchesSite('https://e.банка.мк/login', [normalizeSite('банка.мк')]));
  assert.ok(matchesSite('http://192.168.1.1:8443/', [normalizeSite('192.168.1.1')]));
  assert.ok(!matchesSite('http://10.192.168.1.1/', ['192.168.1.1']));
  assert.ok(matchesSite('http://[::1]:3000/', [normalizeSite('[::1]')]));
  assert.ok(matchesSite('http://localhost:5173/', ['localhost']));
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
  const on = planSiteRules({ urls: ['https://mybank.com/'], rules, exts: [ext('a'), ext('b')], paused: [] });
  assert.deepEqual(on, { disable: ['a'], enable: [], paused: ['a'], allowed: [] });
  const off = planSiteRules({ urls: ['https://example.com/'], rules, exts: [ext('a', { enabled: false })], paused: ['a'] });
  assert.deepEqual(off, { disable: [], enable: ['a'], paused: [], allowed: [] });
});

test('planSiteRules with no rules, unknown ids and duplicates', () => {
  const none = { disable: [], enable: [], paused: [], allowed: [] };
  assert.deepEqual(planSiteRules({ urls: ['https://mybank.com/'], rules: {}, exts: [ext('a')], paused: [] }), none);
  assert.deepEqual(planSiteRules({ urls: ['https://mybank.com/'], rules: { a: [] }, exts: [ext('a')], paused: [] }), none);
  assert.deepEqual(planSiteRules({ urls: ['https://mybank.com/'], rules: { gone: ['mybank.com'] }, exts: [ext('a')], paused: ['gone'], allowed: ['gone'] }), none);
  const dup = planSiteRules({
    urls: ['https://example.com/'], rules: { a: ['mybank.com', 'mybank.com'] }, exts: [ext('a', { enabled: false })], paused: ['a', 'a'],
  });
  assert.deepEqual(dup, { disable: [], enable: ['a'], paused: [], allowed: [] });
  const twice = planSiteRules({ urls: ['https://mybank.com/'], rules: { a: ['mybank.com', 'mybank.com'] }, exts: [ext('a')], paused: [] });
  assert.deepEqual(twice.disable, ['a']);
});

test('planSiteRules leaves an extension on that the user turned on while on the site', () => {
  const rules = { a: ['mybank.com'] };
  const here = planSiteRules({ urls: ['https://mybank.com/x'], rules, exts: [ext('a')], paused: ['a'] });
  assert.deepEqual(here, { disable: [], enable: [], paused: [], allowed: ['a'] });
  const still = planSiteRules({ urls: ['https://login.mybank.com/'], rules, exts: [ext('a')], paused: [], allowed: ['a'] });
  assert.deepEqual(still, { disable: [], enable: [], paused: [], allowed: ['a'] });
  const left = planSiteRules({ urls: ['https://example.com/'], rules, exts: [ext('a')], paused: [], allowed: ['a'] });
  assert.deepEqual(left, { disable: [], enable: [], paused: [], allowed: [] });
});

test('planSiteRules never turns on an extension that was off before the site opened', () => {
  const plan = planSiteRules({ urls: ['https://example.com/'], rules: { a: ['mybank.com'] }, exts: [ext('a', { enabled: false })], paused: [] });
  assert.deepEqual(plan.enable, []);
});

test('planSiteRules skips extensions it may not turn off', () => {
  const plan = planSiteRules({ urls: ['https://mybank.com/'], rules: { a: ['mybank.com'] }, exts: [ext('a', { mayDisable: false })], paused: [] });
  assert.deepEqual(plan.disable, []);
});

test('planSiteRules forgets an extension the user turned back on, or uninstalled', () => {
  const plan = planSiteRules({ urls: ['https://example.com/'], rules: { a: ['mybank.com'] }, exts: [ext('a')], paused: ['a', 'gone'] });
  assert.deepEqual(plan, { disable: [], enable: [], paused: [], allowed: [] });
});

test('planSiteRules counts every open tab, not only the active one', () => {
  const rules = { a: ['mybank.com'] };
  const urls = ['https://news.example.com/', 'https://mybank.com/accounts'];
  assert.deepEqual(planSiteRules({ urls, rules, exts: [ext('a')], paused: [] }).disable, ['a']);
  const stillOpen = planSiteRules({ urls, rules, exts: [ext('a', { enabled: false })], paused: ['a'] });
  assert.deepEqual(stillOpen.enable, [], 'stays off while the site is open in a background tab');
  const closed = planSiteRules({ urls: [urls[0]], rules, exts: [ext('a', { enabled: false })], paused: ['a'] });
  assert.deepEqual(closed.enable, ['a']);
  assert.deepEqual(planSiteRules({ urls: [], rules, exts: [ext('a', { enabled: false })], paused: ['a'] }).enable, ['a'], 'no tabs left');
});

