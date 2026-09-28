import { browser, expect } from '@wdio/globals';
import { launchApp } from '../helpers/app.js';
import { scenarios } from '../helpers/fakeClaude.js';
import { readPort } from '../helpers/hooks.js';
import { makeRepo, cleanup as cleanFs } from '../helpers/fs.js';

describe('TS-03 — Hook server security', () => {
  let app: Awaited<ReturnType<typeof launchApp>>;
  let repo: string;

  before(async () => {
    repo = makeRepo('empty');
    app = await launchApp({ fakeScenarioPath: scenarios.idle().writeToTmp() });
  });

  after(async () => {
    await app.cleanup();
    cleanFs(repo);
  });

  // TC-201
  it('TC-201 rejects request without bearer token (401)', async () => {
    const port = await readPort();
    const res = await fetch(`http://127.0.0.1:${port}/hook/UserPromptSubmit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  // TC-202
  it('TC-202 rejects request with wrong bearer token (401)', async () => {
    const port = await readPort();
    const res = await fetch(`http://127.0.0.1:${port}/hook/UserPromptSubmit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Clauditor-Token': '00'.repeat(24),
      },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  // TC-203
  it('TC-203 binds to loopback only', async () => {
    const port = await readPort();
    const { execSync } = await import('node:child_process');
    const isWin = process.platform === 'win32';
    const out = execSync(isWin ? 'netstat -an' : 'ss -tlnp').toString();
    const lines = out
      .split('\n')
      .filter((l: string) => l.includes(`:${port}`) && /LISTEN/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      // Must be bound to 127.0.0.1, never 0.0.0.0 or any external interface.
      expect(l).toMatch(/127\.0\.0\.1/);
      expect(l).not.toMatch(/0\.0\.0\.0/);
      expect(l).not.toMatch(/\[?::\]?:/); // IPv6 wildcard
    }
  });

  // TC-204
  it('TC-204 rejects hook posted from a foreign PID (404)', async () => {
    const port = await readPort();
    const token = await browser.executeAsync<string, []>(
      async (done: (v: string) => void) => {
        done(await (window as any).__test__.hookToken());
      },
    );
    // The Node process running this test is NOT a descendant of the clauditor
    // process, so the hook server's PPID-based attribution should not match
    // any session and should respond 404.
    const res = await fetch(`http://127.0.0.1:${port}/hook/UserPromptSubmit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Clauditor-Token': token,
      },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
