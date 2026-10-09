// Pure display helpers shared by the page (window.ZanLogic) and Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZanLogic = api;
})(this, function () {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NEW_MS = 10 * 60 * 1000;

  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  function localIso(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function longDate(date) {
    return LONG_DAYS[date.getDay()] + ', ' + LONG_MONTHS[date.getMonth()] + ' ' + date.getDate();
  }

  function isoParts(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }

  function shortDate(iso, todayIso) {
    const p = isoParts(iso);
    const s = MONTHS[p.m - 1] + ' ' + p.d;
    return iso.slice(0, 4) === todayIso.slice(0, 4) ? s : s + ', ' + p.y;
  }

  function dueInfo(due, todayIso) {
    if (!due) return null;
    if (due < todayIso) return { label: 'Overdue · ' + shortDate(due, todayIso), tone: 'over' };
    if (due === todayIso) return { label: 'Due today', tone: 'today' };
    return { label: 'Due ' + DAYS[isoParts(due).dow] + ', ' + shortDate(due, todayIso), tone: 'future' };
  }

  function relativeTime(iso, now) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const mins = Math.floor((now.getTime() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' h ago';
    if (hours < 48) return 'yesterday';
    const d = new Date(t);
    const s = MONTHS[d.getMonth()] + ' ' + d.getDate();
    return d.getFullYear() === now.getFullYear() ? s : s + ', ' + d.getFullYear();
  }

  function isNew(iso, now) {
    const t = Date.parse(iso);
    return !isNaN(t) && now.getTime() - t < NEW_MS;
  }

  // ISO strings from toISOString() sort correctly as plain strings.
  const desc = (x, y) => ((x || '') < (y || '') ? 1 : (x || '') > (y || '') ? -1 : 0);

  function sortTodos(todos) {
    const open = todos.filter((t) => !t.done);
    const done = todos.filter((t) => t.done);
    open.sort((a, b) => {
      if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : desc(a.created, b.created);
      if (a.due) return -1;
      if (b.due) return 1;
      return desc(a.created, b.created);
    });
    done.sort((a, b) => desc(a.doneAt, b.doneAt));
    return { open, done };
  }

  function sourceLabel(todo) {
    return todo.from ? 'from ' + todo.from : 'from email';
  }

  return { localIso, longDate, dueInfo, relativeTime, isNew, sortTodos, sourceLabel };
});
