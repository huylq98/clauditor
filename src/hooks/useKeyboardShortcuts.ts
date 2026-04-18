import { useEffect } from 'react';
import { useSessions } from '@/store/sessions';
import { useUi } from '@/store/ui';
import { useKeymap } from '@/store/keymap';
import { matchesChord, type ActionId } from '@/lib/keymap';

interface ShortcutHandlers {
  onNewSession: () => void;
  onCloseActive: () => void;
  onShowShortcuts: () => void;
  onShowSettings: () => void;
}

export function useKeyboardShortcuts({
  onNewSession,
  onCloseActive,
  onShowShortcuts,
  onShowSettings,
}: ShortcutHandlers) {
  const setActive = useSessions((s) => s.setActive);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const chords = useKeymap.getState().chords;
      const match = (id: ActionId) => matchesChord(e, chords[id]);

      if (match('new-session')) { e.preventDefault(); onNewSession(); return; }
      if (match('close-active')) { e.preventDefault(); onCloseActive(); return; }
      if (match('toggle-sidebar')) { e.preventDefault(); toggleSidebar(); return; }
      if (match('command-palette')) {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
        return;
      }
      if (match('shortcuts-cheatsheet')) { e.preventDefault(); onShowShortcuts(); return; }
      if (match('settings')) { e.preventDefault(); onShowSettings(); return; }
      if (match('next-tab') || match('prev-tab')) {
        e.preventDefault();
        const { order, activeId } = useSessions.getState();
        if (!order.length) return;
        const i = activeId ? order.indexOf(activeId) : -1;
        const n = order.length;
        const forward = match('next-tab');
        const nextIdx = forward ? (i + 1 + n) % n : (i - 1 + n) % n;
        setActive(order[nextIdx]);
        return;
      }
      for (let i = 1; i <= 9; i++) {
        if (match(`jump-tab-${i}` as ActionId)) {
          e.preventDefault();
          const id = useSessions.getState().order[i - 1];
          if (id) setActive(id);
          return;
        }
      }

      // Non-configurable UI nudge kept from before.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const ui = useUi.getState();
        if (ui.sidebarCollapsed) return;
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 20 : -20;
        ui.setSidebarWidth(ui.sidebarWidth + delta);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onNewSession, onCloseActive, onShowShortcuts, onShowSettings, setActive, toggleSidebar, setPaletteOpen]);
}
