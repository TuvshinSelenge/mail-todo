// Pure parsing of "todo:" lines and trailing due dates. No Google APIs here,
// so this file runs both in Apps Script and in Node tests.

const TODO_LINE = /^\s*todo\s*:\s*(.*)$/i;
// Groups: 1 whole date token, 2 day, 3 separator, 4 month, 5 year (optional).
const DUE_TAIL = /\s+due(?:\s+to)?\s*:?\s*(today|tomorrow|(\d{1,2})([./-])(\d{1,2})(?:\3(\d{4}))?)\s*$/i;

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function toIso_(y, m, d) {
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

function isRealDate_(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays_(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toIso_(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function parseDue(text, todayIso) {
  const match = DUE_TAIL.exec(text);
  if (!match) return { text: text, due: '' };
  const head = text.slice(0, match.index).trim();
  if (!head) return { text: text, due: '' };

  const word = match[1].toLowerCase();
  if (word === 'today') return { text: head, due: todayIso };
  if (word === 'tomorrow') return { text: head, due: addDays_(todayIso, 1) };

  const day = Number(match[2]);
  const month = Number(match[4]);
  let year;
  if (match[5]) {
    year = Number(match[5]);
  } else {
    year = Number(todayIso.slice(0, 4));
    if (toIso_(year, month, day) < todayIso) year += 1;
  }
  if (!isRealDate_(year, month, day)) return { text: text, due: '' };
  return { text: head, due: toIso_(year, month, day) };
}

function parseEmail(subject, body, todayIso) {
  const lines = [String(subject || '')].concat(String(body || '').split(/\r?\n/));
  const out = [];
  lines.forEach((line) => {
    if (/^\s*>/.test(line)) return;
    const match = TODO_LINE.exec(line);
    if (!match) return;
    const text = match[1].trim();
    if (!text) return;
    out.push(parseDue(text, todayIso));
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseEmail, parseDue };
