// Store name and description in every language the listing is offered in.
// The same text goes to Chrome and Firefox, so it never names one store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const locales = readdirSync(new URL('_locales/', root));
const read = (loc) => JSON.parse(readFileSync(new URL(`_locales/${loc}/messages.json`, root), 'utf8'));

test('the manifest takes its name and description from _locales', () => {
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.ok(locales.includes(manifest.default_locale));
});

test('every locale has the same messages, within the store limits', () => {
  const keys = Object.keys(read('en')).sort();
  for (const loc of locales) {
    const m = read(loc);
    assert.deepEqual(Object.keys(m).sort(), keys, loc);
    assert.ok(m.extName.message.length <= 75, `${loc} name too long`);
    assert.ok(m.extDescription.message.length <= 132, `${loc} description too long`);
    assert.match(m.extName.message, /^Extension Guardian/, `${loc} name keeps the brand first`);
    assert.doesNotMatch(m.extDescription.message, /Chrome|Firefox/, `${loc} names a store`);
  }
});
