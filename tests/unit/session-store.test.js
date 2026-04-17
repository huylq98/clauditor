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
