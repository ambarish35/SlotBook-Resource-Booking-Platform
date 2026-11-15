import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookingList } from '../components/BookingList';
import { Button, buttonClasses } from '../components/Button';
import { CancelBookingDialog } from '../components/CancelBookingDialog';
import { EmptyState } from '../components/EmptyState';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { SkeletonBlock } from '../components/Skeleton';
import { ViewSwitch } from '../components/ViewSwitch';
import { useSignedInUser } from '../lib/auth';
import { type Booking, LIST_LIMIT, bookingsPath, bookingsSearch, parseScope, parseView, phaseOf } from '../lib/bookings';
import { describeBooking } from '../lib/slots';
import { useBookingList } from '../lib/useBookingList';
import { useNow } from '../lib/useNow';
import { useRetryFocus } from '../lib/useRetryFocus';

/** The result of the user's own action, at the top of the page (DESIGN.md §8). It can be dismissed. */
interface Notice {
  variant: 'success' | 'info';
  title: string;
  text: string;
}

/** Placeholder rows shaped like the table (desktop) and the cards (mobile) while a list loads. */
function LoadingRows() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading bookings…</span>
      <div className="hidden rounded-lg border border-border bg-surface md:block">
        <SkeletonBlock className="h-11 rounded-b-none" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex h-13 items-center gap-6 border-t border-border px-4">
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="h-5 w-16" />
            <SkeletonBlock className="ml-auto h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-lg border border-border bg-surface p-4">
            <SkeletonBlock className="h-6 w-2/3" />
            <SkeletonBlock className="mt-3 h-4 w-1/2" />
            <SkeletonBlock className="mt-2 h-4 w-1/3" />
            <SkeletonBlock className="mt-4 h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * My bookings (DESIGN.md §5.7): the signed-in user's Upcoming and History lists and, for admins, everyone's. The API
 * decides what each list holds and who may cancel what; the page only shows it. Both choices are in the address
 * (`?view=history`, `?scope=all`), so a list can be bookmarked and survives signing in again. A cancellation is sent
 * first and the list shows what the server confirmed.
 */
