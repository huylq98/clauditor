import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ipc';
import type { InstalledHooks, HookStatus } from '@/lib/bindings';
import { cn } from '@/lib/utils';

const STATUS_META: Record<HookStatus, { icon: React.ReactNode; color: string; label: string }> = {
  present: { icon: <CheckCircle2 size={14} />, color: 'var(--color-ok)', label: 'Installed' },
  missing: { icon: <MinusCircle size={14} />, color: 'var(--color-fg-subtle)', label: 'Not installed' },
  stale: { icon: <AlertTriangle size={14} />, color: 'var(--color-warn)', label: 'Stale (script missing)' },
};

export function HooksTab() {
  const [data, setData] = useState<InstalledHooks | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.readInstalledHooks());
    } finally {
      setLoading(false);
    }
  }, []);

  // On-mount data fetch: intentionally sets state once the promise resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  const reinstall = async () => {
    try {
      await api.reinstallHooks();
      toast.success('Hooks re-installed');
      await reload();
    } catch (e) {
      toast.error('Re-install failed', { description: String(e) });
    }
  };

  if (!data) return <div className="text-[13px] text-[var(--color-fg-muted)]">Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
          Claude Code settings file
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--color-fg-muted)]">
          <span className="truncate">{data.settingsPath}</span>
        </div>
        {!data.settingsPresent && (
          <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">
            No Claude Code config detected. Clauditor&rsquo;s hooks install on first session.
          </div>
        )}
        {data.parseError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-subtle)] p-2 text-[12px] text-[var(--color-fg)]">
            <XCircle size={14} className="mt-0.5 text-[var(--color-warn)]" />
            <div>
              <div className="font-medium">Could not parse settings.json</div>
              <div className="text-[var(--color-fg-muted)]">{data.parseError}</div>
              <div className="mt-1 text-[var(--color-fg-muted)]">
                Re-installing will overwrite Clauditor&rsquo;s own entries.
              </div>
            </div>
          </div>
        )}
      </section>

      {data.entries.length > 0 && (
        <section>
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Installed hooks
          </div>
          <div className="flex flex-col gap-1">
            {data.entries.map((entry) => {
              const meta = STATUS_META[entry.status];
              return (
                <div
                  key={entry.event}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px]"
                >
                  <span className="text-[var(--color-fg)]">{entry.event}</span>
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: meta.color }}>
                    {meta.icon}
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex gap-2 border-t border-[var(--color-border)] pt-4">
        <button
          type="button"
          onClick={() => void reinstall()}
          className={cn(
            'rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-bg)]',
            'hover:bg-[var(--color-accent-hover)]',
          )}
        >
          Re-install Clauditor hooks
        </button>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)]"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Re-check
        </button>
      </section>
    </div>
  );
}
