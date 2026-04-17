// Uses the fixed hook-server port; safe only while playwright.config.js pins workers:1.
const { test, expect } = require('@playwright/test');
const http = require('http');
const { HookServer, PORT } = require('../../src/main/hook-server.js');
const { StateEngine } = require('../../src/main/state-engine.js');

let server, engine;

test.beforeEach(async () => {
  engine = new StateEngine();
  server = new HookServer({ token: 'secret', stateEngine: engine });
  await server.start();
});
test.afterEach(async () => { await server.stop(); });

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

test('rejects request without token', async () => {
  const res = await post('/hook/stop', {});
  expect(res.status).toBe(403);
});

test('accepts request with correct token and routes to engine', async () => {
  engine.register('s1');
  const res = await post('/hook/notification', { clauditor_session_id: 's1' },
    { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(engine.get('s1')).toBe('awaiting_permission');
});

test('health endpoint also requires token', async () => {
  const res = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/health' }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve({ status: r.statusCode }));
    }).on('error', reject);
  });
  expect(res.status).toBe(403);
});
