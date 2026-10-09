// Serves web/ plus a fake API at /api so the UI can be checked locally.
// Env: PORT (8787), MOCK_DELAY_MS (0, both methods), MOCK_GET_DELAY_MS / MOCK_POST_DELAY_MS (override per method),
// MOCK_FAIL_WRITES=1 (writes return server_error).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DELAY = Number(process.env.MOCK_DELAY_MS || 0);
const GET_DELAY = Number(process.env.MOCK_GET_DELAY_MS || DELAY);
const POST_DELAY = Number(process.env.MOCK_POST_DELAY_MS || DELAY);
const FAIL_WRITES = process.env.MOCK_FAIL_WRITES === '1';
const KEY = 'test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

let todos = [
  { id: '1', text: 'Library book', due: day(-1), done: false, created: ago(60 * 30), doneAt: '', messageId: 'm1' },
  { id: '2', text: 'Buy milk', due: day(0), done: false, created: ago(2), doneAt: '', messageId: 'm2' },
  { id: '3', text: 'Homework', due: day(6), done: false, created: ago(60), doneAt: '', messageId: 'm3' },
  { id: '4', text: 'Call mom', due: '', done: false, created: ago(60 * 26), doneAt: '', messageId: 'm4' },
  { id: '5', text: '<img src=x onerror=alert(1)> should show as text', due: '', done: false, created: ago(300), doneAt: '', messageId: 'm5' },
  { id: '6', text: 'Pay rent', due: '', done: true, created: ago(60 * 48), doneAt: ago(60 * 20), messageId: 'm6' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, obj) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api') {
    if (req.method === 'GET') {
      // Snapshot before the delay, like a real read that happens before a concurrent write lands.
      const snapshot = JSON.parse(JSON.stringify(todos));
      await sleep(GET_DELAY);
      if (url.searchParams.get('key') !== KEY) return json(res, { ok: false, error: 'unauthorized' });
      return json(res, { ok: true, todos: snapshot });
    }
    await sleep(POST_DELAY);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return json(res, { ok: false, error: 'bad_request' }); }
    if (body.key !== KEY) return json(res, { ok: false, error: 'unauthorized' });
    if (FAIL_WRITES) return json(res, { ok: false, error: 'server_error' });
    const t = todos.find((x) => x.id === body.id);
    if (!t) return json(res, { ok: false, error: 'not_found' });
    if (body.action === 'set' && typeof body.done === 'boolean') {
      if (t.done !== body.done) t.doneAt = body.done ? new Date().toISOString() : '';
      t.done = body.done;
    } else if (body.action === 'delete') {
      todos = todos.filter((x) => x !== t);
    } else {
      return json(res, { ok: false, error: 'bad_request' });
    }
    return json(res, { ok: true });
  }

  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end("window.ZAN_API_URL = '/api';");
  }

  const file = normalize(join(WEB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(WEB)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Mock: http://localhost:${PORT}  (key: ${KEY})`));
