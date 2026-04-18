import { useMemo } from 'react';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import {
  FolderPlus,
  History,
  Skull,
  RotateCw,
  Trash2,
  PanelLeft,
  Keyboard,
  Settings,
  Terminal as TerminalIcon,
  Layers,
} from 'lucide-react';
import { useUi } from '@/store/ui';
import { useCapabilitiesStore } from '@/store/capabilities';
import { useSessions, deriveSessionList } from '@/store/sessions';
import { useRecents } from '@/store/recentCwds';
import { api } from '@/lib/ipc';
import { probeDims } from '@/lib/terminal';
import { cn, shortId } from '@/lib/utils';
import { useKeymap } from '@/store/keymap';
import { formatChord, type ActionId } from '@/lib/keymap';

interface CommandPaletteProps {
  onNewSession: () => void;
  onReopenCwd: (cwd: string) => void;
  onShowShortcuts: () => void;
  onShowSettings: () => void;
}

export function CommandPalette({
  onNewSession,
  onReopenCwd,
  onShowShortcuts,
  onShowSettings,
}: CommandPaletteProps) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const order = useSessions((s) => s.order);
  const byId = useSessions((s) => s.byId);
  const sessions = useMemo(() => deriveSessionList(order, byId), [order, byId]);
  const setActive = useSessions((s) => s.setActive);
  const recents = useRecents((s) => s.entries);
  const chords = useKeymap((s) => s.chords);
  const hint = (id: ActionId) => {
    const c = chords[id];
    return c ? formatChord(c) : undefined;
  };

  const close = () => setOpen(false);
  const run = (fn: () => void | Promise<void>) => {
    close();
    void fn();
  };

  // Filter recents to those not already open as sessions
  const openCwds = new Set(sessions.map((s) => s.cwd));
  const visibleRecents = recents.filter((r) => !openCwds.has(r.cwd));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out',
          )}
        />
        <Dialog.Content
          data-region="overlay"
          className={cn(
            'fixed left-1/2 top-[20%] z-50 w-[min(560px,90vw)] -translate-x-1/2',
            'overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)]',
            'shadow-[var(--shadow-elevated)]',
          )}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search sessions and run actions. Navigate with arrow keys, Enter to select, Escape to close.
          </Dialog.Description>
          <Command className="flex flex-col">
            <Command.Input
              placeholder="Type a command, session name, or recent path…"
              className={cn(
                'w-full border-b border-[var(--color-border)] bg-transparent px-4 py-3 text-sm',
                'text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] outline-none',
              )}
            />
            <Command.List className="max-h-[420px] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-fg-subtle)]">
                No results
              </Command.Empty>

              <Command.Group
                heading="Actions"
                className="px-1 py-1 text-[10.5px] uppercase tracking-wider text-[var(--color-fg-subtle)]"
              >
                <PaletteItem
                  icon={<FolderPlus size={14} />}
                  label="New session"
                  hint={hint('new-session')}
                  onSelect={() => run(onNewSession)}
                />
                <PaletteItem
                  icon={<PanelLeft size={14} />}
                  label="Toggle sidebar"
                  hint={hint('toggle-sidebar')}
                  onSelect={() => run(toggleSidebar)}
                />
                <PaletteItem
                  icon={<Keyboard size={14} />}
                  label="Keyboard shortcuts"
                  hint={hint('shortcuts-cheatsheet')}
                  onSelect={() => run(onShowShortcuts)}
                />
                <PaletteItem
                  icon={<Settings size={14} />}
                  label="Settings"
                  hint={hint('settings')}
                  onSelect={() => run(onShowSettings)}
                />
                <PaletteItem
                  icon={<Layers size={14} />}
                  label="Browse capabilities"
                  hint={hint('browse-capabilities')}
                  onSelect={() => run(() => useCapabilitiesStore.getState().openSheet())}
                />
                <PaletteItem
                  icon={<Skull size={14} />}
                  label="Kill all running sessions"
                  onSelect={() => run(async () => {
                    await api.killAll();
                  })}
                />
                <PaletteItem
                  icon={<RotateCw size={14} />}
                  label="Restart all exited sessions"
                  onSelect={() => run(async () => {
                    const { cols, rows } = probeDims();
                    await api.restartAllExited(cols, rows);
                  })}
                />
                <PaletteItem
                  icon={<Trash2 size={14} />}
                  label="Forget all exited sessions"
                  onSelect={() => run(async () => {
                    await api.forgetAllExited();
                  })}
                />
              </Command.Group>

              {sessions.length > 0 && (
                <Command.Group
                  heading="Jump to"
                  className="mt-1 px-1 py-1 text-[10.5px] uppercase tracking-wider text-[var(--color-fg-subtle)]"
                >
                  {sessions.map((s, i) => (
                    <PaletteItem
                      key={s.id}
                      icon={<TerminalIcon size={14} />}
                      label={s.name || `session-${shortId(s.id)}`}
                      hint={i < 9 ? hint(`jump-tab-${i + 1}` as ActionId) : undefined}
                      description={s.cwd}
                      onSelect={() => run(() => setActive(s.id))}
                    />
                  ))}
                </Command.Group>
              )}

              {visibleRecents.length > 0 && (
                <Command.Group
                  heading="Recent workspaces"
                  className="mt-1 px-1 py-1 text-[10.5px] uppercase tracking-wider text-[var(--color-fg-subtle)]"
                >
                  {visibleRecents.map((r) => (
                    <PaletteItem
                      key={r.cwd}
                      icon={<History size={14} />}
                      label={shortenPath(r.cwd)}
                      description={r.cwd}
                      onSelect={() => run(() => onReopenCwd(r.cwd))}
                    />
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-fg-subtle)]">
              <span className="font-mono">↑↓ navigate · ↵ select · esc close</span>
              <span>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function shortenPath(p: string): string {
  // Display the tail of the path — last 2 segments for workspace recognition
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

function PaletteItem({
  icon,
  label,
  hint,
  description,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  description?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--color-fg)]',
        'data-[selected=true]:bg-[var(--color-accent-subtle)] data-[selected=true]:text-[var(--color-accent)]',
      )}
    >
      <span className="text-[var(--color-fg-muted)]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {description && (
        <span className="truncate font-mono text-[11px] text-[var(--color-fg-muted)]">
          {description}
        </span>
      )}
      {hint && (
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
          {hint}
        </kbd>
      )}
    </Command.Item>
  );
}
