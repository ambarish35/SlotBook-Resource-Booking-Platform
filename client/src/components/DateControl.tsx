import { type Ref, useEffect, useId, useState } from 'react';
import { MAX_DAYS_AHEAD, addDays, isIstDate, shortDateLabel } from '../lib/ist';
import { Button } from './Button';
import { ChevronLeftIcon, ChevronRightIcon, ErrorIcon } from './icons';
import { IconButton } from './IconButton';

interface DateControlProps {
  /** The date being shown, `YYYY-MM-DD` in IST. */
  date: string;
  /** Today and today + 30 in IST, the first and last dates that can be booked. */
  today: string;
  maxDate: string;
  onChange: (date: string) => void;
  /** Changing the date will clear the selection, so say so beforehand (DESIGN.md §5.4). */
  selectionWillClear: boolean;
  /** For the page, to put focus back here when the control it was using goes away. */
  nextDayRef?: Ref<HTMLButtonElement>;
}

/**
 * The date row (DESIGN.md §5.4): Previous day, a native date input, Next day and Today. The window is today to
 * today + 30. The two ends of it are `aria-disabled`, never `disabled`, so focus never falls off a button the user
 * just pressed; the caption below says why.
 */
export function DateControl({ date, today, maxDate, onChange, selectionWillClear, nextDayRef }: DateControlProps) {
  const id = useId();
  const captionId = `${id}-caption`;
  const warningId = `${id}-warning`;
  const errorId = `${id}-error`;

  // What the input shows can run ahead of `date` while someone types. It follows `date` again when that changes.
  const [draft, setDraft] = useState(date);
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setDraft(date);
  }

  // What is wrong with the draft, if anything. Empty means a date only partly typed, and a short year is the year
  // still being typed: neither is a problem yet.
  const problem =
    draft === '' || Number(draft.slice(0, 4)) < 1000
      ? null
      : !isIstDate(draft)
        ? 'Enter a real date.'
        : draft < today || draft > maxDate
          ? `Choose a date from ${shortDateLabel(today)} to ${shortDateLabel(maxDate)}.`
          : null;

  // Typing a date passes through other dates on the way (changing the month of 27 Nov to 02 gives 27 Feb), so the
  // message waits until the draft has stayed the same for a moment, or the field is left. Never on every keystroke.
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!problem) {
      setError(null);
      return;
    }
    const timer = setTimeout(() => setError(problem), 600);
    return () => clearTimeout(timer);
  }, [problem]);

  function handleInput(value: string) {
    setDraft(value);
    // A date that can be shown is shown at once; the others wait for the message above.
    if (value !== date && value !== '' && Number(value.slice(0, 4)) >= 1000 && isIstDate(value) && value >= today && value <= maxDate) {
      onChange(value);
    }
  }

  const describedBy = [captionId, selectionWillClear ? warningId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label-14 text-fg">
        Date
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label="Previous day"
          aria-disabled={date <= today || undefined}
          onClick={() => {
            if (date > today) onChange(addDays(date, -1));
          }}
        >
          <ChevronLeftIcon size={20} />
        </IconButton>
        <input
          id={id}
          type="date"
          value={draft}
          min={today}
          max={maxDate}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => handleInput(event.target.value)}
          onBlur={() => {
            // A refused date stays in the field, with its message, until another date is chosen; the page keeps
            // showing the last good one meanwhile. A date left half typed is just put back.
            if (problem) setError(problem);
            else if (draft === '') setDraft(date);
          }}
          className={`h-11 min-w-36 flex-1 rounded-md border bg-surface px-3 text-base text-fg tabular-nums focus:border-accent sm:text-copy-14 md:h-10 md:max-w-56 md:flex-none ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        />
        <IconButton
          ref={nextDayRef}
          label="Next day"
          aria-disabled={date >= maxDate || undefined}
          onClick={() => {
            if (date < maxDate) onChange(addDays(date, 1));
          }}
        >
          <ChevronRightIcon size={20} />
        </IconButton>
        <Button
          variant="secondary"
          aria-disabled={date === today || undefined}
          onClick={() => {
            if (date !== today) onChange(today);
          }}
        >
          Today
        </Button>
      </div>
      <p id={captionId} className="mt-2 text-label-13 text-fg-muted">
        All times IST (UTC+05:30). You can book from today up to {MAX_DAYS_AHEAD} days ahead.
      </p>
      {selectionWillClear ? (
        <p id={warningId} className="mt-1 text-label-13 text-fg-secondary">
          Changing the date clears your selection.
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
