// Uses the fixed hook-server port; safe only while playwright.config.js pins workers:1.
const { test, expect } = require('@playwright/test');
const http = require('http');
const { HookServer, PORT } = require('../../src/main/hook-server.js');
const { StateEngine } = require('../../src/main/state-engine.js');

let server, engine, ptyManager;

function makePtyManager(map) {
  return {
    findIdByPid(pid) {
      for (const [id, p] of Object.entries(map)) if (p === pid) return id;
      return null;
    },
  };
}

test.beforeEach(async () => {
  engine = new StateEngine();
  ptyManager = makePtyManager({ s1: 4242 });
  server = new HookServer({ token: 'secret', stateEngine: engine, ptyManager });
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

test('routes hook to session when ppid matches a tracked PTY', async () => {
  engine.register('s1');
  const res = await post('/hook/notification', { clauditor_ppid: 4242 },
    { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body).sid).toBe('s1');
  expect(engine.get('s1')).toBe('awaiting_permission');
});

test('rejects hook when ppid does not match a tracked PTY', async () => {
  // Simulates a grandchild Claude Code (e.g. launched from Antigravity) that
  // inherited the env vars but runs under a different parent PID.
  engine.register('s1');
  const res = await post('/hook/notification', { clauditor_ppid: 9999 },
    { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body).sid).toBeNull();
  expect(engine.get('s1')).toBe('running');
});

test('ignores legacy clauditor_session_id field without matching ppid', async () => {
  engine.register('s1');
  const res = await post('/hook/notification', { clauditor_session_id: 's1' },
    { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body).sid).toBeNull();
  expect(engine.get('s1')).toBe('running');
});

test('health endpoint also requires token', async () => {
  const res = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/health' }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => resolve({ status: r.statusCode }));
    }).on('error', reject);
  });
  expect(res.status).toBe(403);
});

test('emits file-activity for pre-tool-use Edit with file_path', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  const res = await post('/hook/pre-tool-use', {
    clauditor_ppid: 4242,
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/project/src/app.js' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(res.status).toBe(200);
  expect(events).toEqual([{
    sid: 's1', tool: 'Edit', phase: 'pre', path: '/tmp/project/src/app.js',
  }]);
});

test('emits file-activity for post-tool-use Write', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/post-tool-use', {
    clauditor_ppid: 4242,
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/x.js' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([{
    sid: 's1', tool: 'Write', phase: 'post', path: '/tmp/x.js',
  }]);
});

test('ignores tools without file_path', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/pre-tool-use', {
    clauditor_ppid: 4242, tool_name: 'Bash', tool_input: { command: 'ls' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([]);
});

test('ignores file-activity when ppid does not match', async () => {
  engine.register('s1');
  const events = [];
  server.on('file-activity', (ev) => events.push(ev));
  await post('/hook/pre-tool-use', {
    clauditor_ppid: 9999, tool_name: 'Edit', tool_input: { file_path: '/x' },
  }, { 'X-Clauditor-Token': 'secret' });
  expect(events).toEqual([]);
});
