import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeTmpHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clauditor-home-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  return dir;
}

export function makeTmpDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'clauditor-data-'));
}

export function writeSettings(home: string, json: string): void {
  writeFileSync(join(home, '.claude/settings.json'), json);
}

export function makeRepo(name: 'empty' | 'small' | 'large'): string {
  const dir = mkdtempSync(join(tmpdir(), `clauditor-repo-${name}-`));
  if (name === 'small') {
    for (const f of ['a.txt', 'b.md', 'c.js']) writeFileSync(join(dir, f), '');
  } else if (name === 'large') {
    const sub = join(dir, 'big');
    mkdirSync(sub);
    for (let i = 1; i <= 1000; i++) writeFileSync(join(sub, `f${i}.txt`), '');
  }
  return dir;
}

export function cleanup(...paths: string[]): void {
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}
