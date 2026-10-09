const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/logic.js');

const TODAY = '2026-10-09';

test('dueInfo', () => {
  assert.equal(L.dueInfo('', TODAY), null);
  assert.deepEqual(L.dueInfo('2026-10-08', TODAY), { label: 'Overdue · Oct 8', tone: 'over' });
  assert.deepEqual(L.dueInfo('2026-10-09', TODAY), { label: 'Due today', tone: 'today' });
  assert.deepEqual(L.dueInfo('2026-10-15', TODAY), { label: 'Due Thu, Oct 15', tone: 'future' });
  assert.deepEqual(L.dueInfo('2027-01-05', TODAY), { label: 'Due Tue, Jan 5, 2027', tone: 'future' });
  assert.deepEqual(L.dueInfo('2025-12-30', TODAY), { label: 'Overdue · Dec 30, 2025', tone: 'over' });
});

test('sortTodos: open by due asc then undated newest first; done newest first', () => {
  const t = (id, extra) => ({ id, text: id, due: '', done: false, created: '', doneAt: '', ...extra });
  const { open, done } = L.sortTodos([
    t('undated-old', { created: '2026-10-01T10:00:00.000Z' }),
    t('due-late', { due: '2026-10-20', created: '2026-10-09T10:00:00.000Z' }),
    t('undated-new', { created: '2026-10-09T10:00:00.000Z' }),
    t('due-soon', { due: '2026-10-10', created: '2026-10-01T10:00:00.000Z' }),
    t('done-old', { done: true, doneAt: '2026-10-01T10:00:00.000Z' }),
    t('done-new', { done: true, doneAt: '2026-10-08T10:00:00.000Z' }),
  ]);
  assert.deepEqual(open.map((x) => x.id), ['due-soon', 'due-late', 'undated-new', 'undated-old']);
  assert.deepEqual(done.map((x) => x.id), ['done-new', 'done-old']);
});

test('relativeTime', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(L.relativeTime(ago(30e3), now), 'just now');
  assert.equal(L.relativeTime(ago(5 * 60e3), now), '5 min ago');
  assert.equal(L.relativeTime(ago(3 * 3600e3), now), '3 h ago');
  assert.equal(L.relativeTime(ago(30 * 3600e3), now), 'yesterday');
  assert.equal(L.relativeTime('2026-10-03T12:00:00Z', now), 'Oct 3');
  assert.equal(L.relativeTime('garbage', now), '');
  assert.equal(L.relativeTime('', now), '');
});

test('isNew', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  assert.equal(L.isNew('2026-10-09T11:55:00Z', now), true);
  assert.equal(L.isNew('2026-10-09T11:45:00Z', now), false);
  assert.equal(L.isNew('', now), false);
});

test('longDate and localIso', () => {
  assert.equal(L.longDate(new Date(2026, 9, 9, 12)), 'Friday, October 9');
  assert.equal(L.localIso(new Date(2026, 0, 5, 12)), '2026-01-05');
});

test('sourceLabel', () => {
  assert.equal(L.sourceLabel({ from: '' }), 'from email');
  assert.equal(L.sourceLabel({}), 'from email');
  assert.equal(L.sourceLabel({ from: 'friend@outlook.com' }), 'from friend@outlook.com');
});
