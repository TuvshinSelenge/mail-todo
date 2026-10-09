// Web-app endpoint. handleRequest is pure; doGet/doPost wire it to the Sheet.
// Apps Script cannot set HTTP status codes, so errors are {ok:false, error}.
// POST bodies are sent as text/plain JSON to avoid a CORS preflight.

const ALLOWED_ACTIONS = { GET: ['list'], POST: ['set', 'delete', 'clearDone'] };

function handleRequest(method, req, deps) {
  req = req || {};
  if (!deps.secret || typeof req.key !== 'string' || req.key !== deps.secret) {
    return { ok: false, error: 'unauthorized' };
  }
  if ((ALLOWED_ACTIONS[method] || []).indexOf(req.action) === -1) {
    return { ok: false, error: 'bad_request' };
  }
  if (req.action === 'list') return { ok: true, todos: deps.list() };
  if (req.action === 'clearDone') return { ok: true, removed: deps.clearDone() };
  if (typeof req.id !== 'string' || !req.id) return { ok: false, error: 'bad_request' };
  if (req.action === 'set' && typeof req.done !== 'boolean') return { ok: false, error: 'bad_request' };
  // "set" carries the desired state, so a repeated or reordered request cannot flip it back.
  const found = req.action === 'set' ? deps.setDone(req.id, req.done) : deps.remove(req.id);
  return found ? { ok: true } : { ok: false, error: 'not_found' };
}

function doGet(e) {
  return respond_('GET', (e && e.parameter) || {});
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  return respond_('POST', body);
}

function respond_(method, req) {
  const lock = LockService.getScriptLock();
  let result;
  try {
    if (method === 'POST') lock.waitLock(10000);
    result = handleRequest(method, req, {
      secret: PropertiesService.getScriptProperties().getProperty('SECRET_KEY') || '',
      list: storeListTodos,
      setDone: (id, done) => storeSetDone(id, done, new Date().toISOString()),
      remove: storeDeleteTodo,
      clearDone: storeClearDone,
    });
  } catch (err) {
    console.error(err);
    result = { ok: false, error: 'server_error' };
  } finally {
    if (method === 'POST') lock.releaseLock();
  }
  return json_(result);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { handleRequest };
