import { useCallback, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TitleBar } from '@/components/TitleBar';
import { TabBar } from '@/components/TabBar';
import { Sidebar } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { TerminalHost } from '@/components/TerminalHost';
import { EmptyState } from '@/components/EmptyState';
import { CommandPalette } from '@/components/CommandPalette';
import { api, on } from '@/lib/ipc';
import { probeDims } from '@/lib/terminal';
import { useSessions, deriveSessionList } from '@/store/sessions';
import { useTree } from '@/store/tree';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function App() {
  const order = useSessions((s) => s.order);
  const byId = useSessions((s) => s.byId);
  const sessions = useMemo(() => deriveSessionList(order, byId), [order, byId]);
  const activeId = useSessions((s) => s.activeId);
  const upsert = useSessions((s) => s.upsert);
  const remove = useSessions((s) => s.remove);
  const setState = useSessions((s) => s.setState);
  const rename = useSessions((s) => s.rename);
  const setActive = useSessions((s) => s.setActive);

  const applyTreeEvent = useTree((s) => s.applyTreeEvent);
  const mergeActivity = useTree((s) => s.mergeActivity);
  const dropTree = useTree((s) => s.drop);

  const newSession = useCallback(async () => {
    const { cols, rows } = probeDims(document.body);
    const s = await api.createSession({ cols, rows }).catch((e) => {
      toast.error('Failed to start session', { description: String(e) });
      return null;
    });
    if (s) {
      upsert(s);
      setActive(s.id);
    }
  }, [upsert, setActive]);

  const closeSession = useCallback(
    async (id: string) => {
      const s = useSessions.getState().byId[id];
      if (!s) return;
      if (s.state !== 'exited') {
        if (!window.confirm(`Kill session "${s.name}"?`)) return;
        await api.killSession(id);
        return;
      }
      await api.forgetSession(id);
      remove(id);
      dropTree(id);
    },
    [remove, dropTree],
  );

  const closeActive = useCallback(() => {
    if (activeId) void closeSession(activeId);
  }, [activeId, closeSession]);

  /* Bootstrap: load existing sessions + subscribe to backend events. */
  useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    (async () => {
      const existing = await api.listSessions().catch(() => []);
      if (cancelled) return;
      for (const s of existing) upsert(s);
      if (existing[0] && !useSessions.getState().activeId) setActive(existing[0].id);

      unsubs.push(
        await on.sessionCreated((s) => {
          upsert(s);
          if (!useSessions.getState().activeId) setActive(s.id);
        }),
        await on.sessionState(({ id, state }) => {
          setState(id, state);
          if (state === 'awaiting_user' || state === 'awaiting_permission') {
            const entry = useSessions.getState().byId[id];
            toast(entry?.name ?? 'Session', {
              description:
                state === 'awaiting_user' ? 'Waiting for input' : 'Permission required',
            });
          }
        }),
        await on.sessionExit(({ id }) => setState(id, 'exited')),
        await on.sessionRenamed((s) => rename(s.id, s.name)),
        await on.sessionFocus(({ id }) => setActive(id)),
        await on.sessionForgotten(({ id }) => {
          remove(id);
          dropTree(id);
        }),
        await on.treeEvent((ev) => applyTreeEvent(ev)),
        await on.activityDelta(({ sid, delta }) => mergeActivity(sid, delta)),
        await on.newSessionRequest(() => void newSession()),
      );
    })();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeyboardShortcuts({ onNewSession: newSession, onCloseActive: closeActive });

  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-screen flex-col">
        <TitleBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="relative flex flex-1 min-w-0 flex-col">
            <TabBar
              onNewSession={newSession}
              onSelect={setActive}
              onClose={closeSession}
            />
            <div className="relative flex-1 min-h-0 bg-[var(--color-bg)]">
              {sessions.length === 0 ? (
                <EmptyState onNewSession={newSession} />
              ) : (
                sessions.map((s) => (
                  <TerminalHost key={s.id} sessionId={s.id} active={s.id === activeId} />
                ))
              )}
            </div>
            <StatusBar />
          </main>
        </div>
        <CommandPalette onNewSession={newSession} />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            className: 'font-sans text-xs',
            style: {
              background: 'var(--color-panel)',
              color: 'var(--color-fg)',
              border: '1px solid var(--color-border)',
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
