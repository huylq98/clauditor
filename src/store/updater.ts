import { create } from 'zustand';
import { checkForUpdate, relaunchApp, type UpdateInfo } from '../lib/updater';

type Status = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdaterStore {
  status: Status;
  version?: string;
  notes?: string;
  downloaded: number;
  total: number;
  error?: string;
  dismissed: boolean;
  check: (opts?: { manual?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

let active: UpdateInfo | null = null;

export const useUpdater = create<UpdaterStore>((set, get) => ({
  status: 'idle',
  downloaded: 0,
  total: 0,
  dismissed: false,

  async check(opts) {
    const s = get().status;
    if (s === 'checking' || s === 'downloading') return;
    set({ status: 'checking', error: undefined });
    try {
      active = await checkForUpdate();
      if (!active || !active.available) {
        set({ status: 'idle' });
        if (opts?.manual) {
          const { toast } = await import('sonner');
          toast.success("You're up to date.");
        }
        return;
      }
      set({
        status: 'available',
        version: active.version,
        notes: active.body,
        dismissed: false,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: 'error', error: msg });
      if (opts?.manual) {
        const { toast } = await import('sonner');
        toast.error(`Update check failed: ${msg}`);
      }
    }
  },

  async install() {
    if (!active || get().status !== 'available') return;
    set({ status: 'downloading', downloaded: 0, total: 0 });
    try {
      await active.downloadAndInstall((ev) => {
        const e = ev as { event: string; data?: { contentLength?: number; chunkLength?: number } };
        if (e.event === 'Started') {
          set({ total: e.data?.contentLength ?? 0 });
        } else if (e.event === 'Progress') {
          set((prev) => ({ downloaded: prev.downloaded + (e.data?.chunkLength ?? 0) }));
        }
      });
      set({ status: 'ready' });
      await relaunchApp();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: 'error', error: msg });
    }
  },

  dismiss() {
    set({ dismissed: true });
  },
}));
