import { browser } from '@wdio/globals';

export async function readToken(): Promise<string> {
  return browser.executeAsync<string, []>(async (done) => {
    done(await (window as any).__test__.hookToken());
  });
}

export async function readPort(): Promise<number> {
  return browser.executeAsync<number, []>(async (done) => {
    done(await (window as any).__test__.hookPort());
  });
}

export async function postHook(opts: {
  event: 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'Notification';
  token?: string;
  port?: number;
  toolName?: string;
}): Promise<{ status: number }> {
  const token = opts.token ?? (await readToken());
  const port = opts.port ?? (await readPort());
  const body: Record<string, unknown> = {};
  if (opts.toolName) body.tool_name = opts.toolName;
  const res = await fetch(`http://127.0.0.1:${port}/hook/${opts.event}`, {
    method: 'POST',
    headers: { 'X-Clauditor-Token': token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status };
}
