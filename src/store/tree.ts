import { create } from 'zustand';
import type { ActivitySnapshot, SessionId, TreeEntry, TreeEvent } from '@/lib/bindings';

interface TreeBucket {
  entries: TreeEntry[]; // flat, sorted by path
  query: string;
  activity: ActivitySnapshot;
}

const emptyActivity = (): ActivitySnapshot => ({
  created: [],
  modified: [],
  deleted: [],
  tools: {},
});

interface TreeStore {
  bySession: Record<SessionId, TreeBucket>;

  setEntries: (sid: SessionId, entries: TreeEntry[]) => void;
  applyTreeEvent: (ev: TreeEvent) => void;
  setQuery: (sid: SessionId, q: string) => void;
  setActivity: (sid: SessionId, snap: ActivitySnapshot) => void;
  mergeActivity: (sid: SessionId, delta: Partial<ActivitySnapshot>) => void;
  reset: (sid: SessionId) => void;
  drop: (sid: SessionId) => void;
}

function ensureBucket(s: TreeStore, sid: SessionId): TreeBucket {
  return s.bySession[sid] ?? { entries: [], query: '', activity: emptyActivity() };
}

export const useTree = create<TreeStore>((set) => ({
  bySession: {},

  setEntries: (sid, entries) =>
    set((s) => ({
      bySession: { ...s.bySession, [sid]: { ...ensureBucket(s, sid), entries } },
    })),

  applyTreeEvent: (ev) =>
    set((s) => {
      const bucket = ensureBucket(s, ev.sid);
      const entries = [...bucket.entries];
      const idx = entries.findIndex((e) => e.path === ev.path);
      if (ev.type === 'unlink' || ev.type === 'unlinkDir') {
        if (idx >= 0) entries.splice(idx, 1);
      } else if (ev.type === 'add' || ev.type === 'addDir') {
        if (idx < 0) {
          entries.push({
            path: ev.path,
            kind: ev.type === 'addDir' ? 'dir' : 'file',
            size: null,
            mtime: Date.now(),
          });
          entries.sort((a, b) => a.path.localeCompare(b.path));
        }
      }
      return { bySession: { ...s.bySession, [ev.sid]: { ...bucket, entries } } };
    }),

  setQuery: (sid, q) =>
    set((s) => ({
      bySession: { ...s.bySession, [sid]: { ...ensureBucket(s, sid), query: q } },
    })),

  setActivity: (sid, snap) =>
    set((s) => ({
      bySession: { ...s.bySession, [sid]: { ...ensureBucket(s, sid), activity: snap } },
    })),

  mergeActivity: (sid, delta) =>
    set((s) => {
      const bucket = ensureBucket(s, sid);
      const a = bucket.activity;
      const merged: ActivitySnapshot = {
        created: delta.created ? [...a.created, ...delta.created] : a.created,
        modified: delta.modified ? [...a.modified, ...delta.modified] : a.modified,
        deleted: delta.deleted ? [...a.deleted, ...delta.deleted] : a.deleted,
        tools: delta.tools ? { ...a.tools, ...delta.tools } : a.tools,
      };
      return { bySession: { ...s.bySession, [sid]: { ...bucket, activity: merged } } };
    }),

  reset: (sid) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: { entries: [], query: '', activity: emptyActivity() },
      },
    })),

  drop: (sid) =>
    set((s) => {
      if (!s.bySession[sid]) return s;
      const next = { ...s.bySession };
      delete next[sid];
      return { bySession: next };
    }),
}));
