import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TitleBar } from '@/components/TitleBar';
import { TabBar } from '@/components/TabBar';
import { Sidebar } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { TerminalHost } from '@/components/TerminalHost';
import { EmptyState } from '@/components/EmptyState';
import { CommandPalette } from '@/components/CommandPalette';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { UpdateBanner } from '@/components/UpdateBanner';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { api, on } from '@/lib/ipc';
import { probeDims } from '@/lib/terminal';
import { useSessions, deriveSessionList } from '@/store/sessions';
import { useTree } from '@/store/tree';
import { useRecents } from '@/store/recentCwds';
import { useUpdater } from '@/store/updater';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { usePreferences } from '@/store/preferences';

type KillTarget = { id: string; name: string } | null;

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
  const pushRecent = useRecents((s) => s.push);
  const checkUpdate = useUpdater((s) => s.check);

  const hydrate = usePreferences((s) => s.hydrate);
  const theme = usePreferences((s) => s.appearance.theme);
  const uiScale = usePreferences((s) => s.appearance.uiScale);

  const [killTarget, setKillTarget] = useState<KillTarget>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const spawnForCwd = useCallback(
    async (cwd: string | null) => {
      const { cols, rows } = probeDims();
      const s = await api.createSession({ cwd, cols, rows }).catch((e) => {
        toast.error('Failed to start session', { description: String(e) });
        return null;
      });
      if (s) {
        upsert(s);
        setActive(s.id);
        pushRecent(s.cwd);
      }
    },
    [upsert, setActive, pushRecent],
  );

  const newSession = useCallback(() => spawnForCwd(null), [spawnForCwd]);
  const reopenCwd = useCallback((cwd: string) => spawnForCwd(cwd), [spawnForCwd]);

  const forgetWithUndo = useCallback(
    async (id: string) => {
      const snapshot = useSessions.getState().byId[id];
      if (!snapshot) return;
      await api.forgetSession(id);
      remove(id);
      dropTree(id);
      toast(`Forgot "${snapshot.name}"`, {
        description: snapshot.cwd,
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => void spawnForCwd(snapshot.cwd),
        },
      });
    },
    [remove, dropTree, spawnForCwd],
  );

  const requestClose = useCallback(
    (id: string) => {
      const s = useSessions.getState().byId[id];
      if (!s) return;
      if (s.state !== 'exited') {
        setKillTarget({ id, name: s.name });
        return;
      }
      void forgetWithUndo(id);
    },
    [forgetWithUndo],
  );

  const closeActive = useCallback(() => {
    if (activeId) requestClose(activeId);
  }, [activeId, requestClose]);

  const confirmKill = useCallback(async () => {
    if (!killTarget) return;
    const snapshot = useSessions.getState().byId[killTarget.id];
    await api.killSession(killTarget.id);
    setKillTarget(null);
    if (snapshot?.cwd) {
      toast(`Killed "${snapshot.name}"`, {
        description: snapshot.cwd,
        duration: 5000,
        action: {
          label: 'Restart',
          onClick: () => void spawnForCwd(snapshot.cwd),
        },
      });
    }
  }, [killTarget, spawnForCwd]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    (async () => {
      const existing = await api.listSessions().catch(() => []);
      if (cancelled) return;
      for (const s of existing) {
        upsert(s);
        if (s.cwd) pushRecent(s.cwd);
      }
      if (existing[0] && !useSessions.getState().activeId) setActive(existing[0].id);

      unsubs.push(
        await on.sessionCreated((s) => {
          upsert(s);
          if (s.cwd) pushRecent(s.cwd);
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
        await on.checkUpdatesRequest(() => void useUpdater.getState().check({ manual: true })),
      );
    })();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeyboardShortcuts({
    onNewSession: newSession,
    onCloseActive: closeActive,
    onShowShortcuts: () => setShortcutsOpen(true),
    onShowSettings: () => setSettingsOpen(true),
  });

  useEffect(() => {
    void checkUpdate();
  }, [checkUpdate]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    root.setAttribute('data-theme', resolvedTheme);
    root.style.setProperty('--ui-scale', String(uiScale));
  }, [theme, uiScale]);

  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-screen flex-col">
        <TitleBar />
        <UpdateBanner />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="relative flex flex-1 min-w-0 flex-col">
            <TabBar onNewSession={newSession} onSelect={setActive} onClose={requestClose} />
            <div
              data-terminal-stage
              className="relative flex-1 min-h-0 bg-[var(--color-bg)]"
            >
              {sessions.length === 0 ? (
                <EmptyState onNewSession={newSession} />
              ) : (
                sessions.map((s) => (
                  <TerminalHost key={s.id} sessionId={s.id} active={s.id === activeId} />
                ))
              )}
            </div>
            <StatusBar onRequestKill={requestClose} />
          </main>
        </div>
        <CommandPalette
          onNewSession={newSession}
          onReopenCwd={reopenCwd}
          onShowShortcuts={() => setShortcutsOpen(true)}
          onShowSettings={() => setSettingsOpen(true)}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <AlertDialog
          open={killTarget !== null}
          onOpenChange={(v) => !v && setKillTarget(null)}
          title={`Kill session "${killTarget?.name ?? ''}"?`}
          description="The Claude Code process will be terminated. The session will remain in the tab list until you forget it."
          confirmLabel="Kill session"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={confirmKill}
        />
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
