const { EventEmitter } = require('events');
const { v4: uuid } = require('uuid');
const pty = require('@lydell/node-pty');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_BUFFER = 1024 * 1024;

let cachedClaude = null;
function resolveClaude() {
  if (cachedClaude) return cachedClaude;
  const isWin = os.platform() === 'win32';
  const candidates = isWin ? ['claude.exe', 'claude.cmd', 'claude.ps1', 'claude'] : ['claude'];
  const pathSep = isWin ? ';' : ':';
  const dirs = (process.env.PATH || '').split(pathSep);
  for (const dir of dirs) {
    for (const c of candidates) {
      const full = path.join(dir, c);
      try { if (fs.existsSync(full) && fs.statSync(full).isFile()) { cachedClaude = full; return full; } } catch {}
    }
  }
  try {
    const cmd = isWin ? 'where claude' : 'command -v claude';
    const out = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out) { cachedClaude = out; return out; }
  } catch {}
  cachedClaude = isWin ? 'claude.exe' : 'claude';
  return cachedClaude;
}

class PTYManager extends EventEmitter {
  constructor({ token }) {
    super();
    this.sessions = new Map();
    this.token = token;
  }

  spawn({ cwd, name }) {
    const id = uuid();
    const shell = resolveClaude();
    const env = {
      ...process.env,
      CLAUDITOR_SESSION_ID: id,
      CLAUDITOR_TOKEN: this.token,
      TERM: 'xterm-256color',
    };

    let proc;
    try {
      proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env,
      });
    } catch (err) {
      const e = new Error(`Failed to spawn Claude Code (${shell}): ${err.message}`);
      e.cause = err;
      throw e;
    }

    const session = {
      id,
      name: name || `session-${id.slice(0, 6)}`,
      cwd,
      pid: proc.pid,
      proc,
      buffer: '',
      createdAt: Date.now(),
    };

    proc.onData((data) => {
      session.buffer += data;
      if (session.buffer.length > MAX_BUFFER) {
        session.buffer = session.buffer.slice(-MAX_BUFFER);
      }
      this.emit('data', id, data);
    });

    proc.onExit(({ exitCode, signal }) => {
      this.emit('exit', id, exitCode, signal);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    this.emit('spawn', this.describe(id));
    return this.describe(id);
  }

  describe(id) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return { id: s.id, name: s.name, cwd: s.cwd, pid: s.pid, createdAt: s.createdAt };
  }

  list() {
    return Array.from(this.sessions.keys()).map((id) => this.describe(id));
  }

  getBuffer(id) {
    return this.sessions.get(id)?.buffer || '';
  }

  write(id, data) {
    this.sessions.get(id)?.proc.write(data);
  }

  resize(id, cols, rows) {
    try {
      this.sessions.get(id)?.proc.resize(cols, rows);
    } catch (e) {
      // PTY may be dead
    }
  }

  rename(id, name) {
    const s = this.sessions.get(id);
    if (!s) return null;
    s.name = (name || '').trim() || s.name;
    const desc = this.describe(id);
    this.emit('rename', desc);
    return desc;
  }

  kill(id) {
    try {
      this.sessions.get(id)?.proc.kill();
    } catch (e) {
      // already gone
    }
  }

  killAll() {
    for (const id of this.sessions.keys()) this.kill(id);
  }
}

module.exports = { PTYManager };
