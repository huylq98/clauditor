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
