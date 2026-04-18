import { useEffect } from 'react';
import { api } from '@/lib/ipc';
import { useTree } from '@/store/tree';
import type { ActivitySnapshot, SessionId } from '@/lib/bindings';
import { cn } from '@/lib/utils';

interface ActivityPanelProps {
  sessionId: SessionId;
}

const EMPTY_ACTIVITY: ActivitySnapshot = {
  created: [],
  modified: [],
  deleted: [],
  tools: {},
};

export function ActivityPanel({ sessionId }: ActivityPanelProps) {
  const bucket = useTree((s) => s.bySession[sessionId]);
  const activity = bucket?.activity ?? EMPTY_ACTIVITY;
  const setActivity = useTree((s) => s.setActivity);

  useEffect(() => {
    let cancelled = false;
    api
      .activitySnapshot(sessionId)
      .then((snap) => {
        if (!cancelled) setActivity(sessionId, snap);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, setActivity]);

  const tools = Object.entries(activity.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxTool = tools[0]?.[1] ?? 0;

  const summary = [
    { label: 'created', value: activity.created.length, tone: 'ok' as const },
    { label: 'modified', value: activity.modified.length, tone: 'warn' as const },
    { label: 'deleted', value: activity.deleted.length, tone: 'danger' as const },
  ];

  return (
    <div className="flex flex-col gap-2 p-3 text-[11px]">
      <div className="grid grid-cols-3 gap-1.5">
        {summary.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>

      {tools.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Tools
          </div>
          {tools.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="w-24 truncate text-[var(--color-fg-muted)]">{name}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-[var(--color-accent)]"
                  style={{ width: `${(count / maxTool) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right font-mono text-[var(--color-fg-muted)]">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-[var(--color-ok)] bg-[var(--color-ok-subtle)]'
      : tone === 'warn'
        ? 'text-[var(--color-warn)] bg-[var(--color-warn-subtle)]'
        : 'text-[var(--color-danger)] bg-[var(--color-accent-subtle)]';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md px-2 py-1.5',
        toneClass,
      )}
    >
      <div className="font-mono text-sm leading-none">{value}</div>
      <div className="mt-0.5 text-[9.5px] uppercase tracking-wider opacity-80">
        {label}
      </div>
    </div>
  );
}
