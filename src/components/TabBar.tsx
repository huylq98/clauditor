import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSessions, deriveSessionList, type SessionEntry } from '@/store/sessions';
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

  const handleDrop = useCallback(() => {
    if (!dragId || !overId || dragId === overId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const current = useSessions.getState().order;
    const next = [...current];
    const from = next.indexOf(dragId);
    const to = next.indexOf(overId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    reorder(next);
    setDragId(null);
    setOverId(null);
  }, [dragId, overId, reorder]);

  // Stable callbacks so <Tab> memo isn't invalidated every render.
  const startEdit = useCallback((id: SessionId) => setEditingId(id), []);
  const stopEdit = useCallback(() => setEditingId(null), []);
  const setDragging = useCallback((id: SessionId | null) => setDragId(id), []);
  const setHoverOver = useCallback((id: SessionId | null) => setOverId(id), []);

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
        {sessions.map((s, i) => (
          <Tab
            key={s.id}
            session={s}
            index={i}
            isActive={s.id === activeId}
            isEditing={s.id === editingId}
            isDragging={s.id === dragId}
            isDropTarget={s.id === overId && dragId !== null && dragId !== s.id}
            onSelect={onSelect}
            onClose={onClose}
            onStartEdit={startEdit}
            onStopEdit={stopEdit}
            onSetDragging={setDragging}
            onSetHoverOver={setHoverOver}
            onDrop={handleDrop}
          />
        ))}
      </div>
      <IconButton label="New session" hint="Ctrl+T" size="lg" onClick={onNewSession} data-no-drag>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}

interface TabProps {
  session: SessionEntry;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
  onSetDragging: (id: string | null) => void;
  onSetHoverOver: (id: string | null) => void;
  onDrop: () => void;
}

const Tab = memo(function Tab({
  session: s,
  index,
  isActive,
  isEditing,
  isDragging,
  isDropTarget,
  onSelect,
  onClose,
  onStartEdit,
  onStopEdit,
  onSetDragging,
  onSetHoverOver,
  onDrop,
}: TabProps) {
  const label = s.name || `session-${shortId(s.id)}`;
  return (
    <div
      data-tab-id={s.id}
      draggable={!isEditing}
      title={s.name ? `${s.name}\n${s.cwd}` : s.cwd}
      onClick={() => onSelect(s.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit(s.id);
      }}
      onDragStart={() => onSetDragging(s.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onSetHoverOver(s.id);
      }}
      onDragLeave={() => onSetHoverOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={() => {
        onSetDragging(null);
        onSetHoverOver(null);
      }}
      className={cn(
        'group relative flex h-full min-w-[140px] max-w-[220px] shrink-0 cursor-pointer',
        'items-center gap-2 border-r border-[var(--color-border)] px-3 text-sm',
        'transition-colors',
        isActive
          ? 'bg-[var(--color-surface)] text-[var(--color-fg)]'
          : 'text-[var(--color-fg-muted)] hover:bg-white/[0.03] hover:text-[var(--color-fg)]',
        isDragging && 'opacity-50',
        isDropTarget && 'border-l-2 border-l-[var(--color-accent)]',
      )}
    >
      <StateDot state={s.state} />
      {index < 9 && !isEditing && (
        <kbd
          aria-hidden
          className={cn(
            'hidden items-center justify-center rounded border px-1 font-mono text-[10px] leading-none sm:inline-flex',
            isActive
              ? 'border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-fg-muted)]'
              : 'border-transparent text-[var(--color-fg-subtle)]',
          )}
          title={`Ctrl+${index + 1}`}
        >
          {index + 1}
        </kbd>
      )}
      {isEditing ? (
        <TabNameInput
          initialValue={label}
          onCommit={async (name) => {
            onStopEdit();
            if (name.trim() && name !== s.name) {
              await api.renameSession(s.id, name.trim());
            }
          }}
          onCancel={onStopEdit}
        />
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(s.id);
        }}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded',
          'opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100',
          isActive && 'opacity-100',
        )}
        aria-label={`Close ${label}`}
      >
        <X size={12} />
      </button>
      {isActive && (
        <span className="absolute inset-x-0 -bottom-px h-px bg-[var(--color-accent)]" />
      )}
    </div>
  );
});
Tab.displayName = 'Tab';

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
