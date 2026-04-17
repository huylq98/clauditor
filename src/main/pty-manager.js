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
  // Test-only override; not a user-facing config knob.
  if (process.env.CLAUDITOR_CLI_OVERRIDE) return process.env.CLAUDITOR_CLI_OVERRIDE;
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

  spawn({ cwd, name, cols, rows }) {
    const id = uuid();
    const shell = resolveClaude();
    const crypto = require('crypto');
    const env = {
      ...process.env,
      CLAUDITOR_SESSION_ID: id,
      CLAUDITOR_TOKEN: this.token,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'clauditor',
      FORCE_COLOR: '3',
      // Some TUIs use WT_SESSION as a "modern terminal" signal; supply a fake one.
      WT_SESSION: crypto.randomUUID(),
    };

    let proc;
    try {
      proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 180,
        rows: rows || 45,
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
      session.proc = null;
      session.pid = null;
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

  findIdByPid(pid) {
    if (!pid) return null;
    for (const [id, s] of this.sessions) {
      if (s.pid === pid) return id;
    }
    return null;
  }

  write(id, data) {
    const s = this.sessions.get(id);
    if (!s || !s.proc) return;
    s.proc.write(data);
  }

  resize(id, cols, rows) {
    const s = this.sessions.get(id);
    if (!s || !s.proc) return;
    try { s.proc.resize(cols, rows); } catch (e) {}
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
    const s = this.sessions.get(id);
    if (!s || !s.proc) return;
    try { s.proc.kill(); } catch (e) {}
  }

  restart(id, { cols = 180, rows = 45 } = {}) {
    const s = this.sessions.get(id);
    if (!s) return null;
    const shell = resolveClaude();
    const crypto = require('crypto');
    const env = {
      ...process.env,
      CLAUDITOR_SESSION_ID: s.id,
      CLAUDITOR_TOKEN: this.token,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'clauditor',
      FORCE_COLOR: '3',
      WT_SESSION: crypto.randomUUID(),
    };
    const proc = pty.spawn(shell, [], { name: 'xterm-256color', cols, rows, cwd: s.cwd, env });
    s.proc = proc;
    s.pid = proc.pid;
    proc.onData((data) => {
      s.buffer += data;
      if (s.buffer.length > MAX_BUFFER) s.buffer = s.buffer.slice(-MAX_BUFFER);
      this.emit('data', id, data);
    });
    proc.onExit(({ exitCode, signal }) => {
      this.emit('exit', id, exitCode, signal);
      s.proc = null;
      s.pid = null;
    });
    this.emit('restart', this.describe(id));
    return this.describe(id);
  }

  registerStub(record) {
    const session = {
      id: record.id,
      name: record.name || `session-${record.id.slice(0, 6)}`,
      cwd: record.cwd,
      pid: null,
      proc: null,
      buffer: record.buffer || '',
      createdAt: record.createdAt || Date.now(),
    };
    this.sessions.set(session.id, session);
    this.emit('spawn', this.describe(session.id));
    return this.describe(session.id);
  }

  killAll() {
    for (const id of this.sessions.keys()) this.kill(id);
  }
}

module.exports = { PTYManager, resolveClaude };
