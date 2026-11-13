import type { ComponentPropsWithRef } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';

const base =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-label-14 whitespace-nowrap md:h-10';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-subtle',
  subtle: 'text-fg-secondary hover:bg-surface-subtle',
  danger: 'bg-danger text-white hover:bg-danger-hover',
};

/** Class names for a button, so a `<Link>` that navigates can look like one (links navigate, buttons act). */
export function buttonClasses(variant: ButtonVariant = 'primary', fullWidth = false): string {
  return `${base} ${variants[variant]}${fullWidth ? ' w-full' : ''}`;
}

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  /** Shows a spinner and `loadingLabel`, ignores clicks and sets aria-disabled. The button is never `disabled`. */
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  variant = 'primary',
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
      className={`${buttonClasses(variant, fullWidth)}${className ? ` ${className}` : ''}`}
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
