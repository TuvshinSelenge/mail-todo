// Google Sheet storage. Two tabs: "Todos" (one row per todo) and "Processed"
// (Gmail message ids already handled). All columns are plain text.

const TODO_HEADERS = ['id', 'text', 'due', 'done', 'created', 'doneAt', 'messageId'];
const PROCESSED_HEADERS = ['messageId', 'processedAt'];

// Leading = + - @ would make Sheets treat the value as a formula.
function sheetSafe_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

// Strips the escape added by sheetSafe_, in case Sheets kept it as a literal character.
function readText_(text) {
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

// Appends rows below the last row, growing the grid when it is full, and
// formats the written range as plain text so ids and dates are not coerced.
function appendRows_(sh, rows) {
  if (!rows.length) return;
  const start = sh.getLastRow() + 1;
  const missing = start + rows.length - 1 - sh.getMaxRows();
  if (missing > 0) sh.insertRowsAfter(sh.getMaxRows(), missing);
  const range = sh.getRange(start, 1, rows.length, rows[0].length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID not set: run setup()');
  return SpreadsheetApp.openById(id);
}

function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function todosSheet_() {
  return sheet_('Todos', TODO_HEADERS);
}

function processedSheet_() {
  return sheet_('Processed', PROCESSED_HEADERS);
}

function cellText_(v, dateOnly) {
  if (v instanceof Date) {
    return dateOnly ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

function isTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function rowToTodo_(r) {
  return {
    id: cellText_(r[0]),
    text: readText_(cellText_(r[1])),
    due: cellText_(r[2], true),
    done: isTrue_(r[3]),
    created: cellText_(r[4]),
    doneAt: cellText_(r[5]),
    messageId: cellText_(r[6]),
  };
}

function todoToRow_(t) {
  return [t.id, sheetSafe_(t.text), t.due, t.done ? 'TRUE' : 'FALSE', t.created, t.doneAt, t.messageId];
}

function storeListTodos() {
  return todosSheet_()
    .getDataRange()
    .getValues()
    .slice(1)
    .filter((r) => r[0] !== '')
    .map(rowToTodo_);
}

function storeAddTodos(todos) {
  if (!todos.length) return;
  appendRows_(todosSheet_(), todos.map(todoToRow_));
}

function findTodoRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function storeSetDone(id, done, nowIso) {
  const sh = todosSheet_();
  const row = findTodoRow_(sh, id);
  if (row < 0) return false;
  if (isTrue_(sh.getRange(row, 4).getValue()) === done) return true;
  sh.getRange(row, 4).setValue(done ? 'TRUE' : 'FALSE');
  sh.getRange(row, 6).setValue(done ? nowIso : '');
  return true;
}

function storeDeleteTodo(id) {
  const sh = todosSheet_();
  const row = findTodoRow_(sh, id);
  if (row < 0) return false;
  sh.deleteRow(row);
  return true;
}

// Rewrites the data rows without the done ones (one write instead of a deleteRow per todo).
function storeClearDone() {
  const sh = todosSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const range = sh.getRange(2, 1, last - 1, TODO_HEADERS.length);
  const rows = range.getValues();
  const keep = rows.filter((r) => r[0] !== '' && !isTrue_(r[3]));
  const removed = rows.filter((r) => r[0] !== '').length - keep.length;
  if (!removed) return 0;
  range.clearContent();
  if (keep.length) {
    // Values come back unescaped, so re-escape text before writing it again.
    sh.getRange(2, 1, keep.length, TODO_HEADERS.length)
      .setValues(keep.map((r) => r.map((v, i) => (i === 1 ? sheetSafe_(readText_(String(v))) : v))));
  }
  return removed;
}

function storeProcessedIds() {
  const sh = processedSheet_();
  const last = sh.getLastRow();
  const ids = {};
  if (last < 2) return ids;
  sh.getRange(2, 1, last - 1, 1).getValues().forEach((r) => { ids[String(r[0])] = true; });
  return ids;
}

function storeMarkProcessed(id) {
  appendRows_(processedSheet_(), [[id, new Date().toISOString()]]);
}

if (typeof module !== 'undefined') module.exports = { sheetSafe_, readText_, appendRows_ };
