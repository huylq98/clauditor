import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import type { FilePreview, SessionId } from '@/lib/bindings';

interface FilePreviewDialogProps {
  sessionId: SessionId;
  relPath: string | null;
  onClose: () => void;
}

type Loaded =
  | { path: string; kind: 'ready'; preview: FilePreview }
  | { path: string; kind: 'error' };

export function FilePreviewDialog({ sessionId, relPath, onClose }: FilePreviewDialogProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!relPath) return;
    let cancelled = false;
    api
      .readFile(sessionId, relPath)
      .then((p) => {
        if (cancelled) return;
        setLoaded(
          p
            ? { path: relPath, kind: 'ready', preview: p }
            : { path: relPath, kind: 'error' },
        );
      })
      .catch(() => {
        if (!cancelled) setLoaded({ path: relPath, kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, relPath]);

  const current = loaded && relPath && loaded.path === relPath ? loaded : null;

  return (
    <Dialog.Root open={relPath !== null} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        />
        <Dialog.Content
          data-region="overlay"
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(900px,92vw)] h-[min(640px,85vh)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)]',
            'shadow-[var(--shadow-elevated)]',
          )}
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
            <FileText size={14} className="shrink-0 text-[var(--color-accent)]" />
            <Dialog.Title className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-fg)]">
              {relPath ?? ''}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close preview"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded text-[var(--color-fg-muted)]',
                'hover:bg-white/5 hover:text-[var(--color-fg)]',
              )}
            >
              <X size={14} />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg)]">
            {!current && (
              <div className="p-6 text-[12px] text-[var(--color-fg-subtle)]">Loading…</div>
            )}

            {current?.kind === 'error' && (
              <div className="flex items-center gap-2 p-6 text-[12px] text-[var(--color-fg-muted)]">
                <AlertTriangle size={14} className="text-[var(--color-danger)]" />
                File could not be read.
              </div>
            )}

            {current?.kind === 'ready' && current.preview.binary && (
              <div className="flex items-center gap-2 p-6 text-[12px] text-[var(--color-fg-muted)]">
                <AlertTriangle size={14} className="text-[var(--color-state-working)]" />
                Binary file — preview not shown.
              </div>
            )}

            {current?.kind === 'ready' && !current.preview.binary && (
              <>
                {current.preview.truncated && (
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-[11px] text-[var(--color-fg-muted)]">
                    <AlertTriangle size={12} className="text-[var(--color-state-working)]" />
                    Truncated at 512 KB.
                  </div>
                )}
                <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre p-4 font-mono text-[12px] leading-[1.55] text-[var(--color-fg)]">
                  {current.preview.content}
                </pre>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
