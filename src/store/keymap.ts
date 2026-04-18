import { create } from 'zustand';
import { usePreferences } from '@/store/preferences';
import { DEFAULT_KEYMAP, parseChord, type ActionId, type Chord } from '@/lib/keymap';

interface KeymapStore {
  chords: Record<ActionId, Chord | null>;
}

function derive(shortcuts: Record<string, string | null>): Record<ActionId, Chord | null> {
  const out = {} as Record<ActionId, Chord | null>;
  for (const id of Object.keys(DEFAULT_KEYMAP) as ActionId[]) {
    const override = shortcuts[id];
    if (override === null) {
      out[id] = null; // explicit unbind
    } else if (override === undefined) {
      out[id] = parseChord(DEFAULT_KEYMAP[id]);
    } else {
      out[id] = parseChord(override);
    }
  }
  return out;
}

export const useKeymap = create<KeymapStore>(() => ({
  chords: derive({}),
}));

// Subscribe to preferences and re-derive when shortcuts change.
usePreferences.subscribe((state, prev) => {
  if (state.shortcuts !== prev.shortcuts) {
    useKeymap.setState({ chords: derive(state.shortcuts) });
  }
});
