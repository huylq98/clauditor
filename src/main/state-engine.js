const { EventEmitter } = require('events');

const IDLE_MS = 5 * 60 * 1000;
const STOP_GRACE_MS = 1500;

class StateEngine extends EventEmitter {
  constructor() {
    super();
    this.states = new Map();
    this.timers = new Map();
  }

  register(id) {
    this.states.set(id, 'running');
    this._armIdle(id);
  }

  unregister(id) {
    this._clearTimers(id);
    const prev = this.states.get(id);
    this.states.delete(id);
    if (prev !== 'exited') {
      this.emit('change', id, 'exited', prev);
    }
  }

  get(id) {
    return this.states.get(id);
  }

  all() {
    return Object.fromEntries(this.states);
  }

  markExited(id) {
    const prev = this.states.get(id);
    if (prev === 'exited') return;
    this._clearTimers(id);
    this.states.set(id, 'exited');
    this.emit('change', id, 'exited', prev);
  }

  handleHook(id, hook) {
    if (!this.states.has(id)) return;
    switch (hook) {
      case 'user-prompt-submit':
      case 'pre-tool-use':
      case 'post-tool-use':
        this._set(id, 'running');
        this._armIdle(id);
        break;
      case 'stop':
        this._clearStopTimer(id);
        const t = setTimeout(() => {
          if (this.states.get(id) === 'running') {
            this._set(id, 'awaiting_user');
          }
        }, STOP_GRACE_MS);
        this.timers.set(`${id}:stop`, t);
        this._armIdle(id);
        break;
      case 'notification':
        this._set(id, 'awaiting_permission');
        this._armIdle(id);
        break;
    }
  }

  _set(id, next) {
    const prev = this.states.get(id);
    if (prev === next) return;
    this.states.set(id, next);
    this.emit('change', id, next, prev);
  }

  _armIdle(id) {
    const key = `${id}:idle`;
    clearTimeout(this.timers.get(key));
    const t = setTimeout(() => {
      if (['running', 'awaiting_user'].includes(this.states.get(id))) {
        this._set(id, 'idle');
      }
    }, IDLE_MS);
    this.timers.set(key, t);
  }

  _clearStopTimer(id) {
    const key = `${id}:stop`;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }

  _clearTimers(id) {
    for (const [k, t] of this.timers) {
      if (k.startsWith(`${id}:`)) {
        clearTimeout(t);
        this.timers.delete(k);
      }
    }
  }
}

module.exports = { StateEngine };
