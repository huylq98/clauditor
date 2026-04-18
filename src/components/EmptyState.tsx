import { Terminal } from 'lucide-react';
import { cn, modKey as mod } from '@/lib/utils';

interface EmptyStateProps {
  onNewSession: () => void;
}

export function EmptyState({ onNewSession }: EmptyStateProps) {

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-[var(--color-bg)] p-8 text-center">
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl',
          'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
        )}
      >
        <Terminal size={28} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
          No active session
        </h2>
        <p className="max-w-sm text-sm text-[var(--color-fg-muted)]">
          Start a Claude Code session in any directory. Open the command palette with{' '}
          <kbd className="mx-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px]">
            {mod}+K
          </kbd>{' '}
          or press{' '}
          <kbd className="mx-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px]">
            {mod}+T
          </kbd>{' '}
          for a new session.
        </p>
      </div>
      <button
        onClick={onNewSession}
        className={cn(
          'rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black',
          'transition-colors hover:bg-[var(--color-accent-hover)]',
          'outline-none ring-2 ring-transparent focus-visible:ring-[var(--color-accent)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        )}
      >
        New session
      </button>
    </div>
  );
}
