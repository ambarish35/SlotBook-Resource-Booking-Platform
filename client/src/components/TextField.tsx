import { type ComponentPropsWithRef, useId } from 'react';
import { ErrorIcon } from './icons';

type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'id' | 'className'> & {
  /** The visible label above the field (DESIGN.md §4: placeholders never stand in for labels). */
  label: string;
  /** A persistent caption below the field, such as "At least 8 characters". */
  caption?: string;
  /** The error to show below the field; also sets aria-invalid. */
  error?: string;
};

export function TextField({ label, caption, error, ...input }: TextFieldProps) {
  const id = useId();
  const captionId = `${id}-caption`;
  const errorId = `${id}-error`;
  const describedBy = [caption ? captionId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label-14 text-fg">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-11 w-full rounded-md border bg-surface px-3 text-base text-fg focus:border-accent sm:text-copy-14 md:h-10 ${
          error ? 'border-danger' : 'border-border-strong'
        }`}
        {...input}
      />
      {caption ? (
        <p id={captionId} className="mt-1 text-label-13 text-fg-muted">
          {caption}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 flex items-start gap-1 text-label-13 text-danger">
          <ErrorIcon size={16} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
