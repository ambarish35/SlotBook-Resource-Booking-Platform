import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../lib/api';
import { type AvailabilitySlot, type Booking, type SlotConflict, conflictsOf, createBooking } from '../lib/bookings';
import { MAX_DAYS_AHEAD, addDays, dateLabel, isIstDate, shortDateLabel, timeLabel, todayIst } from '../lib/ist';
import type { Resource } from '../lib/resources';
import {
  afterConflict,
  conflictNotice,
  justTakenStarts,
  rangeLabel,
  removeRange,
  slotCountLabel,
  toRanges,
  toggleSelection,
} from '../lib/slots';
import { useAvailability } from '../lib/useAvailability';
import { useRetryFocus } from '../lib/useRetryFocus';
import { BookingDialog } from './BookingDialog';
import { Button, buttonClasses } from './Button';
import { DateControl } from './DateControl';
import { EmptyState } from './EmptyState';
import { Message } from './Message';
import { LIMIT_TEXT, SelectionSummary } from './SelectionSummary';
import { SkeletonBlock } from './Skeleton';
import { SlotGrid, SlotLegend } from './SlotGrid';

/** What belongs to one date: a selection never survives a change of date (DESIGN.md §5.4). */
interface DayState {
  date: string;
  /** Start strings of the selected slots, in grid order. */
  selected: string[];
  /** Slots to draw as "Just taken" until the selection or the date changes (DESIGN.md §5.6). */
  justTaken: string[];
  /** How many times a 9th slot has been refused since the selection last changed; 0 for none. */
  limitHit: number;
}

const emptyDay = (date: string): DayState => ({ date, selected: [], justTaken: [], limitHit: 0 });

/** The message above the grid, always the result of the user's own action. */
type Notice =
  | { variant: 'success'; title: string; text: string; date: string }
  | { variant: 'warning'; title: string; text: string; date: string }
  /** The refresh after a conflict failed. `conflicts` is what the server refused, kept for "Try again". */
  | { variant: 'danger'; title: string; text: string; date: string; conflicts: SlotConflict[] };

