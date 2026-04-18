export type ActionId =
  | 'new-session' | 'close-active'
  | 'jump-tab-1' | 'jump-tab-2' | 'jump-tab-3' | 'jump-tab-4'
  | 'jump-tab-5' | 'jump-tab-6' | 'jump-tab-7' | 'jump-tab-8' | 'jump-tab-9'
  | 'next-tab' | 'prev-tab'
  | 'toggle-sidebar' | 'command-palette' | 'shortcuts-cheatsheet' | 'settings';

export interface ActionDef {
  id: ActionId;
  label: string;
  group: 'Sessions' | 'Navigation';
}

export interface Chord {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export type ShortcutsMap = Partial<Record<ActionId, string>>;

export const ACTION_CATALOG: ActionDef[] = [
  { id: 'new-session', label: 'New session', group: 'Sessions' },
  { id: 'close-active', label: 'Close active session', group: 'Sessions' },
  { id: 'jump-tab-1', label: 'Jump to session 1', group: 'Sessions' },
  { id: 'jump-tab-2', label: 'Jump to session 2', group: 'Sessions' },
  { id: 'jump-tab-3', label: 'Jump to session 3', group: 'Sessions' },
  { id: 'jump-tab-4', label: 'Jump to session 4', group: 'Sessions' },
  { id: 'jump-tab-5', label: 'Jump to session 5', group: 'Sessions' },
  { id: 'jump-tab-6', label: 'Jump to session 6', group: 'Sessions' },
  { id: 'jump-tab-7', label: 'Jump to session 7', group: 'Sessions' },
  { id: 'jump-tab-8', label: 'Jump to session 8', group: 'Sessions' },
  { id: 'jump-tab-9', label: 'Jump to session 9', group: 'Sessions' },
  { id: 'next-tab', label: 'Next tab', group: 'Sessions' },
  { id: 'prev-tab', label: 'Previous tab', group: 'Sessions' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', group: 'Navigation' },
  { id: 'command-palette', label: 'Command palette', group: 'Navigation' },
  { id: 'shortcuts-cheatsheet', label: 'Keyboard shortcuts cheat sheet', group: 'Navigation' },
  { id: 'settings', label: 'Open settings', group: 'Navigation' },
];

export const DEFAULT_KEYMAP: Record<ActionId, string> = {
  'new-session': 'Ctrl+T',
  'close-active': 'Ctrl+W',
  'jump-tab-1': 'Ctrl+1',
  'jump-tab-2': 'Ctrl+2',
  'jump-tab-3': 'Ctrl+3',
  'jump-tab-4': 'Ctrl+4',
  'jump-tab-5': 'Ctrl+5',
  'jump-tab-6': 'Ctrl+6',
  'jump-tab-7': 'Ctrl+7',
  'jump-tab-8': 'Ctrl+8',
  'jump-tab-9': 'Ctrl+9',
  'next-tab': 'Ctrl+Shift+]',
  'prev-tab': 'Ctrl+Shift+[',
  'toggle-sidebar': 'Ctrl+B',
  'command-palette': 'Ctrl+K',
  'shortcuts-cheatsheet': 'Ctrl+/',
  'settings': 'Ctrl+,',
};

const MOD_ORDER: Array<['ctrl' | 'meta' | 'alt' | 'shift', string]> = [
  ['ctrl', 'Ctrl'],
  ['meta', 'Cmd'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
];
const MOD_ALIASES: Record<string, 'ctrl' | 'meta' | 'alt' | 'shift'> = {
  ctrl: 'ctrl', control: 'ctrl',
  cmd: 'meta', command: 'meta', meta: 'meta', win: 'meta', super: 'meta',
  alt: 'alt', option: 'alt', opt: 'alt',
  shift: 'shift',
};

export function parseChord(input: string): Chord | null {
  if (!input) return null;
  const parts = input.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const chord: Chord = { ctrl: false, meta: false, alt: false, shift: false, key: '' };
  for (let i = 0; i < parts.length - 1; i++) {
    const alias = MOD_ALIASES[parts[i].toLowerCase()];
    if (!alias) return null;
    chord[alias] = true;
  }
  const last = parts[parts.length - 1];
  if (last.length === 0) return null;
  if (MOD_ALIASES[last.toLowerCase()]) return null; // trailing modifier → malformed
  chord.key = last.toLowerCase();
  return chord;
}

export function formatChord(chord: Chord | null): string {
  if (!chord) return '';
  const out: string[] = [];
  for (const [flag, label] of MOD_ORDER) {
    if (chord[flag]) out.push(label);
  }
  out.push(chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  return out.join('+');
}

export function matchesChord(event: KeyboardEvent, chord: Chord | null): boolean {
  if (!chord) return false;
  if (event.ctrlKey !== chord.ctrl) return false;
  if (event.metaKey !== chord.meta) return false;
  if (event.altKey !== chord.alt) return false;
  if (event.shiftKey !== chord.shift) return false;
  return event.key.toLowerCase() === chord.key;
}

export function findConflict(
  newChord: string,
  forActionId: ActionId,
  shortcuts: Record<string, string>,
): ActionId | null {
  const parsed = parseChord(newChord);
  if (!parsed) return null;
  const target = formatChord(parsed);
  for (const [actionId, chord] of Object.entries(shortcuts)) {
    if (actionId === forActionId) continue;
    if (!chord) continue;
    const existing = parseChord(chord);
    if (existing && formatChord(existing) === target) {
      return actionId as ActionId;
    }
  }
  return null;
}
