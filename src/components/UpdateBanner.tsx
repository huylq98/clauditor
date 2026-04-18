import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdater } from '@/store/updater';

export function UpdateBanner() {
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.version);
  const downloaded = useUpdater((s) => s.downloaded);
  const total = useUpdater((s) => s.total);
  const error = useUpdater((s) => s.error);
  const dismissed = useUpdater((s) => s.dismissed);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);
  const check = useUpdater((s) => s.check);

  const visible =
    !dismissed &&
    (status === 'available' ||
      status === 'downloading' ||
      status === 'ready' ||
      status === 'error');

  const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="update-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn(
            'overflow-hidden border-b border-[var(--color-border)]',
            'bg-[var(--color-accent-subtle)]',
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-[var(--color-fg)]">
            {status === 'available' && (
              <>
                <span className="flex-1">
                  Clauditor <span className="font-semibold">{version}</span> is available.
                </span>
                <button
                  onClick={() => void install()}
                  className={cn(
                    'rounded-md bg-[var(--color-accent)] px-3 py-1 font-medium text-black',
                    'transition-colors hover:bg-[var(--color-accent-hover)]',
                  )}
                >
                  Install
                </button>
                <button
                  onClick={dismiss}
                  aria-label="Dismiss update notification"
                  className="rounded p-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                >
                  <X size={14} />
                </button>
              </>
            )}

            {status === 'downloading' && (
              <>
                <span className="text-[var(--color-fg-muted)]">Downloading update… {pct}%</span>
                <div className="h-1 flex-1 overflow-hidden rounded bg-[var(--color-border)]">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            )}

            {status === 'ready' && (
              <>
                <span className="flex-1">Update installed — restart to apply.</span>
                <button
                  onClick={() => void install()}
                  className={cn(
                    'rounded-md bg-[var(--color-accent)] px-3 py-1 font-medium text-black',
                    'transition-colors hover:bg-[var(--color-accent-hover)]',
                  )}
                >
                  Restart now
                </button>
              </>
            )}

            {status === 'error' && (
              <>
                <span className="flex-1 text-[var(--color-warn)]">
                  Update failed: {error ?? 'unknown error'}
                </span>
                <button
                  onClick={() => void check({ manual: true })}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 hover:bg-[var(--color-surface)]"
                >
                  Retry
                </button>
                <button
                  onClick={dismiss}
                  aria-label="Dismiss update notification"
                  className="rounded p-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
