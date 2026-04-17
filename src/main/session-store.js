const fs = require('fs');
const path = require('path');

const FILE_NAME = 'sessions.json';
const VERSION = 1;

class SessionStore {
  constructor({ userDataDir, debounceMs = 500 }) {
    this.file = path.join(userDataDir, FILE_NAME);
    this.tmp = `${this.file}.tmp`;
    this.debounceMs = debounceMs;
    this._dirtyTimer = null;
    this._snapshot = () => [];
  }

  setSnapshot(fn) {
    this._snapshot = fn;
  }

  markDirty() {
    if (this._dirtyTimer) return;
    this._dirtyTimer = setTimeout(() => {
      this._dirtyTimer = null;
      const records = this._snapshot();
      this.saveNow(records).catch((err) => {
        console.error('[session-store] flush failed:', err);
      });
    }, this.debounceMs);
  }

  flushSync() {
    if (this._dirtyTimer) {
      clearTimeout(this._dirtyTimer);
      this._dirtyTimer = null;
    }
    const records = this._snapshot();
    const payload = JSON.stringify({ version: VERSION, sessions: records });
    fs.writeFileSync(this.tmp, payload, 'utf8');
    fs.renameSync(this.tmp, this.file);
  }

  async load() {
    let raw;
    try {
      raw = await fs.promises.readFile(this.file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      await this._quarantine();
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.sessions)) {
        await this._quarantine();
        return [];
      }
      return parsed.sessions;
    } catch {
      await this._quarantine();
      return [];
    }
  }

  async saveNow(records) {
    const payload = JSON.stringify({ version: VERSION, sessions: records });
    await fs.promises.writeFile(this.tmp, payload, 'utf8');
    await fs.promises.rename(this.tmp, this.file);
  }

  async remove(id) {
    const records = this._snapshot().filter((r) => r.id !== id);
    await this.saveNow(records);
  }

  async _quarantine() {
    try { await fs.promises.rename(this.file, `${this.file}.corrupt`); } catch {}
  }
}

module.exports = { SessionStore };
