const test = require('node:test');
const assert = require('node:assert/strict');
const { handleRequest } = require('../apps-script/Api.js');

function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    secret: 's3cret',
    list: () => [{ id: 'a' }],
    setDone: (id, done) => { calls.push(['set', id, done]); return id === 'a'; },
    remove: (id) => { calls.push(['delete', id]); return id === 'a'; },
    ...overrides,
  };
  return { deps, calls };
}

test('GET list with the right key', () => {
  const { deps } = makeDeps();
  assert.deepEqual(handleRequest('GET', { key: 's3cret', action: 'list' }, deps), { ok: true, todos: [{ id: 'a' }] });
});

test('wrong, missing, or unconfigured key is unauthorized', () => {
  const { deps } = makeDeps();
  const unauthorized = { ok: false, error: 'unauthorized' };
  assert.deepEqual(handleRequest('GET', { key: 'nope', action: 'list' }, deps), unauthorized);
  assert.deepEqual(handleRequest('GET', { action: 'list' }, deps), unauthorized);
  assert.deepEqual(handleRequest('GET', undefined, deps), unauthorized);
  const { deps: noSecret } = makeDeps({ secret: '' });
  assert.deepEqual(handleRequest('GET', { key: '', action: 'list' }, noSecret), unauthorized);
});

test('unauthorized is checked before bad_request', () => {
  const { deps } = makeDeps();
  assert.deepEqual(handleRequest('POST', { key: 'nope', action: 'explode' }, deps), { ok: false, error: 'unauthorized' });
});

test('POST set (idempotent, explicit state) and delete', () => {
  const { deps, calls } = makeDeps();
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', id: 'a', done: true }, deps), { ok: true });
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', id: 'a', done: false }, deps), { ok: true });
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'delete', id: 'a' }, deps), { ok: true });
  assert.deepEqual(calls, [['set', 'a', true], ['set', 'a', false], ['delete', 'a']]);
});

test('unknown id is not_found', () => {
  const { deps } = makeDeps();
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', id: 'zzz', done: true }, deps), { ok: false, error: 'not_found' });
});

test('bad requests', () => {
  const { deps, calls } = makeDeps();
  const bad = { ok: false, error: 'bad_request' };
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', done: true }, deps), bad);
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', id: 'a' }, deps), bad);
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'set', id: 'a', done: 'yes' }, deps), bad);
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'toggle', id: 'a' }, deps), bad);
  assert.deepEqual(handleRequest('GET', { key: 's3cret', action: 'set', id: 'a', done: true }, deps), bad);
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'list' }, deps), bad);
  assert.deepEqual(handleRequest('POST', { key: 's3cret', action: 'explode', id: 'a' }, deps), bad);
  assert.deepEqual(calls, []);
});
