const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SessionStore } = require('../../src/main/session-store.js');

function tmpUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-store-'));
}

test('load returns empty array when file missing', async () => {
  const dir = tmpUserData();
  const store = new SessionStore({ userDataDir: dir });
  const records = await store.load();
  expect(records).toEqual([]);
});

test('save then load roundtrip preserves fields', async () => {
  const dir = tmpUserData();
  const store = new SessionStore({ userDataDir: dir });
  const input = [
    { id: 'a', name: 'alpha', cwd: '/tmp/a', createdAt: 100, buffer: 'hello' },
    { id: 'b', name: 'bravo', cwd: '/tmp/b', createdAt: 200, buffer: '' },
  ];
  await store.saveNow(input);
  const store2 = new SessionStore({ userDataDir: dir });
  const records = await store2.load();
  expect(records).toEqual(input);
});

test('corrupt file is quarantined and load returns empty', async () => {
  const dir = tmpUserData();
  fs.writeFileSync(path.join(dir, 'sessions.json'), 'not json{');
  const store = new SessionStore({ userDataDir: dir });
  const records = await store.load();
  expect(records).toEqual([]);
  expect(fs.existsSync(path.join(dir, 'sessions.json.corrupt'))).toBe(true);
});

test('markDirty coalesces writes and flushes after debounce', async () => {
  const dir = tmpUserData();
  let snapshotCalls = 0;
  const store = new SessionStore({ userDataDir: dir, debounceMs: 30 });
  store.setSnapshot(() => {
    snapshotCalls++;
    return [{ id: 'x', name: 'x', cwd: '/', createdAt: 1, buffer: '' }];
  });
  store.markDirty();
  store.markDirty();
  store.markDirty();
  await new Promise((r) => setTimeout(r, 80));
  expect(snapshotCalls).toBe(1);
  const raw = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  expect(JSON.parse(raw).sessions[0].id).toBe('x');
});

test('flushSync writes synchronously', async () => {
  const dir = tmpUserData();
  const store = new SessionStore({ userDataDir: dir });
  store.setSnapshot(() => [{ id: 'y', name: 'y', cwd: '/', createdAt: 2, buffer: '' }]);
  store.flushSync();
  const raw = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  expect(JSON.parse(raw).sessions[0].id).toBe('y');
});
