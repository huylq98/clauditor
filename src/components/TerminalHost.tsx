import { useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import { Search as SearchIcon, X, ChevronUp, ChevronDown } from 'lucide-react';
import { api, on } from '@/lib/ipc';
import { createTerminal, tryEnableWebgl } from '@/lib/terminal';
import { useSessions } from '@/store/sessions';
import { cn } from '@/lib/utils';
import type { SessionId } from '@/lib/bindings';

interface TerminalHostProps {
  sessionId: SessionId;
  active: boolean;
}

const SEARCH_OPTS = {
  decorations: {
    matchBackground: '#c98469',
    matchBorder: '#c98469',
    matchOverviewRuler: '#c98469',
    activeMatchBackground: '#d99a82',
    activeMatchBorder: '#d99a82',
    activeMatchColorOverviewRuler: '#d99a82',
  },
};

/**
 * One <TerminalHost> per session stays mounted for life. Visibility toggles
 * via `active`. Xterm's own buffer/scrollback is preserved when hidden, so
 * there's no rehydration cost on tab switch.
 */
export function TerminalHost({ sessionId, active }: TerminalHostProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const pendingRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);
  const markHydrated = useSessions((s) => s.markHydrated);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* Set up terminal once */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const { term, fit, search, dispose } = createTerminal();
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    term.open(mount);
    tryEnableWebgl(term);

    const onDataDisp = term.onData((data) => {
      void api.writeSession(sessionId, data);
    });
    const onResizeDisp = term.onResize(({ cols, rows }) => {
      void api.resizeSession(sessionId, cols, rows);
    });

    let unlistenData: (() => void) | null = null;

    const flush = () => {
      rafRef.current = 0;
      if (!pendingRef.current.length) return;
      const chunk =
        pendingRef.current.length === 1
          ? pendingRef.current[0]
          : pendingRef.current.join('');
      pendingRef.current.length = 0;
      term.write(chunk);
    };

    const queueWrite = (chunk: string) => {
      pendingRef.current.push(chunk);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    };

    (async () => {
      const buf = await api.getBuffer(sessionId).catch(() => '');
      if (buf) term.write(buf);
      markHydrated(sessionId);

      unlistenData = await on.sessionData((p) => {
        if (p.id !== sessionId) return;
        queueWrite(p.chunk);
      });
    })();

    return () => {
      onDataDisp.dispose();
      onResizeDisp.dispose();
      unlistenData?.();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      dispose();
    };
  }, [sessionId, markHydrated]);

  /* Fit + focus on activation and window resize */
  useEffect(() => {
    if (!active) return;
    const doFit = () => {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          if (!findOpen) termRef.current?.focus();
        } catch {
          /* noop */
        }
      });
    };
    doFit();
    window.addEventListener('resize', doFit);
    return () => window.removeEventListener('resize', doFit);
  }, [active, findOpen]);

  /* Ctrl/Cmd + F opens the search overlay when this terminal is active. */
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && findOpen) {
        setFindOpen(false);
        searchRef.current?.clearDecorations();
        termRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active, findOpen]);

  const runSearch = (q: string, dir: 'next' | 'prev' = 'next') => {
    if (!searchRef.current) return;
    if (!q) {
      searchRef.current.clearDecorations();
      return;
    }
    if (dir === 'next') searchRef.current.findNext(q, SEARCH_OPTS);
    else searchRef.current.findPrevious(q, SEARCH_OPTS);
  };

  return (
    <div
      className={cn(
        'absolute inset-0 h-full w-full',
        active ? 'visible' : 'invisible',
      )}
    >
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />
      {findOpen && active && (
        <div
          className={cn(
            'absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-md',
            'border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-2 py-1.5',
            'shadow-[var(--shadow-panel)]',
          )}
        >
          <SearchIcon size={12} className="text-[var(--color-fg-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value, 'next');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch(query, e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                setFindOpen(false);
                searchRef.current?.clearDecorations();
                termRef.current?.focus();
              }
            }}
            placeholder="Search scrollback…"
            className={cn(
              'w-52 bg-transparent text-xs text-[var(--color-fg)] outline-none',
              'placeholder:text-[var(--color-fg-subtle)]',
            )}
          />
          <button
            onClick={() => runSearch(query, 'prev')}
            aria-label="Previous match"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => runSearch(query, 'next')}
            aria-label="Next match"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => {
              setFindOpen(false);
              searchRef.current?.clearDecorations();
              termRef.current?.focus();
            }}
            aria-label="Close search"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
