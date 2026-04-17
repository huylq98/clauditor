const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileWatcher } = require('../../src/main/file-watcher.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clauditor-fw-'));
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test('lists top-level entries, applies default ignore list', async () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, 'a.js'), '');
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.js'), '');

  const fw = new FileWatcher();
  await fw.create('s1', root);
  const entries = await fw.list('s1', '.');
  const names = entries.map((e) => e.name).sort();
  expect(names).toEqual(['a.js', 'src']);
  await fw.destroy('s1');
});

test('emits add event when a file appears', async () => {
  const root = tmpDir();
  const fw = new FileWatcher();
  const events = [];
  fw.on('event', (sid, ev) => events.push({ sid, ...ev }));
  await fw.create('s1', root);

  fs.writeFileSync(path.join(root, 'new.js'), 'hi');

  await waitFor(() => events.some((e) => e.type === 'add' && e.path.endsWith('new.js')));
  await fw.destroy('s1');
});

test('list returns dirs before files, alphabetical within kind', async () => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, 'z.txt'), '');
  fs.writeFileSync(path.join(root, 'a.txt'), '');
  fs.mkdirSync(path.join(root, 'bdir'));
  fs.mkdirSync(path.join(root, 'adir'));

  const fw = new FileWatcher();
  await fw.create('s1', root);
  const entries = await fw.list('s1', '.');
  expect(entries.map((e) => e.name)).toEqual(['adir', 'bdir', 'a.txt', 'z.txt']);
  await fw.destroy('s1');
});

test('destroy stops further events', async () => {
  const root = tmpDir();
  const fw = new FileWatcher();
  const events = [];
  fw.on('event', (_sid, ev) => events.push(ev));
  await fw.create('s1', root);
  await fw.destroy('s1');
  fs.writeFileSync(path.join(root, 'late.js'), '');
  await new Promise((r) => setTimeout(r, 200));
  expect(events.find((e) => e.path?.endsWith('late.js'))).toBeUndefined();
});
