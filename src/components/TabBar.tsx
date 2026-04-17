import { useRef, useEffect, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useSessions, deriveSessionList } from '@/store/sessions';
import { StateDot } from '@/components/ui/state-badge';
import { cn, shortId } from '@/lib/utils';

interface TabBarProps {
  onNewSession: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabBar({ onNewSession, onSelect, onClose }: TabBarProps) {
  const order = useSessions((s) => s.order);
  const byId = useSessions((s) => s.byId);
  const sessions = useMemo(() => deriveSessionList(order, byId), [order, byId]);
  const activeId = useSessions((s) => s.activeId);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId || !scrollerRef.current) return;
    const el = scrollerRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${activeId}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-stretch border-b border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <div
        ref={scrollerRef}
        className="flex flex-1 items-stretch overflow-x-auto scroll-smooth"
        data-no-drag
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            data-tab-id={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              'group relative flex h-full min-w-[140px] max-w-[220px] shrink-0 cursor-pointer',
              'items-center gap-2 border-r border-[var(--color-border)] px-3 text-sm',
              'transition-colors',
              s.id === activeId
                ? 'bg-[var(--color-surface)] text-[var(--color-fg)]'
                : 'text-[var(--color-fg-muted)] hover:bg-white/[0.03] hover:text-[var(--color-fg)]',
            )}
          >
            <StateDot state={s.state} />
            <span className="flex-1 truncate">
              {s.name || `session-${shortId(s.id)}`}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded',
                'opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100',
                s.id === activeId && 'opacity-100',
              )}
              aria-label={`Close ${s.name}`}
            >
              <X size={12} />
            </button>
            {s.id === activeId && (
              <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--color-accent)]" />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={onNewSession}
        className="flex h-full w-10 shrink-0 items-center justify-center text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"
        aria-label="New session (Ctrl+T)"
        data-no-drag
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
