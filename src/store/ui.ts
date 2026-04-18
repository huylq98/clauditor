import { create } from 'zustand';

interface UiStore {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  paletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setPaletteOpen: (v: boolean) => void;
}

export const useUi = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 280,
  paletteOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (px) => set({ sidebarWidth: Math.max(200, Math.min(520, px)) }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
}));
