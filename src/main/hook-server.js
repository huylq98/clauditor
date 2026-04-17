const express = require('express');
const bodyParser = require('body-parser');
const { EventEmitter } = require('events');

const PORT = 27182;
const ACTIVITY_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

class HookServer extends EventEmitter {
  constructor({ token, stateEngine, ptyManager }) {
    super();
    this.token = token;
    this.stateEngine = stateEngine;
    this.ptyManager = ptyManager;
    this.app = express();
    this.app.use(bodyParser.json({ limit: '2mb' }));
    this.app.use(bodyParser.text({ type: '*/*', limit: '2mb' }));

    this.app.use((req, res, next) => {
      const t = req.header('X-Clauditor-Token') || req.query.token;
      if (t !== this.token) return res.status(403).json({ error: 'forbidden' });
      next();
    });

    const handle = (hookName) => (req, res) => {
      const payload = typeof req.body === 'string' ? tryParse(req.body) : req.body || {};
      const ppid = Number(payload.clauditor_ppid) || 0;
      const sid = this.ptyManager?.findIdByPid(ppid) || null;
      if (sid) {
        this.stateEngine.handleHook(sid, hookName);
        this._maybeEmitActivity(sid, hookName, payload);
      }
      res.json({ ok: true, sid });
    };

    this.app.post('/hook/user-prompt-submit', handle('user-prompt-submit'));
    this.app.post('/hook/pre-tool-use', handle('pre-tool-use'));
    this.app.post('/hook/post-tool-use', handle('post-tool-use'));
    this.app.post('/hook/stop', handle('stop'));
    this.app.post('/hook/notification', handle('notification'));
    this.app.get('/health', (_req, res) => res.json({ ok: true }));
  }

  _maybeEmitActivity(sid, hookName, payload) {
    if (hookName !== 'pre-tool-use' && hookName !== 'post-tool-use') return;
    const tool = payload.tool_name;
    if (!tool || !ACTIVITY_TOOLS.has(tool)) return;
    // NotebookEdit's payload uses notebook_path; other tools use file_path.
    const filePath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
    if (typeof filePath !== 'string') return;
    this.emit('file-activity', {
      sid, tool,
      phase: hookName === 'pre-tool-use' ? 'pre' : 'post',
      path: filePath,
    });
  }

  start() {
    const port = Number(process.env.CLAUDITOR_HOOK_PORT) || PORT;
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve(port);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

module.exports = { HookServer, PORT };
