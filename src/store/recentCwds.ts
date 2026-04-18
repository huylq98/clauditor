import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_RECENT = 10;

interface RecentEntry {
  cwd: string;
  ts: number;
}

interface RecentsStore {
  entries: RecentEntry[];
  push: (cwd: string) => void;
  clear: () => void;
}

export const useRecents = create<RecentsStore>()(
  persist(
    (set) => ({
      entries: [],
      push: (cwd) =>
        set((s) => {
          const filtered = s.entries.filter((e) => e.cwd !== cwd);
          const next = [{ cwd, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT);
          return { entries: next };
        }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'clauditor-recents',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
