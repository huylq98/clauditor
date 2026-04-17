const { test, expect } = require('@playwright/test');
const { resolveClaude, PTYManager } = require('../../src/main/pty-manager.js');

test('resolveClaude returns CLAUDITOR_CLI_OVERRIDE when set', () => {
  const original = process.env.CLAUDITOR_CLI_OVERRIDE;
  process.env.CLAUDITOR_CLI_OVERRIDE = '/tmp/fake-path-xyz';
  try {
    expect(resolveClaude()).toBe('/tmp/fake-path-xyz');
  } finally {
    if (original === undefined) delete process.env.CLAUDITOR_CLI_OVERRIDE;
    else process.env.CLAUDITOR_CLI_OVERRIDE = original;
  }
});

test('resolveClaude falls back to PATH lookup when override is unset', () => {
  const original = process.env.CLAUDITOR_CLI_OVERRIDE;
  delete process.env.CLAUDITOR_CLI_OVERRIDE;
  try {
    // Should return a non-empty string (either a found path or the default 'claude'/'claude.exe')
    const resolved = resolveClaude();
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved).not.toBe('/tmp/fake-path-xyz');
  } finally {
    if (original !== undefined) process.env.CLAUDITOR_CLI_OVERRIDE = original;
  }
});

test('registerStub creates entry with null proc; write/kill/resize are no-ops', () => {
  const mgr = new PTYManager({ token: 't' });
  const record = { id: 'stub-1', name: 'saved', cwd: '/tmp', createdAt: 42, buffer: 'hi' };
  mgr.registerStub(record);
  const desc = mgr.describe('stub-1');
  expect(desc).toEqual({ id: 'stub-1', name: 'saved', cwd: '/tmp', pid: null, createdAt: 42 });
  expect(mgr.getBuffer('stub-1')).toBe('hi');
  // These should not throw:
  mgr.write('stub-1', 'abc');
  mgr.resize('stub-1', 80, 24);
  mgr.kill('stub-1');
});

test('restart spawns new proc, preserves id and buffer', () => {
  const originalOverride = process.env.CLAUDITOR_CLI_OVERRIDE;
  // Use a tiny shell so we don't need claude CLI installed for this test.
  process.env.CLAUDITOR_CLI_OVERRIDE = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  try {
    const mgr = new PTYManager({ token: 't' });
    mgr.registerStub({ id: 'stub-2', name: 'x', cwd: process.cwd(), createdAt: 1, buffer: 'prev output' });
    const events = [];
    mgr.on('restart', (desc) => events.push(desc));
    mgr.restart('stub-2', { cols: 80, rows: 24 });
    const s = mgr.sessions.get('stub-2');
    expect(s.proc).not.toBe(null);
    expect(s.pid).not.toBe(null);
    expect(s.buffer).toBe('prev output'); // preserved
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('stub-2');
    mgr.kill('stub-2');
  } finally {
    if (originalOverride === undefined) delete process.env.CLAUDITOR_CLI_OVERRIDE;
    else process.env.CLAUDITOR_CLI_OVERRIDE = originalOverride;
  }
});

test('registering + restarting multiple stubs in sequence preserves ids', () => {
  const originalOverride = process.env.CLAUDITOR_CLI_OVERRIDE;
  process.env.CLAUDITOR_CLI_OVERRIDE = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  try {
    const mgr = new PTYManager({ token: 't' });
    const ids = ['bulk-a', 'bulk-b', 'bulk-c'];
    for (const id of ids) {
      mgr.registerStub({ id, name: id, cwd: process.cwd(), createdAt: 1, buffer: '' });
    }
    const events = [];
    mgr.on('restart', (desc) => events.push(desc.id));
    for (const id of ids) mgr.restart(id, { cols: 80, rows: 24 });
    expect(events).toEqual(ids);
    for (const id of ids) {
      const s = mgr.sessions.get(id);
      expect(s.proc).not.toBe(null);
      expect(s.pid).not.toBe(null);
    }
    for (const id of ids) mgr.kill(id);
  } finally {
    if (originalOverride === undefined) delete process.env.CLAUDITOR_CLI_OVERRIDE;
    else process.env.CLAUDITOR_CLI_OVERRIDE = originalOverride;
  }
});
