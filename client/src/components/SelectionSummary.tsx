import { useEffect, useId, useRef } from 'react';
import { MAX_SLOTS } from '../lib/bookings';
import { type TimeRange, durationLabel, rangeLabel, slotCountLabel } from '../lib/slots';
import { Button } from './Button';
import { CloseIcon, WarningIcon } from './icons';
import { IconButton } from './IconButton';

/** Shown when a 9th slot is refused, and read out by the page's live region (DESIGN.md §5.5). */
export const LIMIT_TEXT = `You can book up to ${MAX_SLOTS} slots at a time.`;

interface SelectionSummaryProps {
  /** `panel` is the sticky side column from 1024 px; `bar` is the sticky bottom bar below it (DESIGN.md §5.4). */
  variant: 'panel' | 'bar';
  /** "Sat, 14 Nov 2026". */
  dateText: string;
  ranges: TimeRange[];
  count: number;
  /** A 9th slot was refused and the selection is unchanged. */
  limitHit: boolean;
  /** The grid is being refreshed, so reviewing waits for it. */
  updating: boolean;
  onReview: () => void;
  onRemove: (range: TimeRange) => void;
  onClear: () => void;
  /** Where focus goes when the control the user just pressed has gone. */
  onFocusGrid: () => void;
}

function LimitNote() {
  return (
    <p className="flex items-start gap-1 text-label-13 text-warning">
      <WarningIcon size={16} className="mt-px shrink-0" />
      <span>{LIMIT_TEXT}</span>
    </p>
  );
}

/**
 * The selection so far and the way to book it. The same data is drawn twice, a panel and a bar, and CSS shows one:
 * the hidden one is not in the page for screen readers or the Tab key. Neither is a live region; the page has one
 * for both, so the count is announced once.
 */
export function SelectionSummary({ variant, dateText, ranges, count, limitHit, updating, onReview, onRemove, onClear, onFocusGrid }: SelectionSummaryProps) {
  const headingId = useId();
  const reasonId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  // After "Remove", the pressed button is gone: focus moves to its neighbour, or to the grid when none is left.
  const afterRemove = useRef<number | null>(null);

  useEffect(() => {
    if (afterRemove.current === null) return;
    const index = afterRemove.current;
    afterRemove.current = null;
    const remaining = listRef.current?.querySelectorAll<HTMLElement>('button') ?? [];
    if (remaining.length === 0) onFocusGrid();
    else remaining[Math.min(index, remaining.length - 1)]?.focus();
  }, [ranges, onFocusGrid]);

  const review = (
    <Button
      fullWidth={variant === 'panel'}
      aria-haspopup="dialog"
      loading={updating}
      loadingLabel="Updating times…"
      {...(count === 0 ? { 'aria-disabled': true, 'aria-describedby': reasonId } : {})}
      onClick={() => {
        if (count > 0 && !updating) onReview();
      }}
    >
      {variant === 'panel' ? 'Review booking' : 'Review'}
    </Button>
  );

  if (variant === 'bar') {
    if (count === 0 || ranges.length === 0) return null; // hidden while nothing is selected
    const more = ranges.length > 1 ? ` +${ranges.length - 1} more` : '';
    return (
      <section
        aria-label="Your selection"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised"
      >
        <div className="mx-auto flex max-w-content items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-label-14 text-fg tabular-nums">
              {slotCountLabel(count)} · {rangeLabel(ranges[0]!)}
              {more}
            </p>
            {limitHit ? <LimitNote /> : null}
          </div>
          {review}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface p-4 md:p-5">
      <h2 id={headingId} className="text-title-card text-fg">
        Your selection
      </h2>
      <p className="mt-1 text-label-14 text-fg-secondary tabular-nums">{dateText}</p>

      {count === 0 ? (
        <div className="mt-4">
          <p className="text-label-14 text-fg">No times selected</p>
          <p id={reasonId} className="mt-1 text-copy-14 text-fg-secondary">
            Select one or more available times, up to {MAX_SLOTS} slots ({MAX_SLOTS / 2} hours).
          </p>
        </div>
      ) : (
        <>
          <ul ref={listRef} aria-label="Selected times" className="mt-4 divide-y divide-border border-y border-border">
            {ranges.map((range, index) => (
              <li key={range.start} className="flex items-center justify-between gap-2 py-1 pl-0">
                <p className="min-w-0 text-label-14 text-fg tabular-nums">
                  {rangeLabel(range)} · {slotCountLabel(range.count)}
                </p>
                <IconButton
                  label={`Remove ${range.text}`}
                  onClick={() => {
                    afterRemove.current = index;
                    onRemove(range);
                  }}
                >
                  <CloseIcon size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-label-14 text-fg tabular-nums">Total {durationLabel(count)}</p>
          {limitHit ? (
            <div className="mt-2">
              <LimitNote />
            </div>
          ) : null}
        </>
      )}

      <div className="mt-4">{review}</div>
      {count > 0 ? (
        <div className="mt-2">
          <Button
            variant="subtle"
            fullWidth
            onClick={() => {
              onClear();
              onFocusGrid();
            }}
          >
            Clear selection
          </Button>
        </div>
      ) : null}
    </section>
  );
}
