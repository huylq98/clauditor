import { useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Keyboard } from 'lucide-react';
import { cn, modKey as mod } from '@/lib/utils';

const GROUPS: { heading: string; items: { keys: string; label: string }[] }[] = [
  {
    heading: 'Sessions',
    items: [
      { keys: `${mod}+T`, label: 'New session' },
      { keys: `${mod}+W`, label: 'Close active session' },
      { keys: `${mod}+1 – ${mod}+9`, label: 'Jump to session 1–9' },
      { keys: `${mod}+Shift+]`, label: 'Next tab' },
      { keys: `${mod}+Shift+[`, label: 'Previous tab' },
      { keys: `Double-click tab`, label: 'Rename session' },
      { keys: `Drag tab`, label: 'Reorder sessions' },
    ],
  },
  {
    heading: 'Navigation',
    items: [
      { keys: `${mod}+K`, label: 'Command palette' },
      { keys: `${mod}+B`, label: 'Toggle sidebar' },
      { keys: `${mod}+/`, label: 'This cheat sheet' },
    ],
  },
  {
    heading: 'Terminal',
    items: [
      { keys: `${mod}+F`, label: 'Search terminal scrollback' },
      { keys: `Shift+Scroll`, label: 'Fast scroll' },
    ],
  },
];

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(520px,90vw)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)]',
            'p-5 shadow-[var(--shadow-elevated)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        >
          <div className="flex items-center gap-2 text-[var(--color-fg)]">
            <Keyboard size={16} className="text-[var(--color-accent)]" />
            <Dialog.Title className="text-base font-semibold">Keyboard shortcuts</Dialog.Title>
          </div>
          <Dialog.Description className="sr-only">
            All keyboard shortcuts in Clauditor.
          </Dialog.Description>
          <div className="mt-4 grid grid-cols-1 gap-5">
            {GROUPS.map((g) => (
              <div key={g.heading}>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  {g.heading}
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between text-sm text-[var(--color-fg-muted)]"
                    >
                      <span>{item.label}</span>
                      <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg)]">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
