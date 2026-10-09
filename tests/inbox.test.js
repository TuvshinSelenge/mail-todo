const test = require('node:test');
const assert = require('node:assert/strict');

global.parseEmail = require('../apps-script/Parse.js').parseEmail;
const { processMessages, extractEmail } = require('../apps-script/Inbox.js');

function setup(processed = []) {
  const state = { processed: new Set(processed), todos: [], fails: {}, logs: [] };
  let n = 0;
  const deps = {
    ownerEmail: 'Me@Example.com',
    allowedSenders: ['friend@outlook.com'],
    isProcessed: (id) => state.processed.has(id),
    markProcessed: (id) => state.processed.add(id),
    addTodos: (rows) => state.todos.push(...rows),
    failures: {
      inc: (id) => (state.fails[id] = (state.fails[id] || 0) + 1),
      clear: (id) => delete state.fails[id],
    },
    todayIso: () => '2026-10-09',
    newId: () => 'id' + ++n,
    log: (m) => state.logs.push(m),
  };
  return { deps, state };
}

function msg(id, subject, body, from = 'Me <me@example.com>') {
  return { id, from, subject, getBody: () => body, date: new Date('2026-10-09T08:00:00Z') };
}

test('imports todos with the full row shape', () => {
  const { deps, state } = setup();
  const added = processMessages([msg('m1', 'todo: buy milk', 'todo: homework due 15.10.2026')], deps);
  assert.equal(added, 2);
  assert.deepEqual(state.todos, [
    { id: 'id1', text: 'buy milk', due: '', done: false, created: '2026-10-09T08:00:00.000Z', doneAt: '', messageId: 'm1', from: '' },
    { id: 'id2', text: 'homework', due: '2026-10-15', done: false, created: '2026-10-09T08:00:00.000Z', doneAt: '', messageId: 'm1', from: '' },
  ]);
  assert.ok(state.processed.has('m1'));
});

test('skips already processed messages without reading the body', () => {
  const { deps, state } = setup(['m1']);
  const m = msg('m1', 'todo: x', '');
  m.getBody = () => { throw new Error('should not read body'); };
  assert.equal(processMessages([m], deps), 0);
  assert.equal(state.todos.length, 0);
});

test('a reply in an already processed thread is still imported', () => {
  const { deps, state } = setup(['m1']);
  // Subject "Re: todo: old" does not start with "todo:", and the quoted line is ignored.
  processMessages([msg('m1', 'todo: old', ''), msg('m2', 'Re: todo: old', 'todo: new one\n> todo: old')], deps);
  assert.deepEqual(state.todos.map((t) => t.text), ['new one']);
  assert.equal(state.todos[0].messageId, 'm2');
});

test('email without todo lines is marked processed with zero todos', () => {
  const { deps, state } = setup();
  assert.equal(processMessages([msg('m1', 'hello', 'just a note')], deps), 0);
  assert.ok(state.processed.has('m1'));
});

test('messages from someone else are ignored and marked processed', () => {
  const { deps, state } = setup();
  processMessages([msg('m1', 'todo: spam', '', 'Someone <x@y.com>')], deps);
  assert.equal(state.todos.length, 0);
  assert.ok(state.processed.has('m1'));
});

test('failing message is retried, then given up after 3 failures; others still import', () => {
  const { deps, state } = setup();
  const bad = msg('bad', 'todo: x', '');
  bad.getBody = () => { throw new Error('boom'); };
  const good = msg('good', 'todo: fine', '');

  processMessages([bad, good], deps);
  assert.equal(state.processed.has('bad'), false);
  assert.equal(state.fails.bad, 1);
  assert.deepEqual(state.todos.map((t) => t.text), ['fine']);
  assert.equal(state.logs.length, 1);

  processMessages([bad], deps);
  assert.equal(state.processed.has('bad'), false);
  processMessages([bad], deps);
  assert.equal(state.processed.has('bad'), true);
  assert.equal(state.fails.bad, undefined);
});

test('extractEmail handles display names and case', () => {
  assert.equal(extractEmail('Me <ME@Example.com>'), 'me@example.com');
  assert.equal(extractEmail('me@example.com'), 'me@example.com');
  assert.equal(extractEmail(''), '');
});

const { buildQuery_ } = require('../apps-script/Inbox.js');

test('buildQuery_ searches since the last run with a 10-minute overlap', () => {
  const lastRun = Date.UTC(2026, 9, 9, 12, 0, 0);
  assert.equal(buildQuery_(lastRun), 'from:me to:me todo after:' + (lastRun / 1000 - 600));
});

test('allowed senders are imported and tagged with their address (case-insensitive)', () => {
  const { deps, state } = setup();
  processMessages([msg('m1', 'todo: from friend', '', 'Friend <FRIEND@Outlook.com>')], deps);
  assert.deepEqual(state.todos.map((t) => [t.text, t.from]), [['from friend', 'friend@outlook.com']]);
});

test('buildQuery_ includes allowed senders', () => {
  const lastRun = Date.UTC(2026, 9, 9, 12, 0, 0);
  assert.equal(
    buildQuery_(lastRun, ['a@x.com', 'b@y.com']),
    'to:me todo after:' + (lastRun / 1000 - 600) + ' {from:me from:a@x.com from:b@y.com}'
  );
});

const { parseSenders_ } = require('../apps-script/Inbox.js');

test('parseSenders_ splits, trims, lowercases and drops blanks', () => {
  assert.deepEqual(parseSenders_(' a@x.com, B@Y.com ,, '), ['a@x.com', 'b@y.com']);
  assert.deepEqual(parseSenders_(null), []);
  assert.deepEqual(parseSenders_('a@x.com; b@y.com\nc@z.com'), ['a@x.com', 'b@y.com', 'c@z.com']);
});
