import { useMemo } from 'react';
import { useSessions, deriveActiveSession, deriveStateCounts } from '@/store/sessions';
import { StateBadge } from '@/components/ui/state-badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/ipc';
import { probeDims } from '@/lib/terminal';

interface StatusBarProps {
  onRequestKill: (id: string) => void;
}

export function StatusBar({ onRequestKill }: StatusBarProps) {
  const order = useSessions((s) => s.order);
  const byId = useSessions((s) => s.byId);
  const activeId = useSessions((s) => s.activeId);
  const active = useMemo(() => deriveActiveSession(activeId, byId), [activeId, byId]);
  const counts = useMemo(() => deriveStateCounts(order, byId), [order, byId]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const onKillOrRestart = async () => {
    if (!active) return;
    if (active.state === 'exited') {
      const { cols, rows } = probeDims(document.body);
      await api.restartSession(active.id, cols, rows);
    } else {
      onRequestKill(active.id);
    }
  };

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[11px] text-[var(--color-fg-muted)]">
      <div className="flex items-center gap-2">
        {active ? <StateBadge state={active.state} /> : <span>—</span>}
        {active && (
          <span
            className="truncate font-mono text-[10.5px] text-[var(--color-fg-subtle)]"
            title={active.cwd}
          >
            {active.cwd}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span>
          {total === 0
            ? 'No sessions'
            : Object.entries(counts)
                .map(([k, v]) => `${v} ${k}`)
                .join(' · ')}
        </span>
        {active && (
          <Button
            variant={active.state === 'exited' ? 'solid' : 'danger'}
            size="sm"
            onClick={onKillOrRestart}
          >
            {active.state === 'exited' ? 'Restart' : 'Kill'}
          </Button>
        )}
      </div>
    </footer>
  );
}
