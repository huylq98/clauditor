const { test, expect } = require('@playwright/test');

test('resolveClaude returns CLAUDITOR_CLI_OVERRIDE when set', () => {
  const original = process.env.CLAUDITOR_CLI_OVERRIDE;
  process.env.CLAUDITOR_CLI_OVERRIDE = '/tmp/fake-path-xyz';
  // Force a fresh require so the module-level cache doesn't poison the test
  delete require.cache[require.resolve('../../src/main/pty-manager.js')];
  const mod = require('../../src/main/pty-manager.js');
  // resolveClaude is private; expose via spawn? Easier: read via a tiny probe.
  // We assert by spawning with an unreachable cwd and catching the error,
  // which includes the resolved path in its message.
  try {
    new mod.PTYManager({ token: 't' }).spawn({ cwd: process.cwd() });
  } catch (err) {
    expect(err.message).toContain('/tmp/fake-path-xyz');
    return;
  } finally {
    if (original === undefined) delete process.env.CLAUDITOR_CLI_OVERRIDE;
    else process.env.CLAUDITOR_CLI_OVERRIDE = original;
  }
  throw new Error('expected spawn to throw');
});
