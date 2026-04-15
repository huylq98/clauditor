const { test, expect } = require('@playwright/test');
const { StateEngine } = require('../../src/main/state-engine.js');

test('register sets state to running', () => {
  const e = new StateEngine();
  e.register('s1');
  expect(e.get('s1')).toBe('running');
});

test('notification hook moves to awaiting_permission', () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'notification');
  expect(e.get('s1')).toBe('awaiting_permission');
});

test('post-tool-use hook returns state to running', () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'notification');
  e.handleHook('s1', 'post-tool-use');
  expect(e.get('s1')).toBe('running');
});

test('markExited emits change and sets exited', () => {
  const e = new StateEngine();
  e.register('s1');
  const events = [];
  e.on('change', (id, next, prev) => events.push({ id, next, prev }));
  e.markExited('s1');
  expect(e.get('s1')).toBe('exited');
  expect(events).toContainEqual({ id: 's1', next: 'exited', prev: 'running' });
});

test('handleHook on unknown id is a no-op', () => {
  const e = new StateEngine();
  expect(() => e.handleHook('ghost', 'stop')).not.toThrow();
  expect(e.get('ghost')).toBeUndefined();
});

test('stop hook leads to awaiting_user after grace period', async () => {
  const e = new StateEngine();
  e.register('s1');
  e.handleHook('s1', 'stop');
  expect(e.get('s1')).toBe('running'); // immediately
  await new Promise(r => setTimeout(r, 1700)); // > STOP_GRACE_MS (1500)
  expect(e.get('s1')).toBe('awaiting_user');
});
