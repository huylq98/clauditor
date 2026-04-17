import { create } from 'zustand';
import type { SessionDesc, SessionId, SessionState } from '@/lib/bindings';

export interface SessionEntry extends SessionDesc {
  hydrated: boolean;
}

interface SessionsStore {
  byId: Record<SessionId, SessionEntry>;
  order: SessionId[];
  activeId: SessionId | null;

  upsert: (s: SessionDesc) => void;
  remove: (id: SessionId) => void;
  setState: (id: SessionId, state: SessionState) => void;
  setActive: (id: SessionId | null) => void;
  rename: (id: SessionId, name: string) => void;
  markHydrated: (id: SessionId) => void;
  reorder: (order: SessionId[]) => void;
}

export const useSessions = create<SessionsStore>((set) => ({
  byId: {},
  order: [],
  activeId: null,

  upsert: (s) =>
    set((state) => {
      const exists = state.byId[s.id];
      const byId = {
        ...state.byId,
        [s.id]: { ...(exists ?? { hydrated: false }), ...s },
      };
      const order = exists ? state.order : [...state.order, s.id];
      return { byId, order };
    }),

  remove: (id) =>
    set((state) => {
      if (!state.byId[id]) return state;
      const byId = { ...state.byId };
      delete byId[id];
      const order = state.order.filter((x) => x !== id);
      const activeId =
        state.activeId === id ? (order[0] ?? null) : state.activeId;
      return { byId, order, activeId };
    }),

  setState: (id, nextState) =>
    set((state) => {
      const cur = state.byId[id];
      if (!cur || cur.state === nextState) return state;
      return { byId: { ...state.byId, [id]: { ...cur, state: nextState } } };
    }),

  setActive: (id) => set({ activeId: id }),

  rename: (id, name) =>
    set((state) => {
      const cur = state.byId[id];
      if (!cur || cur.name === name) return state;
      return { byId: { ...state.byId, [id]: { ...cur, name } } };
    }),

  markHydrated: (id) =>
    set((state) => {
      const cur = state.byId[id];
      if (!cur || cur.hydrated) return state;
      return { byId: { ...state.byId, [id]: { ...cur, hydrated: true } } };
    }),

  reorder: (order) => set({ order }),
}));

/* Derivations — computed OUTSIDE zustand selectors to avoid infinite loops.
   Pass `order` + `byId` via primitive selectors, then derive via useMemo in components. */
export function deriveSessionList(
  order: SessionId[],
  byId: Record<SessionId, SessionEntry>,
): SessionEntry[] {
  const out: SessionEntry[] = [];
  for (const id of order) {
    const s = byId[id];
    if (s) out.push(s);
  }
  return out;
}

export function deriveStateCounts(
  order: SessionId[],
  byId: Record<SessionId, SessionEntry>,
): Record<SessionState, number> {
  const counts: Record<string, number> = {};
  for (const id of order) {
    const st = byId[id]?.state;
    if (st) counts[st] = (counts[st] ?? 0) + 1;
  }
  return counts as Record<SessionState, number>;
}

export function deriveActiveSession(
  activeId: SessionId | null,
  byId: Record<SessionId, SessionEntry>,
): SessionEntry | null {
  return activeId ? (byId[activeId] ?? null) : null;
}
