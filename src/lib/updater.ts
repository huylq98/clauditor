import { updaterMock } from './mock';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type UpdateInfo = {
  available: boolean;
  version: string;
  body?: string;
  date?: string;
  downloadAndInstall: (onProgress?: (ev: unknown) => void) => Promise<void>;
};

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return updaterMock.check();
  const { check } = await import('@tauri-apps/plugin-updater');
  const u = await check();
  if (!u) return null;
  return {
    available: true,
    version: u.version,
    body: u.body,
    date: u.date,
    downloadAndInstall: (onProgress) =>
      u.downloadAndInstall((ev) => onProgress?.(ev as unknown)),
  };
}

export async function relaunchApp(): Promise<void> {
  if (!isTauri) return updaterMock.relaunch();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
