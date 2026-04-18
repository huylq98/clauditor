import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FolderOpen, Activity, PanelLeft } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSessions, deriveActiveSession } from '@/store/sessions';
import { FileTree } from './FileTree';
import { ActivityPanel } from './ActivityPanel';
import { IconButton } from './ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const activeId = useSessions((s) => s.activeId);
  const byId = useSessions((s) => s.byId);
  const active = useMemo(() => deriveActiveSession(activeId, byId), [activeId, byId]);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const width = useUi((s) => s.sidebarWidth);
  const setWidth = useUi((s) => s.setSidebarWidth);
  const toggle = useUi((s) => s.toggleSidebar);

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border)] bg-[var(--color-bg)] py-2">
        <IconButton label="Expand sidebar" hint="Ctrl+B" size="md" onClick={toggle}>
          <PanelLeft size={16} />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]"
      style={{ width }}
    >
      <WorkspaceHeader
        cwd={active?.cwd ?? null}
        name={active?.name ?? null}
        onCollapse={toggle}
      />
      <div className="flex-1 overflow-y-auto">
        <SidebarSection title="Files" icon={<FolderOpen size={12} />}>
          {active ? (
            <FileTree sessionId={active.id} />
          ) : (
            <EmptySectionHint>Select a session to browse its files</EmptySectionHint>
          )}
        </SidebarSection>
      </div>
      <div className="border-t border-[var(--color-border)]">
        <SidebarSection title="Activity" icon={<Activity size={12} />} dense>
          {active ? (
            <ActivityPanel sessionId={active.id} />
          ) : (
            <EmptySectionHint>Activity from tool calls will appear here</EmptySectionHint>
          )}
        </SidebarSection>
      </div>
      <ResizeHandle width={width} setWidth={setWidth} />
    </aside>
  );
}

function WorkspaceHeader({
  cwd,
  name,
  onCollapse,
}: {
  cwd: string | null;
  name: string | null;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-fg)]">
          {name ?? 'No session'}
        </div>
        {cwd ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default truncate font-mono text-[10.5px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
                {cwd}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="font-mono text-[11px]">{cwd}</span>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="truncate font-mono text-[10.5px] text-[var(--color-fg-subtle)]">—</div>
        )}
      </div>
      <IconButton label="Collapse sidebar" hint="Ctrl+B" size="sm" onClick={onCollapse}>
        <PanelLeft size={14} />
      </IconButton>
    </div>
  );
}

function SidebarSection({
  title,
  icon,
  children,
  dense = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className={cn('flex flex-col', dense ? 'max-h-[180px]' : '')}>
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {icon}
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function EmptySectionHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-4 text-center text-[11px] text-[var(--color-fg-subtle)]">
      {children}
    </div>
  );
}

function ResizeHandle({ width, setWidth }: { width: number; setWidth: (px: number) => void }) {
  const startRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.startX;
      setWidth(startRef.current.startWidth + dx);
    },
    [setWidth],
  );

  const onMouseUp = useCallback(() => {
    startRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      onMouseDown={(e) => {
        startRef.current = { startX: e.clientX, startWidth: width };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      className={cn(
        'absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize',
        'transition-colors hover:bg-[var(--color-accent)]/20',
      )}
      aria-label="Resize sidebar — drag, or Ctrl+Shift+←/→"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={200}
      aria-valuemax={520}
    />
  );
}
