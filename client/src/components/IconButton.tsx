import type { ComponentPropsWithRef } from 'react';

type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label'> & {
  /** Names the action. Icon-only buttons always need one (DESIGN.md §4). */
  label: string;
};

/** A 40 px square (44 px on mobile) subtle button holding only an icon. Mark the icon aria-hidden. */
export function IconButton({ label, className = '', type = 'button', children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-surface-subtle md:size-10 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
