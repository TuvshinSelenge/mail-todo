const test = require('node:test');
const assert = require('node:assert/strict');
const { sheetSafe_ } = require('../apps-script/Store.js');

test('formula-like text is forced to plain text', () => {
  for (const t of ['=SUM(1)', '+1 call', '-call mom', '@home']) {
    assert.equal(sheetSafe_(t), "'" + t);
  }
});

test('normal text is unchanged', () => {
  assert.equal(sheetSafe_('buy milk'), 'buy milk');
  assert.equal(sheetSafe_('a = b'), 'a = b');
});