/** Placeholder groups shaped like the grid while a day's slots load. */
function LoadingGrid() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">Loading availability…</span>
      {['Morning', 'Afternoon', 'Evening'].map((group) => (
        <div key={group}>
          <SkeletonBlock className="mb-2 h-4 w-20" />
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
            {Array.from({ length: 8 }, (_, index) => (
              <SkeletonBlock key={index} className="min-h-13" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ResourceBookingProps {
  resource: Resource;
  /** The resource may have been deactivated or removed since the page loaded: the page should load it again. */
  onResourceChanged: () => void;
}

/**
 * Choosing a date and slots, reviewing and booking (DESIGN.md §5.4 to §5.6). The date is in the address
 * (`?date=2026-11-14`), so it can be bookmarked and survives signing in again. The grid is a snapshot: the API's
 * answer to the booking request is the authority, and a refusal is shown as a conflict, never as a failure.
 * The rules (what is bookable, the 30-day window, the 8-slot limit) are the server's; the page only mirrors them.
 */
export function ResourceBooking({ resource, onResourceChanged }: ResourceBookingProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayIst();
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  const requested = searchParams.get('date');
  const date = requested !== null && isIstDate(requested) && requested >= today && requested <= maxDate ? requested : today;

  // A date the page can't show (an old bookmark, a typo) is dropped from the address, so it shows today.
  useEffect(() => {
    if (requested === null || requested === date) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('date');
        return next;
      },
      { replace: true },
    );
  }, [requested, date, setSearchParams]);

  const availability = useAvailability(resource.id, date);
  const loaded = availability.state.status === 'success' && availability.state.data.date === date ? availability.state.data : null;
  const loading = availability.state.status === 'loading' || (availability.state.status === 'success' && loaded === null);
  const slots = loaded?.slots ?? [];

  // The selection and what hangs on it belong to one date. When the date changes the stored state is replaced right
  // away, in the same render (https://react.dev/learn/you-might-not-need-an-effect). Merely ignoring state stored for
  // another date isn't enough: going back to that date would bring its old selection back.
  const [stored, setStored] = useState<DayState>(emptyDay(date));
  const [notice, setNotice] = useState<Notice | null>(null);
  if (stored.date !== date) {
    setStored(emptyDay(date));
    // A warning or error is about that selection, so it goes with it. A success stays: it says what was booked.
    if (notice && notice.variant !== 'success') setNotice(null);
  }
  const day = stored.date === date ? stored : emptyDay(date);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // What can be drawn: the selected slots that are in the grid being shown. While the day is loading there are none,
  // so nothing is shown (or booked) from a grid that isn't there; the selection itself is kept and is back with the grid.
  const shownStarts = new Set(slots.map((slot) => slot.start));
  const selection = day.selected.filter((start) => shownStarts.has(start));

  // The latest values, for code that runs after an `await`.
  const latest = useRef({ date, selection, slots });
  useEffect(() => {
    latest.current = { date, selection, slots };
  });
  const submittingRef = useRef(false);

  const headingId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const nextDayRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const focusGrid = useCallback(() => gridRef.current?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus(), []);
  // After "Try again" on the grid: the first slot on success, the message on failure.
  const markRetry = useRetryFocus(availability.state.status, focusGrid, () => errorRef.current?.focus());

  // After the user's own action, focus moves to its result (DESIGN.md §7). This runs after a closing dialog has
  // returned focus to its trigger, so it has the last word.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  // The resource can be deactivated while someone is looking at it: the availability then answers 404.
  const availabilityError = availability.state.status === 'error' ? availability.state.error : null;
  const gone = availabilityError?.status === 404;
  useEffect(() => {
    if (gone) onResourceChanged();
  }, [gone, onResourceChanged]);

  const visibleNotice = notice && (notice.variant === 'success' || notice.date === date) ? notice : null;
  const count = selection.length;
  const ranges = toRanges(slots, selection);
  const hasOpenSlot = slots.some((slot) => slot.status === 'available');
  const hasOwnSlot = slots.some((slot) => slot.mine);
  const dateText = dateLabel(date);

  function updateDay(patch: Partial<Omit<DayState, 'date'>>, forDate = date) {
    setStored((previous) => ({ ...(previous.date === forDate ? previous : emptyDay(forDate)), ...patch, date: forDate }));
  }

  /** A warning or error about the selection is out of date once the selection changes. A success stays. */
  function dropStaleNotice() {
    setNotice((current) => (current && current.variant !== 'success' ? null : current));
  }

  function changeDate(next: string) {
    setSearchParams({ date: next });
  }

  function handleToggle(slot: AvailabilitySlot) {
    if (refreshing || slot.status !== 'available') return;
    const result = toggleSelection(selection, slots, slot.start);
    if (result.limitReached) {
      updateDay({ limitHit: day.limitHit + 1 });
      return;
    }
    updateDay({ selected: result.selected, justTaken: [], limitHit: 0 });
    dropStaleNotice();
  }

  function handleRemove(range: { start: string; end: string }) {
    updateDay({ selected: removeRange(selection, range), justTaken: [], limitHit: 0 });
    dropStaleNotice();
  }

  function handleClear() {
    updateDay({ selected: [], justTaken: [], limitHit: 0 });
    dropStaleNotice();
  }

  function handleReview() {
    if (refreshing || count === 0) return;
    setFailure(null);
    setConfirming(true);
  }

  /**
   * After a refusal (DESIGN.md §5.6): fetch the day again, drop the selected slots that are gone, keep every other
   * one, draw the slots that were just taken, and explain it above the grid. Nothing is booked automatically.
   */
  async function resolveConflict(requestDate: string, conflicts: SlotConflict[]) {
    setRefreshing(true);
    try {
      const fresh = await availability.refresh();
      if (fresh === null || latest.current.date !== requestDate) return; // the user moved on
      const { kept } = afterConflict(latest.current.selection, fresh.slots, conflicts);
      updateDay({ selected: kept, justTaken: justTakenStarts(fresh.slots, conflicts), limitHit: 0 }, requestDate);
      setNotice({ variant: 'warning', ...conflictNotice(fresh.slots, conflicts, kept.length), date: requestDate });
    } catch (error) {
      if (latest.current.date !== requestDate) return;
      if (error instanceof ApiError && error.status === 401) return; // signed out: the route guard takes over
      setNotice({
        variant: 'danger',
        title: "We couldn't refresh the times",
        text: 'Some of the times you chose were no longer available, so nothing was booked. Your selections are unchanged. Check your connection, then try again.',
        date: requestDate,
        conflicts,
      });
    } finally {
      setRefreshing(false);
    }
  }

  function handleBooked(booking: Booking, requestDate: string, slotsAtRequest: AvailabilitySlot[]) {
    setConfirming(false);
    const spans = toRanges(slotsAtRequest, booking.slotStarts);
    const times = spans.length > 0 ? spans.map(rangeLabel).join(', ') : `${timeLabel(booking.start)}–${timeLabel(booking.end)} IST`;
    setNotice({
      variant: 'success',
      title: `Booking confirmed · ${booking.resource.name} · ${dateLabel(booking.date)} · ${times}`,
      text: 'The times now show as Your booking.',
      date: booking.date,
    });
    if (latest.current.date !== requestDate) return;
    availability.applyBooking(booking);
    updateDay({ selected: [], justTaken: [], limitHit: 0 }, requestDate);
    // Show what other people changed too. The booking itself already stands: a failed refresh is no failed booking.
    availability.refresh().catch(() => undefined);
  }

  async function handleConfirm() {
    if (submittingRef.current || count === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFailure(null);
    const requestDate = date;
    const slotsAtRequest = slots;
    try {
      handleBooked(await createBooking(resource.id, selection), requestDate, slotsAtRequest);
    } catch (error) {
      const conflicts = conflictsOf(error);
      if (conflicts) {
        setConfirming(false);
        void resolveConflict(requestDate, conflicts);
      } else if (error instanceof ApiError && error.status === 401) {
        // The session ended. apiFetch has told the route guard, which sends the user to sign in and back here.
      } else if (error instanceof ApiError && error.status === 404) {
        setConfirming(false);
        onResourceChanged(); // deactivated meanwhile: the page shows what is true now
      } else if (error instanceof ApiError && error.status === 400) {
        const reason = error.fields.slotStarts ?? 'The request was not accepted.';
        setFailure({
          title: "We couldn't book these times",
          text: `${reason}${/[.!?]$/.test(reason) ? '' : '.'} Nothing was booked. Go back and choose again.`,
        });
      } else if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        // Any other 4xx is the server refusing the request before it changed anything.
        setFailure({ title: "We couldn't complete your booking", text: 'Nothing was booked. Try again.' });
      } else {
        // No answer, or a 5xx: neither says "no". The server may have committed before the answer was lost, or before it
        // failed while building the reply, so don't claim nothing was booked. Refresh so the grid shows a booking that stood.
        const noAnswer = !(error instanceof ApiError) || error.status === 0;
        setFailure({
          title: "We couldn't confirm your booking",
          text: noAnswer
            ? "We couldn't reach the server, so we can't tell if it went through. Check your connection and try again. If these times now show as Your booking, it did."
            : "The server ran into a problem, so we can't tell if it went through. Try again. If these times now show as Your booking, it did.",
        });
        availability.refresh().catch(() => undefined);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function dismissNotice() {
    setNotice(null);
    document.querySelector<HTMLElement>('main h1')?.focus(); // the message is about to disappear
  }

  const statusText = day.limitHit > 0 ? LIMIT_TEXT : count > 0 ? `${slotCountLabel(count)} selected` : 'No times selected';

  const summaryProps = {
    dateText,
    ranges,
    count,
    limitHit: day.limitHit > 0,
    updating: refreshing,
    onReview: handleReview,
    onRemove: handleRemove,
    onClear: handleClear,
    onFocusGrid: focusGrid,
  };

  let gridArea;
  if (loading) {
    gridArea = <LoadingGrid />;
  } else if (availabilityError && !gone) {
    gridArea = (
      <Message
        ref={errorRef}
        variant="danger"
        role="alert"
        title="We couldn't load the times"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              markRetry();
              availability.reload();
            }}
          >
            Try again
          </Button>
        }
      >
        Check your connection, then try again. If this keeps happening, the server may be down.
      </Message>
    );
  } else if (loaded && !hasOpenSlot && !hasOwnSlot) {
    gridArea = (
      <EmptyState
        title={`No free times on ${shortDateLabel(date)}`}
        action={
          date < maxDate ? (
            <Button
              variant="secondary"
              onClick={() => {
                changeDate(addDays(date, 1));
                nextDayRef.current?.focus(); // this button is about to disappear
              }}
            >
              Next day
            </Button>
          ) : undefined
        }
      >
        Every time that day is booked or has already started.
      </EmptyState>
    );
  } else if (loaded) {
    gridArea = (
      <div className="space-y-4">
        {!hasOpenSlot ? (
          <Message variant="info" title={`No free times left on ${shortDateLabel(date)}`}>
            The times that are yours are marked below.
          </Message>
        ) : null}
        <SlotLegend showJustTaken={day.justTaken.length > 0} />
        <SlotGrid
          ref={gridRef}
          slots={slots}
          selected={selection}
          justTaken={day.justTaken}
          onToggle={handleToggle}
          busy={refreshing}
          label={`Times on ${dateText}, IST`}
        />
      </div>
    );
  }

  return (
    <div className={count > 0 ? 'pb-36 lg:pb-0' : undefined}>
      {visibleNotice ? (
        <div className="mb-4">
          <Message
            ref={noticeRef}
            variant={visibleNotice.variant}
            title={visibleNotice.title}
            onDismiss={visibleNotice.variant === 'success' ? dismissNotice : undefined}
            action={
              visibleNotice.variant === 'success' ? (
                <Link to="/bookings" className={buttonClasses('secondary')}>
                  View my bookings
                </Link>
              ) : visibleNotice.variant === 'danger' ? (
                <Button
                  variant="secondary"
                  loading={refreshing}
                  loadingLabel="Refreshing…"
                  onClick={() => void resolveConflict(visibleNotice.date, visibleNotice.conflicts)}
                >
                  Try again
                </Button>
              ) : undefined
            }
          >
            {visibleNotice.text}
          </Message>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface p-4 md:p-5">
          <h2 id={headingId} className="mb-4 text-title-section text-fg">
            Choose a date
          </h2>
          <DateControl date={date} today={today} maxDate={maxDate} onChange={changeDate} selectionWillClear={count > 0} nextDayRef={nextDayRef} />
          <div className="mt-5 border-t border-border pt-4">{gridArea}</div>
        </section>

        <div className="hidden lg:sticky lg:top-4 lg:block">
          <SelectionSummary variant="panel" {...summaryProps} />
        </div>
      </div>
      <div className="lg:hidden">
        <SelectionSummary variant="bar" {...summaryProps} />
      </div>

      {/* The one live region for the selection, so the count and the 8-slot limit are read out once. */}
      <p role="status" className="sr-only">
        {/* A new element each time the limit is hit, so a repeated refusal is read out again. */}
        <span key={day.limitHit}>{statusText}</span>
      </p>

      <BookingDialog
        open={confirming && count > 0}
        onClose={() => setConfirming(false)}
        onConfirm={() => void handleConfirm()}
        submitting={submitting}
        failure={failure}
        resource={resource}
        dateText={dateText}
        ranges={ranges}
        count={count}
      />
    </div>
  );
}
