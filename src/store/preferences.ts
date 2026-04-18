import { create } from 'zustand';
import { api } from '@/lib/ipc';
import type { Appearance, Preferences } from '@/lib/bindings';

interface PrefsStore {
  version: number;
  appearance: Appearance;
  shortcuts: Record<string, string | null>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setAppearance: (patch: Partial<Appearance>) => Promise<void>;
  setShortcut: (actionId: string, chord: string | null) => Promise<void>;
  batchSetShortcuts: (patch: Record<string, string | null>) => Promise<void>;
  resetShortcut: (actionId: string) => Promise<void>;
  resetAllShortcuts: () => Promise<void>;
}

function buildPayload(
  version: number,
  appearance: Appearance,
  shortcuts: Record<string, string | null>,
): Preferences {
  return { version, appearance, shortcuts };
}

export const usePreferences = create<PrefsStore>((set, get) => ({
  version: 1,
  appearance: { theme: 'dark', uiScale: 100 },
  shortcuts: {},
  hydrated: false,

  hydrate: async () => {
    const prefs = await api.getPreferences();
    set({
      version: prefs.version,
      appearance: prefs.appearance,
      shortcuts: prefs.shortcuts,
      hydrated: true,
    });
  },

  setAppearance: async (patch) => {
    const { version, appearance, shortcuts } = get();
    const next = { ...appearance, ...patch };
    set({ appearance: next });
    await api.setPreferences(buildPayload(version, next, shortcuts));
  },

  setShortcut: async (actionId, chord) => {
    const { version, appearance, shortcuts } = get();
    const next = { ...shortcuts, [actionId]: chord };
    set({ shortcuts: next });
    await api.setPreferences(buildPayload(version, appearance, next));
  },

  batchSetShortcuts: async (patch) => {
    const { version, appearance, shortcuts } = get();
    const next = { ...shortcuts, ...patch };
    set({ shortcuts: next });
    await api.setPreferences(buildPayload(version, appearance, next));
  },

  resetShortcut: async (actionId) => {
    const { version, appearance, shortcuts } = get();
    const next = { ...shortcuts };
    delete next[actionId];
    set({ shortcuts: next });
    await api.setPreferences(buildPayload(version, appearance, next));
  },

  resetAllShortcuts: async () => {
    const { version, appearance } = get();
    set({ shortcuts: {} });
    await api.setPreferences(buildPayload(version, appearance, {}));
  },
}));
