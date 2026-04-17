const { EventEmitter } = require('events');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORES = ['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'out'];

class FileWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map(); // sid -> { root, watcher, ignores }
  }

  async create(sid, root) {
    if (this.watchers.has(sid)) await this.destroy(sid);
    const ignores = this._buildIgnores(root);
    const watcher = chokidar.watch(root, {
      ignored: (p) => this._shouldIgnore(p, root, ignores),
      ignoreInitial: true,
      depth: Infinity,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });
    watcher.on('add', (p) => this.emit('event', sid, { type: 'add', path: p }));
    watcher.on('change', (p) => this.emit('event', sid, { type: 'change', path: p }));
    watcher.on('unlink', (p) => this.emit('event', sid, { type: 'unlink', path: p }));
    watcher.on('addDir', (p) => { if (p !== root) this.emit('event', sid, { type: 'addDir', path: p }); });
    watcher.on('unlinkDir', (p) => this.emit('event', sid, { type: 'unlinkDir', path: p }));
    this.watchers.set(sid, { root, watcher, ignores });
    await new Promise((res) => watcher.on('ready', res));
  }

  async destroy(sid) {
    const entry = this.watchers.get(sid);
    if (!entry) return;
    this.watchers.delete(sid);
    await entry.watcher.close();
  }

  async list(sid, relPath) {
    const entry = this.watchers.get(sid);
    if (!entry) return [];
    const abs = path.resolve(entry.root, relPath || '.');
    let dirents;
    try {
      dirents = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    return dirents
      .filter((d) => !this._shouldIgnore(path.join(abs, d.name), entry.root, entry.ignores))
      .map((d) => ({ name: d.name, dir: d.isDirectory() }))
      .sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  _buildIgnores(root) {
    const set = new Set(DEFAULT_IGNORES);
    const gi = path.join(root, '.gitignore');
    try {
      const text = fs.readFileSync(gi, 'utf8');
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;
        const normalized = line.replace(/^\/+|\/+$/g, '');
        if (normalized && !normalized.includes('/') && !normalized.includes('*')) {
          set.add(normalized);
        }
      }
    } catch {}
    return set;
  }

  _shouldIgnore(abs, root, ignores) {
    if (abs === root) return false;
    const rel = path.relative(root, abs);
    if (!rel || rel.startsWith('..')) return false;
    const segments = rel.split(path.sep);
    return segments.some((seg) => ignores.has(seg));
  }
}

module.exports = { FileWatcher, DEFAULT_IGNORES };
