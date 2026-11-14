import { type Ref, useId } from 'react';
import { CAPACITY_OPTIONS, type Filters, type TypeFilter } from '../lib/resources';
import { Button } from './Button';

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'room', label: 'Rooms' },
  { value: 'equipment', label: 'Equipment' },
];

interface ResourceFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Shows the "Clear filters" button. The mobile sheet has its own in the footer. */
  onClear?: () => void;
  /** Always one column (the mobile sheet). Otherwise a row at 768–1023 px and a column from 1024 px (DESIGN.md §5.3). */
  stacked?: boolean;
  /** Attached to the checked type option, the group's tab stop, so a dialog can focus it on open. */
  firstFieldRef?: Ref<HTMLInputElement>;
}

/** Type radios and the minimum-capacity select. Changes apply instantly, and focus stays on the control. */
export function ResourceFilters({ filters, onChange, onClear, stacked = false, firstFieldRef }: ResourceFiltersProps) {
  const groupName = useId();
  const capacityId = useId();
  const capacityCaptionId = `${capacityId}-caption`;

  const layout = stacked ? 'flex-col' : 'flex-col md:flex-row md:flex-wrap md:items-start md:gap-6 lg:flex-col lg:items-stretch lg:gap-4';

  return (
    <div className={`flex gap-4 ${layout}`}>
      <fieldset>
        <legend className="mb-1 text-label-14 text-fg">Type</legend>
        <div className={stacked ? '' : 'md:flex md:gap-4 lg:block'}>
          {TYPE_OPTIONS.map(({ value, label }) => {
            const checked = filters.type === value;
            return (
              <label key={value} className="flex min-h-11 items-center gap-2 text-copy-14 text-fg md:min-h-8">
                <input
                  ref={checked ? firstFieldRef : undefined}
                  type="radio"
                  name={groupName}
                  value={value}
                  checked={checked}
                  // Equipment has no capacity, so choosing it also drops a capacity chosen earlier.
                  onChange={() => onChange({ ...filters, type: value, minCapacity: value === 'equipment' ? null : filters.minCapacity })}
                  className="size-4 accent-accent"
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {filters.type !== 'equipment' ? (
        <div className={stacked ? '' : 'md:w-56 lg:w-auto'}>
          <label htmlFor={capacityId} className="mb-1 block text-label-14 text-fg">
            Minimum capacity
          </label>
          <select
            id={capacityId}
            value={filters.minCapacity ?? ''}
            aria-describedby={filters.type === 'all' ? capacityCaptionId : undefined}
            onChange={(event) => onChange({ ...filters, minCapacity: event.target.value === '' ? null : Number(event.target.value) })}
            className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg focus:border-accent sm:text-copy-14 md:h-10"
          >
            <option value="">Any</option>
            {CAPACITY_OPTIONS.map((seats) => (
              <option key={seats} value={seats}>
                {seats} or more
              </option>
            ))}
          </select>
          {filters.type === 'all' ? (
            <p id={capacityCaptionId} className="mt-1 text-label-13 text-fg-muted">
              Equipment is hidden while a capacity is set.
            </p>
          ) : null}
        </div>
      ) : null}

      {onClear ? (
        <div className="md:mt-6 lg:mt-1">
          <Button variant="secondary" onClick={onClear} className="lg:w-full">
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
