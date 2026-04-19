import { useEffect, useMemo, useRef, useState } from 'react';
import { File, Folder, Search } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/ipc';
import { useTree } from '@/store/tree';
import { cn } from '@/lib/utils';
import { FilePreviewDialog } from './FilePreviewDialog';
import type { SessionId, TreeEntry } from '@/lib/bindings';

interface FileTreeProps {
  sessionId: SessionId;
}

export function FileTree({ sessionId }: FileTreeProps) {
  const bucket = useTree((s) => s.bySession[sessionId]);
  const setEntries = useTree((s) => s.setEntries);
  const setQuery = useTree((s) => s.setQuery);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const entries = bucket?.entries ?? [];
  const query = bucket?.query ?? '';

  useEffect(() => {
    setSelectedPath(null);
  }, [sessionId]);

  useEffect(() => {
    // `cancelled` guards the setState after the IPC resolves. If the user
    // switches tabs mid-flight (or unmounts), we discard the stale tree
    // list instead of overwriting the next session's entries. The Tauri
    // IPC itself doesn't support cancellation, but the wasted decode is
    // a few KB at most — the important thing is we don't flash the wrong
    // tree into the UI.
    let cancelled = false;
    api
      .listTree(sessionId, '')
      .then((list) => {
        if (!cancelled) setEntries(sessionId, list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, setEntries]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    return fuzzyMatch(entries, query);
  }, [entries, query]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-1 pb-2">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(sessionId, e.target.value)}
            placeholder="Filter files…"
            className={cn(
              'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]',
              'py-1 pl-7 pr-2 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]',
              'outline-none focus:border-[var(--color-accent)]/50',
            )}
          />
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto px-1 pb-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-[var(--color-fg-subtle)]">
            {query.trim() ? 'No matches' : 'Empty'}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const entry = filtered[v.index];
              return (
                <div
                  key={entry.path}
                  className="absolute left-0 right-0"
                  style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                >
                  <TreeRow
                    entry={entry}
                    onOpen={() => setSelectedPath(entry.path)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FilePreviewDialog
        sessionId={sessionId}
        relPath={selectedPath}
        onClose={() => setSelectedPath(null)}
      />
    </div>
  );
}

function TreeRow({ entry, onOpen }: { entry: TreeEntry; onOpen: () => void }) {
  const isFile = entry.kind === 'file';
  return (
    <div
      role={isFile ? 'button' : undefined}
      tabIndex={isFile ? 0 : undefined}
      onClick={isFile ? onOpen : undefined}
      onKeyDown={
        isFile
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={cn(
        'flex h-[22px] items-center gap-1.5 rounded px-2 font-mono text-[11.5px] leading-none',
        'text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]',
        isFile
          ? 'cursor-pointer focus:bg-white/5 focus:text-[var(--color-fg)] focus:outline-none'
          : 'cursor-default',
      )}
      title={entry.path}
    >
      {entry.kind === 'dir' ? (
        <Folder size={11} className="shrink-0 text-[var(--color-state-running)]" />
      ) : (
        <File size={11} className="shrink-0 text-[var(--color-fg-subtle)]" />
      )}
      <span className="truncate">{entry.path}</span>
    </div>
  );
}

function fuzzyMatch(entries: TreeEntry[], query: string): TreeEntry[] {
  const q = query.toLowerCase();
  const needles = q.split(/\s+/).filter(Boolean);
  if (needles.length === 0) return entries;
  const matches: { entry: TreeEntry; score: number }[] = [];
  for (const entry of entries) {
    const hay = entry.path.toLowerCase();
    let ok = true;
    let score = 0;
    for (const n of needles) {
      const idx = hay.indexOf(n);
      if (idx < 0) {
        ok = false;
        break;
      }
      score += n.length - idx * 0.01;
    }
    if (ok) matches.push({ entry, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.map((m) => m.entry);
}
