import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatChord, type Chord } from '@/lib/keymap';

interface ChordCaptureProps {
  initial: Chord | null;
  onCapture: (chord: Chord | null) => void;
  onCancel: () => void;
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);
const CAPTURE_TIMEOUT_MS = 15_000;

export function ChordCapture({ initial, onCapture, onCancel }: ChordCaptureProps) {
  const [live, setLive] = useState<Chord | null>(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const timer = window.setTimeout(onCancel, CAPTURE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { onCancel(); return; }
    if (MODIFIER_KEYS.has(e.key)) {
      setLive({
        ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, key: '',
      });
      return;
    }
    if (e.key === 'Enter' && live && live.key) {
      onCapture(live);
      return;
    }
    const chord: Chord = {
      ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey,
      key: e.key.toLowerCase(),
    };
    setLive(chord);
    onCapture(chord);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Press a key combination, or Escape to cancel"
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
      className={cn(
        'inline-flex items-center rounded border border-[var(--color-accent)] bg-[var(--color-bg)]',
        'px-2 py-0.5 font-mono text-[11px] text-[var(--color-accent)] outline-none',
      )}
    >
      {live ? formatChord(live) || 'Press keys…' : 'Press keys…'}
    </div>
  );
}
