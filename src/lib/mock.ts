/**
 * In-memory mock backend used when the app runs in a plain browser (not inside
 * Tauri). Implements the same command/event surface with toy PTYs that echo
 * input and pretend to run a busy loop. Deleted once the real Rust backend
 * handles all commands.
 */

import type * as B from './bindings';

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();
function emit<T>(event: string, payload: T) {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of set) h(payload);
}

interface MockSession {
  desc: B.SessionDesc;
  buffer: string;
  timers: ReturnType<typeof setInterval>[];
}
const sessions = new Map<B.SessionId, MockSession>();
let idCounter = 0;

let mockPreferences: B.Preferences = {
  version: 1,
  appearance: { theme: 'dark', uiScale: 100 },
  shortcuts: {},
};

const mockInstalledHooks: B.InstalledHooks = {
  settingsPath: 'C:\\Users\\demo\\.claude\\settings.json',
  settingsPresent: true,
  parseError: null,
  entries: [
    { event: 'UserPromptSubmit', status: 'present' },
    { event: 'PreToolUse', status: 'present' },
    { event: 'PostToolUse', status: 'present' },
    { event: 'Stop', status: 'missing' },
    { event: 'Notification', status: 'present' },
  ],
};

const welcome = (name: string, cwd: string) =>
  [
    '\x1b[38;5;208m',
    '  ___ _                _ _ _             \r\n',
    ' / __| |__ _ _  _ __ _(_) |_ ___ _ _     \r\n',
    "| (__| / _` | || / _` | |  _/ _ \\ '_|    \r\n",
    ' \\___|_\\__,_|\\_,_\\__,_|_|\\__\\___/_|      \r\n',
    '\x1b[0m\r\n',
    `\x1b[2mmock backend · running in browser\x1b[0m\r\n`,
    `session: \x1b[33m${name}\x1b[0m\r\n`,
    `cwd:     \x1b[36m${cwd}\x1b[0m\r\n\r\n`,
    '\x1b[32m$\x1b[0m ',
  ].join('');

function makeSession(args: B.CreateSessionArgs): B.SessionDesc {
  idCounter += 1;
  const id = `mock-${idCounter.toString().padStart(4, '0')}`;
  const name = args.name ?? `session-${idCounter}`;
  const cwd = args.cwd ?? `C:\\Users\\demo\\repo-${idCounter}`;
  const desc: B.SessionDesc = {
    id,
    name,
    cwd,
    created_at: Date.now(),
    pid: 10_000 + idCounter,
    state: 'running',
  };
  const buf = welcome(name, cwd);
  const s: MockSession = { desc, buffer: buf, timers: [] };
  sessions.set(id, s);

  // Periodically flip state to simulate activity/hook events
  const t = setInterval(() => {
    const states: B.SessionState[] = ['running', 'idle', 'working', 'awaiting_user'];
    const next = states[Math.floor(Math.random() * states.length)];
    if (next !== s.desc.state) {
      s.desc.state = next;
      emit<B.SessionStateEvent>('session:state', { id, state: next });
    }
  }, 6000);
  s.timers.push(t);

  return desc;
}

