// Turns self-sent Gmail messages with "todo:" lines into Todos rows.
// processMessages is pure (all effects via deps) so Node can test it;
// checkInbox wires it to Gmail, the Sheet and Script Properties.

const GMAIL_QUERY = 'from:me to:me todo newer_than:2d';
const LABEL_NAME = 'todo-saved';
const MAX_FAILURES = 3;

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
    const processed = storeProcessedIds();
    const threads = GmailApp.search(GMAIL_QUERY, 0, 50);
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
    const props = PropertiesService.getScriptProperties();
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
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') module.exports = { processMessages, extractEmail };
