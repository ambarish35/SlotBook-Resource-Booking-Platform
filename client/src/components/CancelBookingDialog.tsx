import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { type Booking, cancelBooking, isNotCancellable, phaseOf } from '../lib/bookings';
import { dateLabel } from '../lib/ist';
import { TYPE_LABEL } from '../lib/resources';
import { bookingRanges, durationLabel, rangeLabel, slotCountLabel } from '../lib/slots';
import { useOnOpen } from '../lib/useOnOpen';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Message, type MessageVariant } from './Message';

/** What went wrong, and what the dialog offers next (DESIGN.md §5.7). */
interface Failure {
  tone: Extract<MessageVariant, 'danger' | 'warning' | 'info'>;
  title: string;
  text: string;
  /** The booking can't be cancelled from here, whatever the user does next: the dialog only offers Close. */
  settled: boolean;
  /** The answer never arrived, so the booking may or may not be cancelled: offer to look it up. */
  canRefresh: boolean;
}

interface CancelBookingDialogProps {
  /** The booking to cancel, or `null` while the dialog is closed. */
  booking: Booking | null;
  /** Adds "Booked by": an admin cancelling someone else's booking sees whose it is. */
  showMember: boolean;
  /**
   * Fetches the list the page is showing again and swaps it in. Resolves with the fresh rows (`null` if the list
   * changed meanwhile) and rejects when the request fails.
   */
  refresh: () => Promise<Booking[] | null>;
  /** Close, Esc, the backdrop and the secondary button. `settled` is true when the booking has left the screen. */
  onClose: (settled: boolean) => void;
  /** The server cancelled it. The parent closes the dialog and says so. */
  onCancelled: (booking: Booking) => void;
  /** The list no longer holds this booking after a refresh: it was cancelled, or has ended. The parent closes the dialog. */
  onGone: (booking: Booking) => void;
}

const REFRESHED = 'We refreshed your bookings.';
const NOT_REFRESHED = "We couldn't refresh your bookings, so reload the page to see their current state.";

/**
 * The confirmation before a booking is cancelled (DESIGN.md §5.7). Focus starts on the title, never on the destructive
 * button, and nothing can be dismissed or sent twice while a request runs.
 *
 * The server's answer decides, and what the dialog says depends on how definite it is:
 * - A 409 (already cancelled, or already started) or a 404 is a definite no: the dialog says why, the list is refreshed,
 *   and only Close is left.
 * - Any other 4xx is a definite no too, but not one that explains itself: nothing was cancelled, and trying again is allowed.
 * - No answer at all, or a 5xx, is not a no. The server may have committed before the answer was lost (or before it
 *   failed while building the reply), so the dialog says it can't tell and offers to refresh the list to find out.
 *   Cancelling again is safe: if the first one went through, the second is a plain 409.
 */
