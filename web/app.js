// UI: renders todos, talks to the Apps Script API, keeps a local cache.
// Changes are applied optimistically and reverted if the API call fails.
(() => {
  'use strict';

  const L = window.ZanLogic;
  const API_URL = window.ZAN_API_URL || '';
  const KEY_STORE = 'zan.key';
  const CACHE_STORE = 'zan.todos';
  const REFRESH_MS = 15 * 1000;
  const SLASH_MS = 300;
  const STATUS_TEXT = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline' };

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'),
    keyScreen: $('key-screen'),
    keyForm: $('key-form'),
    keyInput: $('key-input'),
    keyError: $('key-error'),
    status: $('status'),
    statusText: $('status-text'),
    date: $('today-date'),
    counts: $('counts'),
    openList: $('open-list'),
    doneList: $('done-list'),
    openCount: $('open-count'),
    doneCount: $('done-count'),
    doneSection: $('done-section'),
    clearDone: $('clear-done'),
    empty: $('empty'),
    toast: $('toast'),
  };

  let todos = [];
  let pending = 0; // mutations in flight
  let version = 0; // bumps on every local change; stale refreshes are dropped
  let refreshing = null;
  let toastTimer = null;

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  // --- API ---------------------------------------------------------------

  async function apiGet(key) {
    if (!API_URL) throw new Error('no api url');
    const sep = API_URL.includes('?') ? '&' : '?';
    const res = await fetch(`${API_URL}${sep}action=list&key=${encodeURIComponent(key)}`);
    return res.json();
  }

  async function apiPost(key, body) {
    if (!API_URL) throw new Error('no api url');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key, ...body }),
    });
    return res.json();
  }

  // --- State -------------------------------------------------------------

  function setStatus(state) {
    els.status.dataset.state = state;
    els.statusText.textContent = STATUS_TEXT[state];
  }

  function saveCache() {
    storage.set(CACHE_STORE, JSON.stringify(todos));
  }

  function loadCache() {
    try {
      const cached = JSON.parse(storage.get(CACHE_STORE) || '[]');
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  }

  function showKeyScreen(message) {
    els.app.hidden = true;
    els.keyScreen.hidden = false;
    els.keyError.textContent = message || '';
    els.keyInput.value = '';
    els.keyInput.focus();
  }

  function showApp() {
    els.keyScreen.hidden = true;
    els.app.hidden = false;
  }

  function lockOut() {
    storage.remove(KEY_STORE);
    storage.remove(CACHE_STORE);
    todos = [];
    showKeyScreen('That key didn’t work. Try again.');
  }

  function refresh() {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function doRefresh() {
    const key = storage.get(KEY_STORE);
    if (!key) return;
    const startVersion = version;
    setStatus('syncing');
    try {
      const res = await apiGet(key);
      if (!res.ok) {
        if (res.error === 'unauthorized') return lockOut();
        throw new Error(res.error);
      }
      setStatus('synced');
      if (pending > 0 || version !== startVersion) return; // a local change happened meanwhile
      todos = res.todos;
      saveCache();
      render();
    } catch {
      setStatus('offline');
    }
  }

  async function mutate(body, revert) {
    const key = storage.get(KEY_STORE);
    pending++;
    version++;
    saveCache();
    render();
    try {
      const res = await apiPost(key, body);
      if (res.ok || (body.action === 'delete' && res.error === 'not_found')) return;
      if (res.error === 'unauthorized') return lockOut();
      throw new Error(res.error);
    } catch {
      revert();
      version++;
      saveCache();
      render();
      showToast('Couldn’t sync, try again');
    } finally {
      pending--;
      version++; // a refresh that started while this was in flight may hold stale data
    }
  }

  function toggle(id) {
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const prev = { done: t.done, doneAt: t.doneAt };
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : '';
    mutate({ action: 'set', id, done: t.done }, () => Object.assign(t, prev));
  }

  function remove(id) {
    const i = todos.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = todos.splice(i, 1);
    mutate({ action: 'delete', id }, () => todos.splice(Math.min(i, todos.length), 0, t));
  }

  function clearDone() {
    const removed = todos.filter((t) => t.done);
    if (!removed.length) return;
    const noun = removed.length === 1 ? 'todo' : 'todos';
    if (!window.confirm(`Delete ${removed.length} done ${noun}?`)) return;
    todos = todos.filter((t) => !t.done);
    mutate({ action: 'clearDone' }, () => { todos = todos.concat(removed); });
  }

  function onCheck(row, t) {
    if (row.classList.contains('slashing')) return;
    if (t.done) return toggle(t.id);
    row.classList.add('slashing');
    setTimeout(() => toggle(t.id), SLASH_MS);
  }

  // --- Rendering ---------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderRow(t, todayIso, now) {
    const li = el('li', 'row');
    li.dataset.id = t.id;
    if (t.done) li.classList.add('done');
    else if (L.isNew(t.created, now)) li.classList.add('new');

    const inner = el('div', 'row-inner');

    const chk = el('button', 'chk');
    chk.type = 'button';
    chk.setAttribute('aria-label', t.done ? 'Mark as open' : 'Mark as done');
    chk.setAttribute('aria-pressed', String(t.done));
    chk.addEventListener('click', () => onCheck(li, t));

    const body = el('div', 'body');
    const meta = el('div', 'meta');
    const due = t.done ? null : L.dueInfo(t.due, todayIso);
    if (due) meta.append(el('span', `due ${due.tone}`, due.label), ' · ');
    meta.append(t.done ? `done ${L.relativeTime(t.doneAt, now)}` : `${L.sourceLabel(t)} · ${L.relativeTime(t.created, now)}`);
    body.append(el('div', 'tx', t.text), meta);

    const del = el('button', 'del', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete');
    del.addEventListener('click', () => remove(t.id));

    const swipeDel = el('button', 'swipe-del', 'Delete');
    swipeDel.type = 'button';
    swipeDel.addEventListener('click', () => remove(t.id));

    inner.append(chk, body, del);
    li.append(inner, swipeDel);
    addSwipe(li);
    return li;
  }

  function addSwipe(li) {
    let x0 = null;
    let y0 = null;
    li.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    }, { passive: true });
    li.addEventListener('touchmove', (e) => {
      if (x0 === null) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) {
        closeSwipes(li);
        li.classList.add('swiped');
      } else {
        li.classList.remove('swiped');
      }
      x0 = null;
    }, { passive: true });
    li.addEventListener('touchend', () => { x0 = null; });
  }

  function closeSwipes(except) {
    document.querySelectorAll('.row.swiped').forEach((r) => {
      if (r !== except) r.classList.remove('swiped');
    });
  }

  function render() {
    const now = new Date();
    const todayIso = L.localIso(now);
    const { open, done } = L.sortTodos(todos);
    els.date.textContent = L.longDate(now);
    els.counts.textContent = `${open.length} open · ${done.length} done`;
    els.openCount.textContent = open.length;
    els.doneCount.textContent = done.length;
    els.openList.replaceChildren(...open.map((t) => renderRow(t, todayIso, now)));
    els.doneList.replaceChildren(...done.map((t) => renderRow(t, todayIso, now)));
    els.doneSection.hidden = done.length === 0;
    els.empty.hidden = open.length > 0;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  // --- Init --------------------------------------------------------------

  els.keyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = els.keyInput.value.trim();
    if (!key) return;
    storage.set(KEY_STORE, key);
    showApp();
    render();
    refresh();
  });

  els.clearDone.addEventListener('click', clearDone);
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.row.swiped')) closeSwipes(null);
  }, { passive: true });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, REFRESH_MS);

  if (storage.get(KEY_STORE)) {
    todos = loadCache();
    showApp();
    render();
    refresh();
  } else {
    showKeyScreen();
  }
})();