export const mock = {
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    switch (cmd) {
      case 'sessions_list':
        return [...sessions.values()].map((s) => s.desc) as T;

      case 'sessions_create': {
        const createArgs = (args?.args ?? {}) as B.CreateSessionArgs;
        const desc = makeSession(createArgs);
        queueMicrotask(() => emit<B.SessionDesc>('session:created', desc));
        return desc as T;
      }

      case 'sessions_kill': {
        const id = args?.id as B.SessionId;
        const s = sessions.get(id);
        if (!s) return false as T;
        for (const t of s.timers) clearInterval(t);
        s.desc.state = 'exited';
        emit<B.SessionStateEvent>('session:state', { id, state: 'exited' });
        emit<B.SessionExitEvent>('session:exit', { id, code: 0 });
        return true as T;
      }

      case 'sessions_restart': {
        const id = args?.id as B.SessionId;
        const s = sessions.get(id);
        if (!s) return null as T;
        s.desc.state = 'running';
        s.buffer += '\r\n\x1b[2m— restarted —\x1b[0m\r\n\x1b[32m$\x1b[0m ';
        emit<B.SessionStateEvent>('session:state', { id, state: 'running' });
        return s.desc as T;
      }

      case 'sessions_forget': {
        const id = args?.id as B.SessionId;
        const s = sessions.get(id);
        if (s) {
          for (const t of s.timers) clearInterval(t);
          sessions.delete(id);
          emit<B.SessionForgottenEvent>('session:forgotten', { id });
        }
        return true as T;
      }

      case 'sessions_rename': {
        const id = args?.id as B.SessionId;
        const name = args?.name as string;
        const s = sessions.get(id);
        if (!s) throw new Error('no such session');
        s.desc.name = name;
        emit<B.SessionDesc>('session:renamed', s.desc);
        return s.desc as T;
      }

      case 'sessions_write': {
        const id = args?.id as B.SessionId;
        const data = args?.data as string;
        const s = sessions.get(id);
        if (!s) return undefined as T;
        // Local echo
        const echo = data.replace(/\r/g, '\r\n');
        s.buffer += echo;
        emit<B.SessionDataEvent>('session:data', { id, chunk: echo });
        if (data.includes('\r')) {
          setTimeout(() => {
            const prompt = '\x1b[32m$\x1b[0m ';
            s.buffer += prompt;
            emit<B.SessionDataEvent>('session:data', { id, chunk: prompt });
          }, 50);
        }
        return undefined as T;
      }

      case 'sessions_resize':
        return undefined as T;

      case 'sessions_buffer': {
        const id = args?.id as B.SessionId;
        const s = sessions.get(id);
        return (s?.buffer ?? '') as T;
      }

      case 'sessions_kill_all': {
        let killed = 0;
        for (const [id, s] of sessions) {
          if (s.desc.state !== 'exited') {
            for (const t of s.timers) clearInterval(t);
            s.desc.state = 'exited';
            emit<B.SessionStateEvent>('session:state', { id, state: 'exited' });
            emit<B.SessionExitEvent>('session:exit', { id, code: 0 });
            killed += 1;
          }
        }
        return { killed } as T;
      }

      case 'sessions_restart_all_exited': {
        let restarted = 0;
        for (const [id, s] of sessions) {
          if (s.desc.state === 'exited') {
            s.desc.state = 'running';
            emit<B.SessionStateEvent>('session:state', { id, state: 'running' });
            restarted += 1;
          }
        }
        return { restarted } as T;
      }

      case 'sessions_forget_all_exited': {
        let forgotten = 0;
        for (const [id, s] of [...sessions]) {
          if (s.desc.state === 'exited') {
            for (const t of s.timers) clearInterval(t);
            sessions.delete(id);
            emit<B.SessionForgottenEvent>('session:forgotten', { id });
            forgotten += 1;
          }
        }
        return { forgotten } as T;
      }

      case 'tree_list':
        return [
          { path: 'src', kind: 'dir' as const, size: null, mtime: Date.now() },
          { path: 'README.md', kind: 'file' as const, size: 2048, mtime: Date.now() },
          { path: 'package.json', kind: 'file' as const, size: 512, mtime: Date.now() },
        ] as T;

      case 'file_read': {
        const rel = args?.rel as string;
        return {
          path: rel,
          content: `// mock content for ${rel}\n`,
          truncated: false,
          binary: false,
        } as T;
      }

      case 'activity_snapshot':
        return {
          created: [],
          modified: [],
          deleted: [],
          tools: {},
        } as T;

      case 'dialog_pick_directory':
        return (window.prompt('(mock) working directory:', 'C:\\Users\\demo\\repo') ?? null) as T;

      case 'get_preferences':
        return mockPreferences as unknown as T;
      case 'set_preferences':
        mockPreferences = (args as { preferences: B.Preferences }).preferences;
        return undefined as unknown as T;
      case 'read_installed_hooks':
        return mockInstalledHooks as unknown as T;
      case 'reinstall_hooks':
        for (const e of mockInstalledHooks.entries) e.status = 'present';
        return undefined as unknown as T;

      case 'list_capabilities':
        return {
          items: [
            {
              id: 'skill:plugin:mp/p/1.0.0:demo',
              kind: 'skill',
              name: 'demo',
              description: 'A demo skill.',
              whenToUse: 'Use when running the smoke test.',
              source: { type: 'plugin', marketplace: 'mp', plugin: 'p', version: '1.0.0' },
              invocation: '/demo',
            },
            {
              id: 'mcpserver:settings:settings.json:context7',
              kind: 'mcpserver',
              name: 'context7',
              description: 'Fetch current library docs.',
              whenToUse: null,
              source: { type: 'settings', file: 'settings.json' },
              invocation: '@context7',
            },
          ],
          scannedAt: Date.now(),
          parseWarnings: [],
        } as T;

      default:
        console.warn('[mock] unknown command:', cmd);
        return undefined as T;
    }
  },

  async listen<T>(event: string, handler: (payload: T) => void) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set!.delete(handler as Handler);
    };
  },
};

// ---------------------------------------------------------------------------
// Updater mock — drives Playwright tests for the UpdateBanner without hitting
// the real tauri-plugin-updater. Tests override per-case via:
//   window.__MOCK_UPDATE__ = { available: true, version: '99.0.0' }
// before navigating to the page.
// ---------------------------------------------------------------------------

type MockUpdateConfig = {
  available: boolean;
  version?: string;
  body?: string;
  date?: string;
};

type ProgressEvent =
  | { event: 'Started'; data: { contentLength: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

declare global {
  interface Window {
    __MOCK_UPDATE__?: MockUpdateConfig;
  }
}

export const updaterMock = {
  async check() {
    const cfg = (typeof window !== 'undefined' && window.__MOCK_UPDATE__) || { available: false };
    if (!cfg.available) return null;
    return {
      available: true,
      version: cfg.version ?? '99.0.0',
      body: cfg.body ?? 'Mock release notes',
      date: cfg.date ?? new Date().toISOString(),
      async downloadAndInstall(onProgress?: (ev: ProgressEvent) => void) {
        onProgress?.({ event: 'Started', data: { contentLength: 1000 } });
        onProgress?.({ event: 'Progress', data: { chunkLength: 500 } });
        onProgress?.({ event: 'Progress', data: { chunkLength: 500 } });
        onProgress?.({ event: 'Finished' });
      },
    };
  },
  async relaunch() {
    // No-op in browser mock.
  },
};