export function CancelBookingDialog({ booking, showMember, refresh, onClose, onCancelled, onGone }: CancelBookingDialogProps) {
  const open = booking !== null;
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const busyRef = useRef(false);
  const failureRef = useRef<HTMLDivElement>(null);

  useOnOpen(open, () => {
    setSubmitting(false);
    setRefreshing(false);
    setFailure(null);
    setRefreshFailed(false);
  });

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure, refreshFailed]);

  /** Refreshes the list, so that what the dialog says about the list is true. */
  async function refreshList(): Promise<boolean> {
    try {
      await refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function explain(error: unknown) {
    if (error instanceof ApiError && error.status === 401) return; // signed out: the route guard takes over
    if (error instanceof ApiError && (isNotCancellable(error) || error.status === 404)) {
      const refreshed = await refreshList();
      const status = refreshed ? REFRESHED : NOT_REFRESHED;
      setFailure(
        error.status === 404
          ? {
              tone: 'warning',
              title: "We couldn't find this booking",
              text: `It may belong to a different account, for example if you signed in as someone else in another tab. ${status}`,
              settled: true,
              canRefresh: false,
            }
          : {
              tone: 'warning',
              title: "This booking can't be cancelled",
              text: `${error.message} ${status}`,
              settled: true,
              canRefresh: false,
            },
      );
    } else if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      setFailure({
        tone: 'danger',
        title: "We couldn't cancel this booking",
        text: "The server didn't accept the request, so the booking was not cancelled. Try again, or reload the page.",
        settled: false,
        canRefresh: false,
      });
    } else {
      const noAnswer = !(error instanceof ApiError) || error.status === 0;
      setFailure({
        tone: 'danger',
        title: "We couldn't confirm the cancellation",
        text: `${
          noAnswer ? "We couldn't reach the server," : 'The server ran into a problem,'
        } so we can't tell whether this booking was cancelled. Refresh to see its current state. If it is still listed, you can try again.`,
        settled: false,
        canRefresh: true,
      });
    }
  }

  async function handleCancel() {
    if (!booking || busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setFailure(null);
    setRefreshFailed(false);
    try {
      await cancelBooking(booking.id);
      onCancelled(booking);
    } catch (error) {
      await explain(error);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  /** After a lost answer: look at the list again and say what it shows about this booking. */
  async function handleRefresh() {
    if (!booking || busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const fresh = await refresh();
      if (fresh === null) return;
      const found = fresh.find((row) => row.id === booking.id);
      if (!found) {
        onGone(booking);
      } else if (phaseOf(found, Date.now()) === 'upcoming') {
        setFailure({
          tone: 'info',
          title: "It's still booked",
          text: "The cancellation didn't go through, and nothing was changed. You can try again.",
          settled: false,
          canRefresh: false,
        });
      } else {
        setFailure({
          tone: 'warning',
          title: "This booking can't be cancelled",
          text: 'It has already started, so it can no longer be cancelled. We refreshed your bookings.',
          settled: true,
          canRefresh: false,
        });
      }
    } catch {
      setRefreshFailed(true);
    } finally {
      busyRef.current = false;
      setRefreshing(false);
    }
  }

  const busy = submitting || refreshing;
  const close = () => {
    if (!busy) onClose(failure?.settled === true);
  };
  const ranges = booking ? bookingRanges(booking) : [];
  const count = booking?.slotStarts.length ?? 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Cancel this booking?"
      sheetBelow="md"
      busy={busy}
      initialFocus="title"
      footer={
        failure?.settled ? (
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" aria-disabled={busy || undefined} onClick={close}>
              {failure ? 'Close' : 'Keep booking'}
            </Button>
            <Button variant="danger" loading={submitting} loadingLabel="Cancelling…" onClick={() => void handleCancel()}>
              Cancel booking
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 pb-3">
        {failure ? (
          <Message
            ref={failureRef}
            variant={failure.tone}
            title={failure.title}
            action={
              failure.canRefresh ? (
                <Button variant="secondary" loading={refreshing} loadingLabel="Refreshing…" onClick={() => void handleRefresh()}>
                  Refresh bookings
                </Button>
              ) : undefined
            }
          >
            {refreshFailed ? `${failure.text} We couldn't refresh the list either. Check your connection and try again.` : failure.text}
          </Message>
        ) : null}
        {booking ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-copy-14">
            <dt className="text-fg-secondary">Resource</dt>
            <dd className="min-w-0 break-words text-fg">
              <span className="block text-label-14">{booking.resource.name}</span>
              <span className="block text-fg-secondary">
                {TYPE_LABEL[booking.resource.type]} · {booking.resource.location}
              </span>
            </dd>
            <dt className="text-fg-secondary">Date</dt>
            <dd className="text-fg tabular-nums">{dateLabel(booking.date)}</dd>
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
            {showMember ? (
              <>
                <dt className="text-fg-secondary">Booked by</dt>
                <dd className="min-w-0 text-fg">
                  <span className="block text-label-14 break-words">{booking.user.name}</span>
                  {booking.user.email ? <span className="block break-words text-fg-secondary">{booking.user.email}</span> : null}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {failure?.settled ? null : <p className="text-copy-14 text-fg">Its time slots will become available to others.</p>}
        <p className="text-label-13 text-fg-muted">All times IST (UTC+05:30).</p>
      </div>
    </Dialog>
  );
}