export function MyBookingsPage() {
  const user = useSignedInUser();
  const isAdmin = user.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('view');
  const rawScope = searchParams.get('scope');
  const view = parseView(rawView);
  const scope = parseScope(rawScope, isAdmin);

  // A value the page can't honour (a typo, or `scope=all` for a member) is dropped from the address.
  useEffect(() => {
    const badView = rawView !== null && rawView !== view;
    const badScope = rawScope !== null && rawScope !== scope;
    if (!badView && !badScope) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (badView) next.delete('view');
        if (badScope) next.delete('scope');
        return next;
      },
      { replace: true },
    );
  }, [rawView, rawScope, view, scope, setSearchParams]);

  const { state, reload, refresh, remove } = useBookingList(bookingsPath(view, scope));
  const bookings = state.status === 'success' ? state.data : null;
  // Re-read the clock when a booking starts or ends, so one that begins while the page is open loses its Cancel button.
  const now = useNow(bookings?.flatMap((booking) => (booking.status === 'confirmed' ? [booking.start, booking.end] : [])) ?? [], bookings);

  const [target, setTarget] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [headingFocus, setHeadingFocus] = useState(0);

  const errorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const markRetry = useRetryFocus(
    state.status,
    () => document.querySelector<HTMLElement>('main h1')?.focus(),
    () => errorRef.current?.focus(),
  );

  // After the user's own action, focus moves to its result (DESIGN.md §7). This effect belongs to the page, so it runs
  // after a closing dialog's own effect has returned focus to its trigger, and so has the last word.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  // Where the button that opened the dialog is gone (the booking changed under it), focus goes to the heading instead.
  useEffect(() => {
    if (headingFocus > 0) document.querySelector<HTMLElement>('main h1')?.focus();
  }, [headingFocus]);

  // An upcoming booking whose end passes while the page is open belongs to History now: fetch the list again so the
  // server says so. Only a rise in the count refreshes, so a clock that disagrees with the server's can't loop.
  const completed = view === 'upcoming' && bookings ? bookings.filter((booking) => phaseOf(booking, now) === 'completed').length : 0;
  const seenCompleted = useRef<number | null>(null);
  useEffect(() => {
    if (!bookings) return;
    if (seenCompleted.current !== null && completed > seenCompleted.current) refresh().catch(() => undefined);
    seenCompleted.current = completed;
  }, [bookings, completed, refresh]);

  const showMember = scope === 'all';

  function handleCancelled(booking: Booking) {
    remove(booking.id); // the server confirmed it: the row leaves Upcoming now, the refresh below brings the rest
    setTarget(null);
    // An admin cancelling someone else's booking is told whose it was. A removed account has an empty email (the API
    // lists it as "Deleted account"): there is nobody left to see it as Cancelled.
    const someoneElses = booking.user.id !== user.id && booking.user.email !== '';
    setNotice({
      variant: 'success',
      title: `Booking cancelled · ${describeBooking(booking)}`,
      text: someoneElses
        ? `${booking.user.name} will see it as Cancelled, and its time slots are available to others again.`
        : 'Its time slots are available to others again.',
    });
    refresh().catch(() => undefined); // a failed refresh is no failed cancellation
  }

  /** After a lost answer, a refresh showed the booking is no longer upcoming: cancelled, or over. */
  function handleGone(booking: Booking) {
    setTarget(null);
    setNotice({
      variant: 'info',
      title: `${describeBooking(booking)} is no longer under Upcoming`,
      text: 'It was cancelled or it has ended. History shows which.',
    });
  }

  function dismissNotice() {
    setNotice(null);
    document.querySelector<HTMLElement>('main h1')?.focus(); // the message is about to disappear
  }

  const scopeItems = [
    { label: 'Mine', to: { search: bookingsSearch(view, 'mine') }, current: scope === 'mine' },
    { label: 'All members', to: { search: bookingsSearch(view, 'all') }, current: scope === 'all' },
  ];
  const viewItems = [
    { label: 'Upcoming', to: { search: bookingsSearch('upcoming', scope) }, current: view === 'upcoming' },
    { label: 'History', to: { search: bookingsSearch('history', scope) }, current: view === 'history' },
  ];
  const caption = `${scope === 'all' ? "All members' " : 'Your '}${view === 'upcoming' ? 'upcoming bookings' : 'booking history'}`;
  const countText = bookings && bookings.length > 0 ? (bookings.length >= LIST_LIMIT ? `Showing the latest ${LIST_LIMIT}` : `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`) : '';

  let content: ReactNode;
  if (state.status === 'error') {
    content = (
      <Message
        ref={errorRef}
        variant="danger"
        role="alert"
        title={scope === 'all' ? "We couldn't load all bookings" : "We couldn't load your bookings"}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              markRetry();
              reload();
            }}
          >
            Try again
          </Button>
        }
      >
        Check your connection, then try again. If this keeps happening, the server may be down.
      </Message>
    );
  } else if (!bookings) {
    content = <LoadingRows />;
  } else if (bookings.length === 0) {
    content =
      view === 'upcoming' ? (
        <EmptyState
          title="No upcoming bookings"
          action={
            scope === 'mine' ? (
              <Link to="/resources" className={buttonClasses('primary')}>
                Find a resource
              </Link>
            ) : undefined
          }
        >
          {scope === 'mine' ? 'When you book a room or a piece of equipment, it will be listed here.' : 'Nobody has an upcoming booking right now.'}
        </EmptyState>
      ) : (
        <EmptyState title="No past or cancelled bookings yet">
          {scope === 'mine'
            ? 'Bookings that have ended, and the ones you cancel, will be listed here.'
            : 'Bookings that have ended or been cancelled will be listed here.'}
        </EmptyState>
      );
  } else {
    content = <BookingList bookings={bookings} now={now} caption={caption} showMember={showMember} onCancel={setTarget} />;
  }

  return (
    <>
      <PageHeader title="My bookings" />

      {notice ? (
        <div className="mb-4">
          <Message
            ref={noticeRef}
            variant={notice.variant}
            title={notice.title}
            onDismiss={dismissNotice}
            action={
              view === 'upcoming' ? (
                <Link to={{ search: bookingsSearch('history', scope) }} className={buttonClasses('secondary')}>
                  Open History
                </Link>
              ) : undefined
            }
          >
            {notice.text}
          </Message>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mb-4">
          <ViewSwitch label="Whose bookings" items={scopeItems} />
        </div>
      ) : null}
      <div className="mb-4">
        <ViewSwitch label="Upcoming or history" items={viewItems} />
      </div>

      {/* Always in the page, so screen readers announce the count when it changes. */}
      <p role="status" className="mb-3 text-label-14 text-fg-secondary">
        {countText}
      </p>

      {content}

      <CancelBookingDialog
        booking={target}
        showMember={showMember}
        refresh={refresh}
        onClose={(settled) => {
          setTarget(null);
          if (settled) setHeadingFocus((count) => count + 1);
        }}
        onCancelled={handleCancelled}
        onGone={handleGone}
      />
    </>
  );
}
