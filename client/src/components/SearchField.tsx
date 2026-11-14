import { type RefObject, useId } from 'react';
import { CloseIcon } from './icons';
import { IconButton } from './IconButton';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The visible label. Default: "Search resources". */
  label?: string;
  /** The persistent caption below the field. Default: "By name, location or tag". */
  caption?: string;
}

/** A labelled `type="search"` field. Its clear button exists only while there is text (DESIGN.md §4 Inputs). */
export function SearchField({
  value,
  onChange,
  inputRef,
  label = 'Search resources',
  caption = 'By name, location or tag',
}: SearchFieldProps) {
  const id = useId();
  const captionId = `${id}-caption`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label-14 text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={captionId}
          autoComplete="off"
          className="h-11 w-full rounded-md border border-border-strong bg-surface pr-12 pl-3 text-base text-fg focus:border-accent sm:text-copy-14 md:h-10 md:pr-11"
        />
        {value ? (
          <IconButton
            label="Clear search"
            className="absolute top-0 right-0"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={16} />
          </IconButton>
        ) : null}
      </div>
      <p id={captionId} className="mt-1 text-label-13 text-fg-muted">
        {caption}
      </p>
    </div>
  );
}
