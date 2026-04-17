import type { SessionState } from '@/lib/bindings';
import { cn } from '@/lib/utils';

const LABEL: Record<SessionState, string> = {
  starting: 'starting',
  running: 'running',
  idle: 'idle',
  working: 'working',
  awaiting_user: 'waiting',
  awaiting_permission: 'permission',
  exited: 'exited',
};

const DOT_CLASS: Record<SessionState, string> = {
  starting: 'bg-[var(--color-state-running)]',
  running: 'bg-[var(--color-state-running)]',
  idle: 'bg-[var(--color-state-idle)]',
  working: 'bg-[var(--color-state-working)] animate-pulse',
  awaiting_user: 'bg-[var(--color-state-awaiting-user)] animate-pulse',
  awaiting_permission: 'bg-[var(--color-state-awaiting-permission)] animate-pulse',
  exited: 'bg-[var(--color-state-exited)]',
};

interface StateBadgeProps {
  state: SessionState;
  showLabel?: boolean;
  className?: string;
}

export function StateBadge({ state, showLabel = true, className }: StateBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-none',
        'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[state])} />
      {showLabel && <span className="font-medium">{LABEL[state]}</span>}
    </span>
  );
}

export function StateDot({ state, className }: { state: SessionState; className?: string }) {
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_CLASS[state], className)} />;
}
