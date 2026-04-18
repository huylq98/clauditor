import { describe, it, expect } from 'vitest';
import {
  Chord,
  parseChord,
  formatChord,
  matchesChord,
  findConflict,
  DEFAULT_KEYMAP,
  ACTION_CATALOG,
} from './keymap';

describe('parseChord', () => {
  it('parses a simple Ctrl+T', () => {
    expect(parseChord('Ctrl+T')).toEqual({
      ctrl: true, meta: false, alt: false, shift: false, key: 't',
    });
  });
  it('parses Cmd+Shift+P (mac alias)', () => {
    expect(parseChord('Cmd+Shift+P')).toEqual({
      ctrl: false, meta: true, alt: false, shift: true, key: 'p',
    });
  });
  it('parses Ctrl+Shift+]', () => {
    expect(parseChord('Ctrl+Shift+]')).toEqual({
      ctrl: true, meta: false, alt: false, shift: true, key: ']',
    });
  });
  it('returns null for empty string', () => {
    expect(parseChord('')).toBeNull();
  });
  it('returns null for malformed input', () => {
    expect(parseChord('Ctrl+')).toBeNull();
    expect(parseChord('NotAModifier+X')).toBeNull();
  });
});

describe('formatChord', () => {
  it('round-trips parseChord', () => {
    const input = 'Ctrl+Shift+]';
    expect(formatChord(parseChord(input)!)).toBe(input);
  });
  it('formats null as empty string', () => {
    expect(formatChord(null)).toBe('');
  });
  it('orders modifiers canonically (Ctrl, Cmd, Alt, Shift)', () => {
    expect(formatChord({ ctrl: true, meta: true, alt: true, shift: true, key: 'k' }))
      .toBe('Ctrl+Cmd+Alt+Shift+K');
  });
});

describe('matchesChord', () => {
  const k = (over: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '', ...over }) as KeyboardEvent;

  it('matches when modifiers+key match', () => {
    const chord = parseChord('Ctrl+T')!;
    expect(matchesChord(k({ ctrlKey: true, key: 't' }), chord)).toBe(true);
    expect(matchesChord(k({ ctrlKey: true, key: 'T' }), chord)).toBe(true);
  });
  it('does not match when a modifier is missing', () => {
    expect(matchesChord(k({ key: 't' }), parseChord('Ctrl+T')!)).toBe(false);
  });
  it('does not match when an extra modifier is present', () => {
    expect(matchesChord(k({ ctrlKey: true, shiftKey: true, key: 't' }), parseChord('Ctrl+T')!)).toBe(false);
  });
  it('treats a null chord as non-matching', () => {
    expect(matchesChord(k({ ctrlKey: true, key: 't' }), null)).toBe(false);
  });
});

describe('findConflict', () => {
  const shortcuts = {
    'new-session': 'Ctrl+T',
    'command-palette': 'Ctrl+K',
  } as const;
  it('returns the other action id when bound to the same chord', () => {
    expect(findConflict('Ctrl+K', 'new-session', shortcuts)).toBe('command-palette');
  });
  it('returns null when chord is free', () => {
    expect(findConflict('Ctrl+Shift+P', 'new-session', shortcuts)).toBeNull();
  });
  it('returns null when rebinding to the same chord already held', () => {
    expect(findConflict('Ctrl+T', 'new-session', shortcuts)).toBeNull();
  });
});

describe('DEFAULT_KEYMAP + ACTION_CATALOG', () => {
  it('every catalog action has a default chord', () => {
    for (const action of ACTION_CATALOG) {
      expect(DEFAULT_KEYMAP[action.id]).toBeDefined();
    }
  });
  it('defaults parse cleanly', () => {
    for (const action of ACTION_CATALOG) {
      expect(parseChord(DEFAULT_KEYMAP[action.id])).not.toBeNull();
    }
  });
});

// Suppress unused import warning — Chord is used as a type in the test file
type _ChordUsed = Chord;
