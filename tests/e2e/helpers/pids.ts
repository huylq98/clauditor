import { execSync } from 'node:child_process';
import { platform } from 'node:os';

export function listProcessesByName(name: string): number[] {
  const isWin = platform() === 'win32';
  const cmd = isWin
    ? `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`
    : `pgrep -x "${name}"`;
  try {
    const out = execSync(cmd).toString();
    if (isWin) {
      return out.split('\n').filter(Boolean).map((l) => {
        const cols = l.split(',').map((c) => c.replace(/"/g, ''));
        return Number(cols[1]);
      }).filter(Number.isFinite);
    }
    return out.split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

export function killProcess(pid: number): void {
  const isWin = platform() === 'win32';
  execSync(isWin ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`);
}
