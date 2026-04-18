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

// Each state combines color (primary signal) with a non-color property so
// users with color-vision deficiencies still have a distinguishing cue:
//   starting / running → solid fill
//   idle               → hollow (border-only)
//   working            → pulse + glow
//   awaiting_user      → pulse + glow + white ring
//   awaiting_permission→ pulse + glow + inset white ring
//   exited             → hollow + dimmed
const DOT_CLASS: Record<SessionState, string> = {
  starting: 'bg-[var(--color-state-running)]',
  running: 'bg-[var(--color-state-running)]',
  idle: 'border border-[var(--color-state-idle)] bg-transparent',
  working: 'bg-[var(--color-state-working)] animate-pulse shadow-[0_0_8px_var(--color-state-working)]',
  awaiting_user:
    'bg-[var(--color-state-awaiting-user)] ring-1 ring-white/80 animate-pulse shadow-[0_0_10px_var(--color-state-awaiting-user)]',
  awaiting_permission:
    'bg-[var(--color-state-awaiting-permission)] ring-1 ring-white/80 ring-inset animate-pulse shadow-[0_0_10px_var(--color-state-awaiting-permission)]',
  exited: 'border border-[var(--color-state-exited)] bg-transparent opacity-60',
};

/** Attention states get a larger dot so they're unmissable in peripheral vision. */
const SIZE_CLASS: Record<SessionState, string> = {
  starting: 'h-1.5 w-1.5',
  running: 'h-1.5 w-1.5',
  idle: 'h-1.5 w-1.5',
  working: 'h-2 w-2',
  awaiting_user: 'h-2 w-2',
  awaiting_permission: 'h-2 w-2',
  exited: 'h-1.5 w-1.5',
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
      <span className={cn('rounded-full transition-all', SIZE_CLASS[state], DOT_CLASS[state])} />
      {showLabel && <span className="font-medium">{LABEL[state]}</span>}
    </span>
  );
}

export function StateDot({ state, className }: { state: SessionState; className?: string }) {
  return (
    <span
      role="img"
      aria-label={LABEL[state]}
      title={LABEL[state]}
      className={cn(
        'inline-block rounded-full transition-all',
        SIZE_CLASS[state],
        DOT_CLASS[state],
        className,
      )}
    />
  );
}
