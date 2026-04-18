import { Minus, Square, X } from 'lucide-react';
import { cn, isMac } from '@/lib/utils';
import { isTauri } from '@/lib/ipc';

async function getWindow() {
  if (!isTauri) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export function TitleBar() {
  const handle = async (action: 'min' | 'max' | 'close') => {
    const w = await getWindow();
    if (!w) return;
    if (action === 'min') await w.minimize();
    else if (action === 'max') await (await w.isMaximized()) ? w.unmaximize() : w.maximize();
    else await w.close();
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'flex h-9 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]',
        'px-3 text-xs text-[var(--color-fg-muted)]',
      )}
    >
      <div className="flex items-center gap-2" data-no-drag>
        <LogoMark />
        <span className="font-semibold tracking-tight text-[var(--color-fg)]">Clauditor</span>
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] text-[var(--color-fg-subtle)]">
        {/* reserved — could show active workspace */}
      </div>

      {!isMac && (
        <div className="flex items-center gap-0.5" data-no-drag>
          <button
            aria-label="Minimize"
            className="flex h-7 w-9 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5"
            onClick={() => handle('min')}
          >
            <Minus size={14} />
          </button>
          <button
            aria-label="Maximize"
            className="flex h-7 w-9 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-white/5"
            onClick={() => handle('max')}
          >
            <Square size={12} />
          </button>
          <button
            aria-label="Close"
            className="flex h-7 w-9 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)]"
            onClick={() => handle('close')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}

function LogoMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 2.5L21.5 12 12 21.5 2.5 12 12 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-[var(--color-accent)]"
      />
      <path
        d="M12 6.5L17.5 12 12 17.5 6.5 12 12 6.5z"
        fill="currentColor"
        className="text-[var(--color-accent)] opacity-70"
      />
    </svg>
  );
}
