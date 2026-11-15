import { useEffect, useRef } from 'react';
import { type Resource, TYPE_LABEL } from '../lib/resources';
import { type TimeRange, durationLabel, rangeLabel, slotCountLabel } from '../lib/slots';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Message } from './Message';

interface BookingDialogProps {
  open: boolean;
  /** Close, Esc, the backdrop and "Go back". None of them works while a request is running. */
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  /** Why the last attempt failed without being a conflict. The selection is untouched and nothing was booked. */
  failure: { title: string; text: string } | null;
  resource: Resource;
  /** "Sat, 14 Nov 2026". */
  dateText: string;
  ranges: TimeRange[];
  count: number;
}

/**
 * The review step before booking (DESIGN.md §5.5): what will be booked, once more, then "Confirm booking". Focus
 * starts on the title, never on a button that books. A conflict isn't shown here: the page closes the dialog and
 * explains it above the grid (§5.6). Other failures stay in the dialog so the user can try again.
 */
export function BookingDialog({ open, onClose, onConfirm, submitting, failure, resource, dateText, ranges, count }: BookingDialogProps) {
  const failureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm booking"
      sheetBelow="md"
      busy={submitting}
      initialFocus="title"
      footer={
        <>
          <Button
            variant="secondary"
            aria-disabled={submitting || undefined}
            onClick={() => {
              if (!submitting) onClose();
            }}
          >
            Go back
          </Button>
          <Button loading={submitting} loadingLabel="Booking…" onClick={onConfirm}>
            Confirm booking
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-3">
        {failure ? (
          <Message ref={failureRef} variant="danger" title={failure.title}>
            {failure.text}
          </Message>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-copy-14">
          <dt className="text-fg-secondary">Resource</dt>
          <dd className="min-w-0 break-words text-fg">
            <span className="block text-label-14">{resource.name}</span>
            <span className="block text-fg-secondary">
              {TYPE_LABEL[resource.type]} · {resource.location}
            </span>
          </dd>
          <dt className="text-fg-secondary">Date</dt>
          <dd className="text-fg tabular-nums">{dateText}</dd>
          <dt className="text-fg-secondary">{ranges.length === 1 ? 'Time' : 'Times'}</dt>
          <dd className="text-fg tabular-nums">
            <ul className="space-y-1">
              {ranges.map((range) => (
                <li key={range.start}>
                  {rangeLabel(range)} · {slotCountLabel(range.count)}
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-fg-secondary">Total</dt>
          <dd className="text-fg tabular-nums">
            {durationLabel(count)} · {slotCountLabel(count)}
          </dd>
        </dl>
        <p className="text-label-13 text-fg-muted">All times IST (UTC+05:30).</p>
      </div>
    </Dialog>
  );
}
