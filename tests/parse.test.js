const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEmail, parseDue } = require('../apps-script/Parse.js');

const TODAY = '2026-10-09';

test('subject-only todo', () => {
  assert.deepEqual(parseEmail('todo: buy milk', '', TODAY), [{ text: 'buy milk', due: '' }]);
});

test('body-only todo; other lines and signature ignored', () => {
  const body = 'Hi me,\ntodo: call mom\nthanks\n-- \nSent from my iPhone';
  assert.deepEqual(parseEmail('hello', body, TODAY), [{ text: 'call mom', due: '' }]);
});

test('subject and multiple body lines, in order', () => {
  const out = parseEmail('todo: a', 'todo: b\ntodo: c', TODAY);
  assert.deepEqual(out.map((t) => t.text), ['a', 'b', 'c']);
});

test('case and spacing variants', () => {
  const out = parseEmail('', 'TODO:x\n  Todo :  y  \ntodo:z', TODAY);
  assert.deepEqual(out.map((t) => t.text), ['x', 'y', 'z']);
});

test('empty todo lines are skipped', () => {
  assert.deepEqual(parseEmail('todo:', 'todo:    \ntodo: real', TODAY), [{ text: 'real', due: '' }]);
});

test('quoted reply lines are ignored', () => {
  assert.deepEqual(parseEmail('Re: hi', '> todo: old\ntodo: new', TODAY), [{ text: 'new', due: '' }]);
});

test('todo not at line start is ignored', () => {
  assert.deepEqual(parseEmail('I have a todo: list', 'see my todo: list', TODAY), []);
});

test('windows line endings and trailing spaces', () => {
  const out = parseEmail('', 'todo: a  \r\ntodo: b due 15.10.2026 \r\n', TODAY);
  assert.deepEqual(out, [{ text: 'a', due: '' }, { text: 'b', due: '2026-10-15' }]);
});

test('due formats', () => {
  const cases = [
    ['Homework due to 15.10.2026', '2026-10-15'],
    ['Homework due 15.10.2026', '2026-10-15'],
    ['Homework due: 15.10', '2026-10-15'],
    ['Homework DUE TO 15/10/2026', '2026-10-15'],
    ['Homework due 15-10-2026', '2026-10-15'],
    ['Homework due 5.1.2027', '2027-01-05'],
  ];
  for (const [input, due] of cases) {
    assert.deepEqual(parseDue(input, TODAY), { text: 'Homework', due }, input);
  }
});

test('today and tomorrow', () => {
  assert.deepEqual(parseDue('Pay rent due today', TODAY), { text: 'Pay rent', due: '2026-10-09' });
  assert.deepEqual(parseDue('Pay rent due tomorrow', TODAY), { text: 'Pay rent', due: '2026-10-10' });
  assert.deepEqual(parseDue('x due tomorrow', '2026-12-31'), { text: 'x', due: '2027-01-01' });
});

test('year inference for dates without a year', () => {
  assert.equal(parseDue('x due 01.10', TODAY).due, '2027-10-01');
  assert.equal(parseDue('x due 09.10', TODAY).due, '2026-10-09');
  assert.equal(parseDue('x due 05.01', '2026-12-20').due, '2027-01-05');
});

test('invalid or unrecognized dates keep the full text', () => {
  for (const input of [
    'x due 31.02.2026',
    'x due 45.13',
    'x due 29.02',
    'x due 15.10/2026',
    'x due 15.10.20',
    'check due diligence',
    'due today',
    'x due 15.10.2026 please',
  ]) {
    assert.deepEqual(parseDue(input, TODAY), { text: input, due: '' }, input);
  }
});

test('29.02 without year resolves to the next leap day', () => {
  assert.equal(parseDue('x due 29.02', '2027-10-09').due, '2028-02-29');
});
