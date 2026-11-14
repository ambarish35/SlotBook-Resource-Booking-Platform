import type { ComponentPropsWithRef } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';
/** `compact` is the 32 px button for table rows on desktop (DESIGN.md §3 Sizes); it is still 44 px high on touch screens. */
export type ButtonSize = 'default' | 'compact';

const base = 'inline-flex items-center justify-center gap-2 rounded-md text-label-14 whitespace-nowrap';

const sizes: Record<ButtonSize, string> = {
  default: 'h-11 px-4 md:h-10',
  compact: 'h-11 px-3 md:h-8',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-subtle',
  subtle: 'text-fg-secondary hover:bg-surface-subtle',
  danger: 'bg-danger text-white hover:bg-danger-hover',
};

/** Class names for a button, so a `<Link>` that navigates can look like one (links navigate, buttons act). */
export function buttonClasses(variant: ButtonVariant = 'primary', fullWidth = false, size: ButtonSize = 'default'): string {
  return `${base} ${sizes[size]} ${variants[variant]}${fullWidth ? ' w-full' : ''}`;
}

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and `loadingLabel`, ignores clicks and sets aria-disabled. The button is never `disabled`. */
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  loading = false,
  loadingLabel,
  type = 'button',
  onClick,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={`${buttonClasses(variant, fullWidth, size)}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {loading ? (
        // The idle label stays in the layout, invisible, so the button never changes width.
        <span className="inline-grid">
          <span className="invisible col-start-1 row-start-1" aria-hidden="true">
            {children}
          </span>
          <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">
            <Spinner />
            {loadingLabel ?? children}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
