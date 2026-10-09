// Turns self-sent Gmail messages with "todo:" lines into Todos rows.
// processMessages is pure (all effects via deps) so Node can test it;
// checkInbox wires it to Gmail, the Sheet and Script Properties.

const LABEL_NAME = 'todo-saved';
const MAX_FAILURES = 3;
const FIRST_RUN_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
const QUERY_OVERLAP_MS = 10 * 60 * 1000;

// Only mail since the previous run (with overlap for delivery delays), so most
// runs find nothing and exit before opening the Sheet.
function buildQuery_(lastRunMs) {
  return 'from:me to:me todo after:' + Math.floor((lastRunMs - QUERY_OVERLAP_MS) / 1000);
}

function extractEmail(from) {
  const match = /<([^>]+)>/.exec(from || '');
  return (match ? match[1] : String(from || '')).trim().toLowerCase();
}

function processMessages(messages, deps) {
  let added = 0;
  messages.forEach((msg) => {
    if (deps.isProcessed(msg.id)) return;
    try {
      if (extractEmail(msg.from) !== deps.ownerEmail.toLowerCase()) {
        deps.markProcessed(msg.id);
        return;
      }
      const items = parseEmail(msg.subject, msg.getBody(), deps.todayIso(msg.date));
      const created = msg.date.toISOString();
      deps.addTodos(items.map((item) => ({
        id: deps.newId(),
        text: item.text,
        due: item.due,
        done: false,
        created: created,
        doneAt: '',
        messageId: msg.id,
      })));
      deps.markProcessed(msg.id);
      deps.failures.clear(msg.id);
      added += items.length;
    } catch (err) {
      deps.log('Failed to process ' + msg.id + ': ' + err);
      if (deps.failures.inc(msg.id) >= MAX_FAILURES) {
        deps.markProcessed(msg.id);
        deps.failures.clear(msg.id);
      }
    }
  });
  return added;
}

function checkInbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const startedAt = Date.now();
    const lastRun = Number(props.getProperty('LAST_RUN_MS')) || startedAt - FIRST_RUN_LOOKBACK_MS;
    const threads = GmailApp.search(buildQuery_(lastRun), 0, 50);
    if (threads.length) importThreads_(threads, props);
    // Only advance after a successful run, so a crash re-scans the same window.
    props.setProperty('LAST_RUN_MS', String(startedAt));
  } finally {
    lock.releaseLock();
  }
}

function importThreads_(threads, props) {
  const processed = storeProcessedIds();
  const messages = [];
  const touched = [];
  threads.forEach((thread) => {
    const fresh = thread.getMessages().filter((m) => !processed[m.getId()]);
    if (!fresh.length) return;
    touched.push(thread);
    fresh.forEach((m) => {
      messages.push({ id: m.getId(), from: m.getFrom(), subject: m.getSubject(), getBody: () => m.getPlainBody(), date: m.getDate() });
    });
  });
  if (!messages.length) return;

  const tz = Session.getScriptTimeZone();
  processMessages(messages, {
    ownerEmail: Session.getEffectiveUser().getEmail(),
    isProcessed: (id) => !!processed[id],
    markProcessed: (id) => { storeMarkProcessed(id); processed[id] = true; },
    addTodos: storeAddTodos,
    failures: {
      inc: (id) => {
        const n = Number(props.getProperty('fail:' + id) || 0) + 1;
        props.setProperty('fail:' + id, String(n));
        return n;
      },
      clear: (id) => props.deleteProperty('fail:' + id),
    },
    todayIso: (date) => Utilities.formatDate(date, tz, 'yyyy-MM-dd'),
    newId: () => Utilities.getUuid(),
    log: (m) => console.error(m),
  });

  const label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  touched.forEach((thread) => thread.addLabel(label));
}

if (typeof module !== 'undefined') module.exports = { processMessages, extractEmail, buildQuery_ };
