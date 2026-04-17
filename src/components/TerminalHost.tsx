import { useEffect, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { api, on } from '@/lib/ipc';
import { createTerminal, tryEnableWebgl } from '@/lib/terminal';
import { useSessions } from '@/store/sessions';
import { cn } from '@/lib/utils';
import type { SessionId } from '@/lib/bindings';

interface TerminalHostProps {
  sessionId: SessionId;
  active: boolean;
}

/**
 * One <TerminalHost> per session stays mounted for life. Visibility toggles
 * via `active`. Xterm's own buffer/scrollback is preserved when hidden, so
 * there's no rehydration cost on tab switch.
 */
export function TerminalHost({ sessionId, active }: TerminalHostProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pendingRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);
  const markHydrated = useSessions((s) => s.markHydrated);

  /* Set up terminal once */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const { term, fit, dispose } = createTerminal();
    termRef.current = term;
    fitRef.current = fit;
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
      // Hydrate backlog first
      const buf = await api.getBuffer(sessionId).catch(() => '');
      if (buf) term.write(buf);
      markHydrated(sessionId);

      // Then subscribe to live data for this session only
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
          termRef.current?.focus();
        } catch {
          /* noop */
        }
      });
    };
    doFit();
    window.addEventListener('resize', doFit);
    return () => window.removeEventListener('resize', doFit);
  }, [active]);

  return (
    <div
      ref={mountRef}
      className={cn(
        'absolute inset-0 h-full w-full',
        active ? 'visible' : 'invisible',
      )}
    />
  );
}
