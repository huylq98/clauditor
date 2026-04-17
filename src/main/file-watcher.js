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
    const visible = dirents.filter((d) => !this._shouldIgnore(path.join(abs, d.name), entry.root, entry.ignores));
    const mapped = await Promise.all(visible.map(async (d) => {
      const node = { name: d.name, dir: d.isDirectory() };
      if (node.dir) node.empty = await this._isDirEmpty(path.join(abs, d.name), entry.root, entry.ignores);
      return node;
    }));
    return mapped.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async _isDirEmpty(absDir, root, ignores) {
    try {
      const kids = await fs.promises.readdir(absDir, { withFileTypes: true });
      return !kids.some((k) => !this._shouldIgnore(path.join(absDir, k.name), root, ignores));
    } catch {
      return true;
    }
  }

  async readFile(sid, relPath) {
    const entry = this.watchers.get(sid);
    if (!entry) return null;
    const abs = path.resolve(entry.root, relPath || '.');
    const rel = path.relative(entry.root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    try {
      const st = await fs.promises.stat(abs);
      if (!st.isFile()) return null;
      const MAX = 512 * 1024;
      if (st.size > MAX) {
        const fd = await fs.promises.open(abs, 'r');
        const buf = Buffer.alloc(MAX);
        await fd.read(buf, 0, MAX, 0);
        await fd.close();
        return { path: relPath, size: st.size, truncated: true, content: buf.toString('utf8') };
      }
      const content = await fs.promises.readFile(abs, 'utf8');
      return { path: relPath, size: st.size, truncated: false, content };
    } catch {
      return null;
    }
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
