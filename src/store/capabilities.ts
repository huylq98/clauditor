import { create } from 'zustand';
import type { Capability, CapabilityKind, CapabilitiesSnapshot } from '@/lib/bindings';
import { api } from '@/lib/ipc';

interface State {
  open: boolean;
  snapshot: CapabilitiesSnapshot | null;
  loading: boolean;
  error: string | null;
  query: string;
  kindFilter: Set<CapabilityKind>;
  openSheet: () => Promise<void>;
  closeSheet: () => void;
  setQuery: (q: string) => void;
  toggleKind: (k: CapabilityKind) => void;
  filtered: () => Capability[];
  warningsCount: () => number;
}

const ALL_KINDS: CapabilityKind[] = ['skill', 'subagent', 'mcpserver', 'slashcommand'];

export const useCapabilitiesStore = create<State>((set, get) => ({
  open: false,
  snapshot: null,
  loading: false,
  error: null,
  query: '',
  kindFilter: new Set(ALL_KINDS),

  openSheet: async () => {
    set({ open: true, loading: true, error: null });
    try {
      const snap = await api.listCapabilities();
      set({ snapshot: snap, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  closeSheet: () => set({ open: false }),

  setQuery: (query) => set({ query }),

  toggleKind: (k) =>
    set((s) => {
      const next = new Set(s.kindFilter);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { kindFilter: next };
    }),

  filtered: () => {
    const { snapshot, query, kindFilter } = get();
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    return snapshot.items.filter((c) => {
      if (!kindFilter.has(c.kind)) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.description} ${c.whenToUse ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  },

  warningsCount: () => get().snapshot?.parseWarnings.length ?? 0,
}));
