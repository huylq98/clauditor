import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { Palette, Keyboard, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { ShortcutsTab } from '@/components/settings/ShortcutsTab';
import { HooksTab } from '@/components/settings/HooksTab';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABS: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={14} /> },
  { id: 'hooks', label: 'Hooks', icon: <Webhook size={14} /> },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(720px,92vw)] h-[min(480px,80vh)] -translate-x-1/2 -translate-y-1/2',
            'overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)]',
            'shadow-[var(--shadow-elevated)]',
          )}
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Tabs.Root defaultValue="appearance" orientation="vertical" className="grid h-full grid-cols-[180px_1fr]">
            <Tabs.List
              aria-label="Settings sections"
              className="flex flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              {TABS.map((t) => (
                <Tabs.Trigger
                  key={t.id}
                  value={t.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-[var(--color-fg-muted)]',
                    'data-[state=active]:bg-[var(--color-accent-subtle)] data-[state=active]:text-[var(--color-accent)]',
                    'data-[state=active]:font-medium',
                  )}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="overflow-y-auto">
              <Tabs.Content value="appearance" className="p-6">
                <AppearanceTab />
              </Tabs.Content>
              <Tabs.Content value="shortcuts" className="p-6">
                <ShortcutsTab />
              </Tabs.Content>
              <Tabs.Content value="hooks" className="p-6">
                <HooksTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
