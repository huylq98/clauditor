import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Action =
  | { kind: 'stdout'; at_ms: number; text: string }
  | { kind: 'hook'; at_ms: number; event: string; tool_name?: string }
  | { kind: 'exit'; at_ms: number; code: number };

export class Scenario {
  private actions: Action[] = [];
  stdout(at_ms: number, text: string) { this.actions.push({ kind: 'stdout', at_ms, text }); return this; }
  hook(at_ms: number, event: string, tool_name?: string) {
    this.actions.push({ kind: 'hook', at_ms, event, tool_name }); return this;
  }
  exit(at_ms: number, code = 0) { this.actions.push({ kind: 'exit', at_ms, code }); return this; }
  writeToTmp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'clauditor-scenario-'));
    const path = join(dir, 'scenario.json');
    writeFileSync(path, JSON.stringify(this.actions, null, 2));
    return path;
  }
}

export const scenarios = {
  idle: () => new Scenario().stdout(0, 'Claude Code v2.1.113-fake\nReady.\n'),
  banner: () => new Scenario().stdout(0, 'Claude Code v2.1.113-fake\nOpus 4.7\n'),
  promptToolStop: () =>
    new Scenario()
      .stdout(0, 'Claude Code v2.1.113-fake\n')
      .hook(100, 'UserPromptSubmit')
      .hook(250, 'PreToolUse', 'Bash')
      .hook(1000, 'PostToolUse')
      .hook(1500, 'Stop'),
  crash: () => new Scenario().stdout(0, 'starting\n').exit(200, 1),
};
