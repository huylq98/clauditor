import * as Dialog from '@radix-ui/react-dialog';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTION_CATALOG, formatChord, type ActionId } from '@/lib/keymap';
import { useKeymap } from '@/store/keymap';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const chords = useKeymap((s) => s.chords);
  const groups = groupCatalog();

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
          data-region="overlay"
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
          <Dialog.Description className="sr-only">All keyboard shortcuts in Clauditor.</Dialog.Description>
          <div className="mt-4 grid grid-cols-1 gap-5">
            {groups.map((g) => (
              <div key={g.heading}>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  {g.heading}
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((item) => {
                    const chord = chords[item.id];
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-sm text-[var(--color-fg-muted)]"
                      >
                        <span>{item.label}</span>
                        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg)]">
                          {chord ? formatChord(chord) : 'Unbound'}
                        </kbd>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function groupCatalog(): Array<{ heading: string; items: { id: ActionId; label: string }[] }> {
  const by: Record<string, { id: ActionId; label: string }[]> = {};
  for (const a of ACTION_CATALOG) {
    (by[a.group] ||= []).push({ id: a.id, label: a.label });
  }
  return Object.entries(by).map(([heading, items]) => ({ heading, items }));
}
