import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';
import { cn } from '@/lib/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const SIZES = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-9 w-9',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, hint, size = 'md', className, children, ...props }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            aria-label={label}
            className={cn(
              'flex shrink-0 items-center justify-center rounded transition-colors',
              'text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]',
              'disabled:opacity-50 disabled:pointer-events-none',
              SIZES[size],
              className,
            )}
            {...props}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{label}</span>
          {hint && (
            <kbd className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
              {hint}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = 'IconButton';
