import { usePreferences } from '@/store/preferences';
import { cn } from '@/lib/utils';

const THEMES: Array<{ id: 'dark' | 'light' | 'system'; label: string; hint: string; swatch: [string, string, string] }> = [
  { id: 'dark', label: 'Dark', hint: 'Warm ember', swatch: ['#14161b', '#20242d', '#c98469'] },
  { id: 'light', label: 'Light', hint: 'Parchment', swatch: ['#fafaf7', '#f0ede4', '#b06a4d'] },
  { id: 'system', label: 'System', hint: 'Follow OS', swatch: ['#8a8478', '#8a8478', '#8a8478'] },
];

export function AppearanceTab() {
  const theme = usePreferences((s) => s.appearance.theme);
  const uiScale = usePreferences((s) => s.appearance.uiScale);
  const setAppearance = usePreferences((s) => s.setAppearance);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
          Theme
        </div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void setAppearance({ theme: t.id })}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                theme === t.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border-strong)] hover:border-[var(--color-fg-subtle)]',
              )}
            >
              <div className="flex gap-1">
                {t.swatch.map((c, i) => (
                  <div key={i} className="h-3.5 w-3.5 rounded-sm border border-black/10" style={{ background: c }} />
                ))}
              </div>
              <div className="text-[13px] font-medium text-[var(--color-fg)]">{t.label}</div>
              <div className="text-[11px] text-[var(--color-fg-muted)]">{t.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
          UI scale
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={80}
            max={140}
            step={5}
            value={uiScale}
            onChange={(e) => void setAppearance({ uiScale: Number(e.target.value) })}
            className="h-1.5 w-[240px] appearance-none rounded-full bg-[var(--color-border-strong)] accent-[var(--color-accent)]"
            aria-label="UI scale percent"
          />
          <span className="font-mono tabular-nums text-[12px] text-[var(--color-fg)]">
            {uiScale}%
          </span>
        </div>
      </section>
    </div>
  );
}
