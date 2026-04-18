/**
 * Types that mirror the Rust command/event contracts.
 *
 * Hand-written for now; will be replaced by `specta`-generated output once
 * the Rust backend exists. Keep field names in snake_case to match serde's
 * default serialization — the frontend consumes them directly.
 */

export type SessionId = string; // Uuid on the wire

export type SessionState =
  | 'starting'
  | 'running'
  | 'idle'
  | 'awaiting_user'
  | 'awaiting_permission'
  | 'working'
  | 'exited';

export interface SessionDesc {
  id: SessionId;
  name: string;
  cwd: string;
  created_at: number;
  pid: number | null;
  state: SessionState;
}

export interface CreateSessionArgs {
  cwd?: string | null;
  name?: string | null;
  cols: number;
  rows: number;
}

export interface KillSummary {
  killed: number;
}
export interface RestartSummary {
  restarted: number;
}
export interface ForgetSummary {
  forgotten: number;
}

export type TreeEntryKind = 'dir' | 'file';
export interface TreeEntry {
  path: string;
  kind: TreeEntryKind;
  size: number | null;
  mtime: number | null;
}

export interface FilePreview {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export interface ActivitySnapshot {
  created: string[];
  modified: string[];
  deleted: string[];
  tools: Record<string, number>;
}

export interface ActivityDelta {
  created?: string[];
  modified?: string[];
  deleted?: string[];
  tools?: Record<string, number>;
}

export type TreeEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
export interface TreeEvent {
  sid: SessionId;
  type: TreeEventType;
  path: string;
  kind?: TreeEntryKind;
}

/* Event payloads — one entry per emit channel from the backend. */
export interface SessionDataEvent {
  id: SessionId;
  chunk: string;
}
export interface SessionStateEvent {
  id: SessionId;
  state: SessionState;
}
export interface SessionExitEvent {
  id: SessionId;
  code: number | null;
}
export interface SessionFocusEvent {
  id: SessionId;
}
export interface SessionForgottenEvent {
  id: SessionId;
}
export interface ActivityDeltaEvent {
  sid: SessionId;
  delta: ActivityDelta;
}

export interface Appearance {
  theme: 'dark' | 'light' | 'system';
  uiScale: number;
}

export interface Preferences {
  version: number;
  appearance: Appearance;
  shortcuts: Record<string, string | null>;
}

export type HookStatus = 'present' | 'missing' | 'stale';
export interface HookEntry {
  event: string;
  status: HookStatus;
}
export interface InstalledHooks {
  settingsPath: string;
  settingsPresent: boolean;
  parseError: string | null;
  entries: HookEntry[];
}
