const { EventEmitter } = require('events');

const TOOL_TO_KIND = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
};

class FileActivityService extends EventEmitter {
  constructor({ now = () => Date.now(), ttlMs = 3000, logCap = 20 } = {}) {
    super();
    this.now = now;
    this.ttlMs = ttlMs;
    this.logCap = logCap;
    this.state = new Map(); // sid -> { modified:Set, created:Set, touching:Map<path, ts>, log:[] }
  }

  register(sid) {
    if (this.state.has(sid)) return;
    this.state.set(sid, {
      modified: new Set(),
      created: new Set(),
      touching: new Map(),
      log: [],
    });
  }

  unregister(sid) {
    this.state.delete(sid);
  }

  snapshot(sid) {
    const s = this.state.get(sid);
    if (!s) return null;
    return {
      modified: [...s.modified],
      created: [...s.created],
      touching: [...s.touching.keys()],
      log: s.log.slice(),
    };
  }

  handle({ sid, tool, phase, path }) {
    const s = this.state.get(sid);
    if (!s) return;
    if (phase === 'pre') {
      s.touching.set(path, this.now());
      this.emit('delta', sid, { type: 'touching-start', path });
      return;
    }
    // post phase
    s.touching.delete(path);
    const kind = TOOL_TO_KIND[tool] || 'edit';
    if (kind === 'read') {
      this._pushLog(sid, { ts: this.now(), kind, path });
      this.emit('delta', sid, { type: 'touching-end', path });
      return;
    }
    if (!s.modified.has(path) && !s.created.has(path)) {
      s.modified.add(path);
    }
    this._pushLog(sid, { ts: this.now(), kind, path });
    this.emit('delta', sid, { type: 'modified', path });
    this.emit('delta', sid, { type: 'touching-end', path });
  }

  markCreated(sid, path) {
    const s = this.state.get(sid);
    if (!s) return;
    s.modified.delete(path);
    s.created.add(path);
    this.emit('delta', sid, { type: 'created', path });
  }

  markDeleted(sid, path) {
    const s = this.state.get(sid);
    if (!s) return;
    s.modified.delete(path);
    s.created.delete(path);
    this._pushLog(sid, { ts: this.now(), kind: 'delete', path });
    this.emit('delta', sid, { type: 'deleted', path });
  }

  tick() {
    const cutoff = this.now() - this.ttlMs;
    for (const [sid, s] of this.state) {
      for (const [path, ts] of s.touching) {
        if (ts < cutoff) {
          s.touching.delete(path);
          this.emit('delta', sid, { type: 'touching-end', path });
        }
      }
    }
  }

  _pushLog(sid, entry) {
    const s = this.state.get(sid);
    s.log.unshift(entry);
    if (s.log.length > this.logCap) s.log.length = this.logCap;
  }
}

module.exports = { FileActivityService };
