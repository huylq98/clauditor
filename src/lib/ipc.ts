/**
 * Typed IPC wrapper. Uses Tauri's invoke/listen when running inside the Tauri
 * shell; falls back to an in-memory mock when loaded in a plain browser
 * (enables UI development before the Rust backend exists).
 */

import type * as B from './bindings';
import { mock } from './mock';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Unlisten = () => void;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }
  return mock.invoke<T>(cmd, args);
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
  if (IS_TAURI) {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<T>(event, (e) => handler(e.payload));
    return unlisten;
  }
  return mock.listen<T>(event, handler);
}

export const api = {
  listSessions: () => invoke<B.SessionDesc[]>('sessions_list'),
  createSession: (args: B.CreateSessionArgs) =>
    invoke<B.SessionDesc | null>('sessions_create', { args }),
  killSession: (id: B.SessionId) => invoke<boolean>('sessions_kill', { id }),
  restartSession: (id: B.SessionId, cols: number, rows: number) =>
    invoke<B.SessionDesc | null>('sessions_restart', { id, cols, rows }),
  forgetSession: (id: B.SessionId) => invoke<boolean>('sessions_forget', { id }),
  renameSession: (id: B.SessionId, name: string) =>
    invoke<B.SessionDesc>('sessions_rename', { id, name }),
  writeSession: (id: B.SessionId, data: string) =>
    invoke<void>('sessions_write', { id, data }),
  resizeSession: (id: B.SessionId, cols: number, rows: number) =>
    invoke<void>('sessions_resize', { id, cols, rows }),
  getBuffer: (id: B.SessionId) => invoke<string>('sessions_buffer', { id }),
  killAll: () => invoke<B.KillSummary>('sessions_kill_all'),
  restartAllExited: (cols: number, rows: number) =>
    invoke<B.RestartSummary>('sessions_restart_all_exited', { cols, rows }),
  forgetAllExited: () => invoke<B.ForgetSummary>('sessions_forget_all_exited'),
  listTree: (sid: B.SessionId, rel: string) =>
    invoke<B.TreeEntry[]>('tree_list', { sid, rel }),
  readFile: (sid: B.SessionId, rel: string) =>
    invoke<B.FilePreview | null>('file_read', { sid, rel }),
  activitySnapshot: (sid: B.SessionId) =>
    invoke<B.ActivitySnapshot>('activity_snapshot', { sid }),
  pickDirectory: () => invoke<string | null>('dialog_pick_directory'),
  getPreferences: () => invoke<B.Preferences>('get_preferences'),
  setPreferences: (preferences: B.Preferences) =>
    invoke<void>('set_preferences', { preferences }),
  readInstalledHooks: () => invoke<B.InstalledHooks>('read_installed_hooks'),
  reinstallHooks: () => invoke<void>('reinstall_hooks'),
} as const;

export const on = {
  sessionCreated: (cb: (p: B.SessionDesc) => void) =>
    listen<B.SessionDesc>('session:created', cb),
  sessionData: (cb: (p: B.SessionDataEvent) => void) =>
    listen<B.SessionDataEvent>('session:data', cb),
  sessionState: (cb: (p: B.SessionStateEvent) => void) =>
    listen<B.SessionStateEvent>('session:state', cb),
  sessionExit: (cb: (p: B.SessionExitEvent) => void) =>
    listen<B.SessionExitEvent>('session:exit', cb),
  sessionRenamed: (cb: (p: B.SessionDesc) => void) =>
    listen<B.SessionDesc>('session:renamed', cb),
  sessionFocus: (cb: (p: B.SessionFocusEvent) => void) =>
    listen<B.SessionFocusEvent>('session:focus', cb),
  sessionForgotten: (cb: (p: B.SessionForgottenEvent) => void) =>
    listen<B.SessionForgottenEvent>('session:forgotten', cb),
  treeEvent: (cb: (p: B.TreeEvent) => void) =>
    listen<B.TreeEvent>('tree:event', cb),
  activityDelta: (cb: (p: B.ActivityDeltaEvent) => void) =>
    listen<B.ActivityDeltaEvent>('activity:delta', cb),
  newSessionRequest: (cb: () => void) =>
    listen<null>('ui:new-session', () => cb()),
  checkUpdatesRequest: (cb: () => void) =>
    listen<null>('ui:check-updates', () => cb()),
} as const;

export const isTauri = IS_TAURI;
