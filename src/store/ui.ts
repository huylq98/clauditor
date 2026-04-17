import { create } from 'zustand';

type Density = 'compact' | 'comfortable';

interface UiStore {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  density: Density;
  paletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setDensity: (d: Density) => void;
  setPaletteOpen: (v: boolean) => void;
}

export const useUi = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 280,
  density: 'compact',
  paletteOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (px) => set({ sidebarWidth: Math.max(200, Math.min(520, px)) }),
  setDensity: (d) => set({ density: d }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
}));
