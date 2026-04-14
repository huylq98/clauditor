const express = require('express');
const bodyParser = require('body-parser');

const PORT = 27182;

class HookServer {
  constructor({ token, stateEngine }) {
    this.token = token;
    this.stateEngine = stateEngine;
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
      const sid = payload.clauditor_session_id
        || req.header('X-Clauditor-Session')
        || process.env.CLAUDITOR_SESSION_ID;
      if (sid) this.stateEngine.handleHook(sid, hookName);
      res.json({ ok: true, sid: sid || null });
    };

    this.app.post('/hook/user-prompt-submit', handle('user-prompt-submit'));
    this.app.post('/hook/pre-tool-use', handle('pre-tool-use'));
    this.app.post('/hook/post-tool-use', handle('post-tool-use'));
    this.app.post('/hook/stop', handle('stop'));
    this.app.post('/hook/notification', handle('notification'));
    this.app.get('/health', (_req, res) => res.json({ ok: true }));
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(PORT, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve(PORT);
      });
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
