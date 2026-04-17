import { useMemo } from 'react';
import { FolderOpen, Activity, PanelLeft } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSessions, deriveActiveSession } from '@/store/sessions';
import { FileTree } from './FileTree';
import { ActivityPanel } from './ActivityPanel';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const activeId = useSessions((s) => s.activeId);
  const byId = useSessions((s) => s.byId);
  const active = useMemo(() => deriveActiveSession(activeId, byId), [activeId, byId]);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const width = useUi((s) => s.sidebarWidth);
  const toggle = useUi((s) => s.toggleSidebar);

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border)] bg-[var(--color-bg)] py-2">
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"
          aria-label="Expand sidebar"
        >
          <PanelLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]"
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
            <EmptySectionHint>Select a session</EmptySectionHint>
          )}
        </SidebarSection>
      </div>
      <div className="border-t border-[var(--color-border)]">
        <SidebarSection title="Activity" icon={<Activity size={12} />} dense>
          {active ? (
            <ActivityPanel sessionId={active.id} />
          ) : (
            <EmptySectionHint>No active session</EmptySectionHint>
          )}
        </SidebarSection>
      </div>
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
        <div
          className="truncate font-mono text-[10.5px] text-[var(--color-fg-subtle)]"
          title={cwd ?? ''}
        >
          {cwd ?? '—'}
        </div>
      </div>
      <button
        onClick={onCollapse}
        className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"
        aria-label="Collapse sidebar"
      >
        <PanelLeft size={14} />
      </button>
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
