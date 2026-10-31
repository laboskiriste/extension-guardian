import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replacementFor } from '../src/lib/replacements.js';
import { searchPageUrl } from '../src/lib/store.js';

test('uBlock Origin points to uBlock Origin Lite', () => {
  const swap = replacementFor('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  assert.equal(swap.name, 'uBlock Origin Lite');
  assert.equal(swap.id, 'ddkjiahejlhfcafbddmgiahcphecmpfh');
});

test('every replacement is either an extension or a Chrome setting', () => {
  for (const id of ['cjpalhdlnbpafiamejdnhcphjbkeiagm', 'ogfcmafjalglgifnmanfmnieipoejdcf', 'gcbommkclmclpchllfjekcdonpmejbdp', 'klbibkeccnjlkjkiokjodocebajanakg']) {
    const swap = replacementFor(id);
    assert.ok(swap, id);
    assert.ok((swap.id && /^[a-p]{32}$/.test(swap.id) && swap.why) || swap.builtIn, id);
  }
});

test('unknown extensions have no replacement', () => {
  assert.equal(replacementFor('a'.repeat(32)), null);
});

test('store search escapes the name', () => {
  assert.equal(searchPageUrl('Tabs & Notes'), 'https://chromewebstore.google.com/search/Tabs%20%26%20Notes');
});
