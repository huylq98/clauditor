import { useEffect } from 'react';
import { useSessions } from '@/store/sessions';
import { useUi } from '@/store/ui';

interface ShortcutHandlers {
  onNewSession: () => void;
  onCloseActive: () => void;
}

export function useKeyboardShortcuts({ onNewSession, onCloseActive }: ShortcutHandlers) {
  const setActive = useSessions((s) => s.setActive);
  const toggleSidebar = useUi((s) => s.toggleSidebar);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl/Cmd + T  -> new session
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        onNewSession();
        return;
      }

      // Ctrl/Cmd + W  -> close active
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        onCloseActive();
        return;
      }

      // Ctrl/Cmd + B  -> toggle sidebar
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl/Cmd + 1..9  -> jump to tab N
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const order = useSessions.getState().order;
        const id = order[idx];
        if (id) {
          e.preventDefault();
          setActive(id);
        }
        return;
      }

      // Ctrl/Cmd + Shift + ]  /  [  -> next/prev tab
      if (e.shiftKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const { order, activeId } = useSessions.getState();
        if (!order.length) return;
        const i = activeId ? order.indexOf(activeId) : -1;
        const n = order.length;
        const nextIdx = e.key === ']' ? (i + 1 + n) % n : (i - 1 + n) % n;
        setActive(order[nextIdx]);
      }
    };
    // Capture phase so we fire BEFORE xterm's keyboard handler swallows the event.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onNewSession, onCloseActive, setActive, toggleSidebar]);
}
