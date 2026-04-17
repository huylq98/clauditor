const { Notification } = require('electron');

class Notifier {
  constructor({ onClick, onAttention }) {
    this.onClick = onClick;
    this.onAttention = onAttention;
    this.lastFired = new Map();
  }

  notify(id, state, session) {
    const key = `${id}:${state}`;
    const now = Date.now();
    const last = this.lastFired.get(key) || 0;
    if (now - last < 2000) return;
    this.lastFired.set(key, now);

    let title, body;
    const name = session?.name || 'Session';
    switch (state) {
      case 'awaiting_permission':
        title = 'Permission needed';
        body = `${name} is asking for permission.`;
        break;
      case 'awaiting_user':
        title = 'Waiting for you';
        body = `${name} finished — awaiting your reply.`;
        break;
      case 'exited':
        title = 'Session ended';
        body = `${name} exited.`;
        break;
      default:
        return;
    }

    this.onAttention?.(id, state);

    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => this.onClick?.(id));
    n.show();
  }
}

module.exports = { Notifier };
