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

const { appendRows_, readText_ } = require('../apps-script/Store.js');

function fakeSheet(maxRows, lastRow) {
  const sh = {
    maxRows, lastRow, log: [],
    getMaxRows: () => sh.maxRows,
    getLastRow: () => sh.lastRow,
    insertRowsAfter: (after, n) => { sh.log.push(['insert', after, n]); sh.maxRows += n; },
    getRange: (row, col, nRows, nCols) => {
      if (row + nRows - 1 > sh.maxRows) throw new Error('outside the dimensions of the sheet');
      return {
        setNumberFormat: (f) => sh.log.push(['format', row, nRows, f]),
        setValues: (v) => { sh.log.push(['values', row, v.length]); sh.lastRow = Math.max(sh.lastRow, row + nRows - 1); },
      };
    },
  };
  return sh;
}

test('appendRows_ grows a full grid instead of throwing', () => {
  const sh = fakeSheet(1000, 1000);
  appendRows_(sh, [['a', 'b'], ['c', 'd']]);
  assert.equal(sh.lastRow, 1002);
  assert.deepEqual(sh.log[0], ['insert', 1000, 2]);
});

test('appendRows_ formats the written range as text before writing', () => {
  const sh = fakeSheet(10, 3);
  appendRows_(sh, [['a']]);
  assert.deepEqual(sh.log, [['format', 4, 1, '@'], ['values', 4, 1]]);
});

test('appendRows_ with no rows does nothing', () => {
  const sh = fakeSheet(10, 3);
  appendRows_(sh, []);
  assert.deepEqual(sh.log, []);
});

test('readText_ strips only our formula escape', () => {
  assert.equal(readText_("'=SUM(1)"), '=SUM(1)');
  assert.equal(readText_("'- buy milk"), '- buy milk');
  assert.equal(readText_("'quoted"), "'quoted");
  assert.equal(readText_('plain'), 'plain');
});
