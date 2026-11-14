import { type ComponentPropsWithRef, useId } from 'react';
import { ErrorIcon } from './icons';

type TextAreaFieldProps = Omit<ComponentPropsWithRef<'textarea'>, 'id' | 'className'> & {
  /** The visible label above the field, with "(optional)" when it may be left empty. */
  label: string;
  /** A persistent caption below the field. */
  caption?: string;
  /** The error to show below the field; also sets aria-invalid. */
  error?: string;
};

/** A multi-line text field that behaves like `TextField`: visible label, caption and error linked by aria-describedby. */
export function TextAreaField({ label, caption, error, rows = 3, ...textarea }: TextAreaFieldProps) {
  const id = useId();
  const captionId = `${id}-caption`;
  const errorId = `${id}-error`;
  const describedBy = [caption ? captionId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label-14 text-fg">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-base text-fg focus:border-accent sm:text-copy-14 ${
          error ? 'border-danger' : 'border-border-strong'
        }`}
        {...textarea}
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
