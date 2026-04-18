import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useCapabilitiesStore } from '@/store/capabilities';
import type { Capability, CapabilityKind } from '@/lib/bindings';

const KIND_LABELS: Record<CapabilityKind, string> = {
  skill: 'Skills',
  subagent: 'Agents',
  mcpserver: 'MCP',
  slashcommand: 'Commands',
};

const KIND_BADGE_LABEL: Record<CapabilityKind, string> = {
  skill: 'SKILL',
  subagent: 'AGENT',
  mcpserver: 'MCP',
  slashcommand: 'CMD',
};

function formatSource(c: Capability): string {
  switch (c.source.type) {
    case 'plugin':
      return `${c.source.marketplace}/${c.source.plugin}@${c.source.version}`;
    case 'user':
      return c.source.dir;
    case 'settings':
      return c.source.file;
  }
}

async function copyInvocation(c: Capability) {
  try {
    await navigator.clipboard.writeText(c.invocation);
    toast.success(`Copied ${c.invocation}`);
  } catch {
    toast.error('Copy failed');
  }
}

export function CapabilitiesSheet() {
  const open = useCapabilitiesStore((s) => s.open);
  const loading = useCapabilitiesStore((s) => s.loading);
  const error = useCapabilitiesStore((s) => s.error);
  const query = useCapabilitiesStore((s) => s.query);
  const kindFilter = useCapabilitiesStore((s) => s.kindFilter);
  const warningsCount = useCapabilitiesStore((s) => s.warningsCount());
  const items = useCapabilitiesStore((s) => s.filtered());
  const closeSheet = useCapabilitiesStore((s) => s.closeSheet);
  const setQuery = useCapabilitiesStore((s) => s.setQuery);
  const toggleKind = useCapabilitiesStore((s) => s.toggleKind);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && closeSheet()} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          className="fixed right-0 top-0 h-full w-[440px] flex flex-col z-50 outline-none"
          style={{
            background: 'var(--color-panel)',
            borderLeft: '1px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-elevated)',
          }}
          aria-describedby={undefined}
        >
          <header
            className="flex items-center justify-between p-4"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <Dialog.Title
              className="text-sm font-semibold"
              style={{ color: 'var(--color-fg)' }}
            >
              Capabilities
            </Dialog.Title>
            <div className="flex items-center gap-2">
              {warningsCount > 0 && (
                <span
                  data-testid="warnings-chip"
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: 'var(--color-warn-subtle)',
                    color: 'var(--color-warn)',
                  }}
                >
                  ⚠ {warningsCount}
                </span>
              )}
              <Dialog.Close
                className="text-sm leading-none px-1"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                ×
              </Dialog.Close>
            </div>
          </header>

          <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <input
              type="text"
              placeholder="Search capabilities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-sm px-3 py-1.5 rounded"
              style={{
                background: 'var(--color-elevated)',
                color: 'var(--color-fg)',
                border: '1px solid var(--color-border-strong)',
                outline: 'none',
              }}
              data-testid="capabilities-search"
            />
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(KIND_LABELS) as CapabilityKind[]).map((k) => {
                const active = kindFilter.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKind(k)}
                    data-testid={`kind-pill-${k}`}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: active ? 'var(--color-elevated)' : 'transparent',
                      color: active ? 'var(--color-fg)' : 'var(--color-fg-subtle)',
                      border: `1px solid ${active ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                    }}
                  >
                    {KIND_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" data-testid="capabilities-list">
            {loading && (
              <div className="p-4 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
                Loading…
              </div>
            )}
            {error && (
              <div className="p-4 text-sm" style={{ color: 'var(--color-danger)' }}>
                Failed to scan: {error}
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="p-4 text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
                No capabilities match.
              </div>
            )}
            {items.map((c) => (
              <div
                key={c.id}
                className="group p-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}
                data-testid="capability-row"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--color-accent-subtle)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {KIND_BADGE_LABEL[c.kind]}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-fg)' }}>
                    {c.name}
                  </span>
                </div>
                <div
                  className="text-xs line-clamp-2"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {c.description}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {formatSource(c)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyInvocation(c)}
                    data-testid={`copy-${c.name}`}
                    className="text-[11px] opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded ml-2 shrink-0"
                    style={{
                      color: 'var(--color-fg-muted)',
                      border: '1px solid var(--color-border-strong)',
                    }}
                  >
                    Copy invocation
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
