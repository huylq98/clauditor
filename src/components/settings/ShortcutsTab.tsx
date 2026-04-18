import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { usePreferences } from '@/store/preferences';
import { useKeymap } from '@/store/keymap';
import {
  ACTION_CATALOG,
  DEFAULT_KEYMAP,
  findConflict,
  formatChord,
  type ActionId,
  type Chord,
} from '@/lib/keymap';
import { ChordCapture } from '@/components/settings/ChordCapture';
import { cn } from '@/lib/utils';

export function ShortcutsTab() {
  const shortcuts = usePreferences((s) => s.shortcuts);
  const chords = useKeymap((s) => s.chords);
  const setShortcut = usePreferences((s) => s.setShortcut);
  const batchSetShortcuts = usePreferences((s) => s.batchSetShortcuts);
  const resetShortcut = usePreferences((s) => s.resetShortcut);
  const resetAllShortcuts = usePreferences((s) => s.resetAllShortcuts);

  const [filter, setFilter] = useState('');
  const [capturingId, setCapturingId] = useState<ActionId | null>(null);
  const [pending, setPending] = useState<{ actionId: ActionId; chord: Chord; conflictId: ActionId | null } | null>(null);

  const groups = useMemo(() => {
    const by: Record<string, typeof ACTION_CATALOG> = {};
    for (const a of ACTION_CATALOG) {
      if (filter && !a.label.toLowerCase().includes(filter.toLowerCase())) continue;
      (by[a.group] ||= []).push(a);
    }
    return Object.entries(by);
  }, [filter]);

  const handleCapture = (actionId: ActionId, chord: Chord) => {
    const formatted = formatChord(chord);
    const effective: Record<string, string> = {};
    for (const id of Object.keys(DEFAULT_KEYMAP) as ActionId[]) {
      const s = shortcuts[id];
      if (s === undefined) effective[id] = DEFAULT_KEYMAP[id];
      else if (s !== null) effective[id] = s;
    }
    const conflictId = findConflict(formatted, actionId, effective);
    if (conflictId) {
      setPending({ actionId, chord, conflictId });
      setCapturingId(null);
      return;
    }
    void setShortcut(actionId, formatted);
    setCapturingId(null);
  };

  const confirmSwap = async () => {
    if (!pending) return;
    await batchSetShortcuts({
      [pending.actionId]: formatChord(pending.chord),
      [pending.conflictId!]: null,
    });
    setPending(null);
  };

  return (
    <div className="flex h-full flex-col">
      <input
        type="text"
        placeholder="Filter shortcuts…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className={cn(
          'mb-4 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]',
          'px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] outline-none',
          'focus:border-[var(--color-accent)]',
        )}
      />

      <div className="flex-1 overflow-y-auto pr-1">
        {groups.map(([heading, actions]) => (
          <div key={heading} className="mb-4">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {heading}
            </div>
            <div className="flex flex-col">
              {actions.map((a) => {
                const chord = chords[a.id];
                const isCapturing = capturingId === a.id;
                const isPendingHere = pending?.actionId === a.id;
                const isConflictHere = pending?.conflictId === a.id;

                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-2 text-[13px] text-[var(--color-fg)]',
                      (isPendingHere || isConflictHere) && 'bg-[var(--color-accent-subtle)]',
                    )}
                  >
                    <div className="flex flex-1 flex-col">
                      <span>{a.label}</span>
                      {isPendingHere && (
                        <span className="text-[11px] text-[var(--color-warn)]">
                          Will replace &lsquo;{ACTION_CATALOG.find((x) => x.id === pending!.conflictId)?.label}&rsquo;
                        </span>
                      )}
                      {isConflictHere && (
                        <span className="text-[11px] text-[var(--color-danger)]">Will become unbound</span>
                      )}
                    </div>

                    {isCapturing ? (
                      <ChordCapture
                        initial={chord}
                        onCapture={(c) => c && handleCapture(a.id, c)}
                        onCancel={() => setCapturingId(null)}
                      />
                    ) : isPendingHere ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmSwap()}
                          className="rounded bg-[var(--color-warn)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-bg)]"
                        >
                          Swap
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending(null)}
                          className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-fg-muted)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCapturingId(a.id)}
                          className={cn(
                            'rounded border px-2 py-0.5 font-mono text-[11px]',
                            chord
                              ? 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)]'
                              : 'border-[var(--color-danger)] bg-[var(--color-bg)] text-[var(--color-danger)]',
                          )}
                        >
                          {chord ? formatChord(chord) : 'Unbound'}
                        </button>
                        {shortcuts[a.id] !== undefined && (
                          <button
                            type="button"
                            onClick={() => void resetShortcut(a.id)}
                            title="Reset to default"
                            className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all shortcuts to defaults?')) void resetAllShortcuts();
          }}
          className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}
