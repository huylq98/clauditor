const { test, expect } = require('@playwright/test');
const { FileActivityService } = require('../../src/main/file-activity-service.js');

function makeSvc(now) {
  const clock = { t: now };
  const svc = new FileActivityService({ now: () => clock.t, ttlMs: 3000, logCap: 20 });
  return { svc, clock };
}

test('register creates empty state', () => {
  const { svc } = makeSvc(0);
  svc.register('s1');
  const snap = svc.snapshot('s1');
  expect(snap).toEqual({ modified: [], created: [], touching: [], log: [] });
});

test('pre-tool-use Edit marks path as touching', () => {
  const { svc } = makeSvc(1000);
  svc.register('s1');
  const deltas = [];
  svc.on('delta', (sid, d) => deltas.push({ sid, ...d }));
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'pre', path: '/a.js' });
  expect(svc.snapshot('s1').touching).toEqual(['/a.js']);
  expect(deltas).toContainEqual({ sid: 's1', type: 'touching-start', path: '/a.js' });
});

test('post-tool-use Write promotes to modified and logs', () => {
  const { svc } = makeSvc(1000);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Write', phase: 'pre', path: '/a.js' });
  svc.handle({ sid: 's1', tool: 'Write', phase: 'post', path: '/a.js' });
  const snap = svc.snapshot('s1');
  expect(snap.modified).toEqual(['/a.js']);
  expect(snap.touching).toEqual([]);
  expect(snap.log.length).toBe(1);
  expect(snap.log[0]).toMatchObject({ kind: 'write', path: '/a.js' });
});

test('touching auto-expires after ttl', () => {
  const { svc, clock } = makeSvc(1000);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'pre', path: '/a.js' });
  clock.t = 5000;
  svc.tick();
  expect(svc.snapshot('s1').touching).toEqual([]);
});

test('log is capped at logCap newest-first', () => {
  const { svc, clock } = makeSvc(0);
  const capSvc = new FileActivityService({ now: () => clock.t, ttlMs: 3000, logCap: 3 });
  capSvc.register('s1');
  for (let i = 0; i < 5; i++) {
    clock.t = i;
    capSvc.handle({ sid: 's1', tool: 'Edit', phase: 'post', path: `/f${i}.js` });
  }
  const paths = capSvc.snapshot('s1').log.map((e) => e.path);
  expect(paths).toEqual(['/f4.js', '/f3.js', '/f2.js']);
});

test('unregister clears state', () => {
  const { svc } = makeSvc(0);
  svc.register('s1');
  svc.handle({ sid: 's1', tool: 'Edit', phase: 'post', path: '/a.js' });
  svc.unregister('s1');
  expect(svc.snapshot('s1')).toBeNull();
});

test('ignores activity for unknown session', () => {
  const { svc } = makeSvc(0);
  svc.handle({ sid: 'ghost', tool: 'Edit', phase: 'post', path: '/a.js' });
  expect(svc.snapshot('ghost')).toBeNull();
});
