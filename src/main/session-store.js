const fs = require('fs');
const path = require('path');

const FILE_NAME = 'sessions.json';
const VERSION = 1;

class SessionStore {
  constructor({ userDataDir }) {
    this.file = path.join(userDataDir, FILE_NAME);
    this.tmp = `${this.file}.tmp`;
    this._dirtyTimer = null;
    this._snapshot = () => [];
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

  async _quarantine() {
    try { await fs.promises.rename(this.file, `${this.file}.corrupt`); } catch {}
  }
}

module.exports = { SessionStore };
