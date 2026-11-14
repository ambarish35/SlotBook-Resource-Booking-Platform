import { type ComponentPropsWithRef, useId } from 'react';

type SelectFieldProps = Omit<ComponentPropsWithRef<'select'>, 'id' | 'className'> & {
  /** The visible label above the select. */
  label: string;
};

/** A labelled native `<select>` (DESIGN.md §4 Inputs: use native controls). Pass the `<option>`s as children. */
export function SelectField({ label, children, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label-14 text-fg">
        {label}
      </label>
      <select
        id={id}
        className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg focus:border-accent sm:text-copy-14 md:h-10"
        {...select}
      >
        {children}
      </select>
    </div>
  );
}
