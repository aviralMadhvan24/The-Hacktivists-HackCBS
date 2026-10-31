// Starts the Express app on a random port and provides a tiny fetch client.
const { randomUUID } = require('crypto');

let server = null;
let base = null;

async function start() {
  if (base) return base;
  const app = require('../../server');
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

async function stop() {
  if (server) await new Promise((r) => server.close(r));
  server = null; base = null;
  await require('../../db/pool').close();
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, body: json, headers: res.headers };
}

/** Registers a fresh user and returns { id, email, token }. */
async function newUser(label = 'user') {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const r = await call('POST', '/api/auth/register', { body: { email, password: 'correct-horse-9', name: label } });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.user.id, email, token: r.body.token, name: label };
}

module.exports = { start, stop, call, newUser };
