import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSessions, deriveSessionList } from '@/store/sessions';
import { StateDot } from '@/components/ui/state-badge';
import { IconButton } from '@/components/ui/icon-button';
import { api } from '@/lib/ipc';
import { cn, shortId } from '@/lib/utils';
import type { SessionId } from '@/lib/bindings';

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
  const reorder = useSessions((s) => s.reorder);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<SessionId | null>(null);
  const [overId, setOverId] = useState<SessionId | null>(null);
  const [editingId, setEditingId] = useState<SessionId | null>(null);

  useEffect(() => {
    if (!activeId || !scrollerRef.current) return;
    const el = scrollerRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${activeId}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  const handleDrop = () => {
    if (!dragId || !overId || dragId === overId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(overId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    reorder(next);
    setDragId(null);
    setOverId(null);
  };

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
        {sessions.map((s) => {
          const isActive = s.id === activeId;
          const isOver = s.id === overId && dragId !== null && dragId !== s.id;
          return (
            <div
              key={s.id}
              data-tab-id={s.id}
              draggable={editingId !== s.id}
              title={s.cwd}
              onClick={() => onSelect(s.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingId(s.id);
              }}
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId && dragId !== s.id) setOverId(s.id);
              }}
              onDragLeave={() => {
                if (overId === s.id) setOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop();
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                'group relative flex h-full min-w-[140px] max-w-[220px] shrink-0 cursor-pointer',
                'items-center gap-2 border-r border-[var(--color-border)] px-3 text-sm',
                'transition-colors',
                isActive
                  ? 'bg-[var(--color-surface)] text-[var(--color-fg)]'
                  : 'text-[var(--color-fg-muted)] hover:bg-white/[0.03] hover:text-[var(--color-fg)]',
                dragId === s.id && 'opacity-50',
                isOver && 'border-l-2 border-l-[var(--color-accent)]',
              )}
            >
              <StateDot state={s.state} />
              {editingId === s.id ? (
                <TabNameInput
                  initialValue={s.name || `session-${shortId(s.id)}`}
                  onCommit={async (name) => {
                    setEditingId(null);
                    if (name.trim() && name !== s.name) {
                      await api.renameSession(s.id, name.trim());
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <span className="flex-1 truncate">{s.name || `session-${shortId(s.id)}`}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(s.id);
                }}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded',
                  'opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100',
                  isActive && 'opacity-100',
                )}
                aria-label={`Close ${s.name}`}
              >
                <X size={12} />
              </button>
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--color-accent)]" />
              )}
            </div>
          );
        })}
      </div>
      <IconButton label="New session" hint="Ctrl+T" size="lg" onClick={onNewSession} data-no-drag>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}

function TabNameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value);
        else if (e.key === 'Escape') onCancel();
      }}
      className={cn(
        'flex-1 rounded border border-[var(--color-accent)]/40 bg-[var(--color-bg)] px-1.5 py-0.5',
        'text-[13px] text-[var(--color-fg)] outline-none',
      )}
    />
  );
}
