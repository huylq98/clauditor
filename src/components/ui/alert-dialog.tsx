import { forwardRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: AlertDialogProps) {
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
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(440px,90vw)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)]',
            'p-5 shadow-[var(--shadow-elevated)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--color-fg)]">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-[var(--color-fg-muted)]">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <ConfirmButton variant={variant} onClick={onConfirm}>
              {confirmLabel}
            </ConfirmButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ConfirmButton = forwardRef<
  HTMLButtonElement,
  { variant: 'default' | 'danger'; onClick: () => void | Promise<void>; children: React.ReactNode }
>(({ variant, onClick, children }, ref) => {
  const dangerClass =
    variant === 'danger'
      ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/30'
      : 'bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)]';
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
        // Destructive confirm: always show the focus ring, not just on
        // keyboard navigation — mouse users need to see the focused target too.
        'outline-none ring-2 ring-transparent focus:ring-[var(--color-accent)]/60 focus-visible:ring-[var(--color-accent)]/60',
        dangerClass,
      )}
      autoFocus
    >
      {children}
    </button>
  );
});
ConfirmButton.displayName = 'ConfirmButton';
