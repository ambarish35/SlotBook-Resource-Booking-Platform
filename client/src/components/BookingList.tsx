import { type Booking, type BookingPhase, phaseOf } from '../lib/bookings';
import { dateLabel } from '../lib/ist';
import { TYPE_LABEL } from '../lib/resources';
import { bookingRanges, durationLabel, rangeLabel, slotCountLabel, spokenBooking } from '../lib/slots';
import { Button } from './Button';
import { Lozenge, type LozengeTone } from './Lozenge';
import { Tag } from './Tag';

interface BookingListProps {
  bookings: Booking[];
  /** The time, in epoch milliseconds, that each row's status is worked out against (see `useNow`). */
  now: number;
  /** The table's accessible name, which says which list it is. */
  caption: string;
  /** Adds who made each booking: the admin's All members view. */
  showMember: boolean;
  onCancel: (booking: Booking) => void;
}

/** "Confirmed" is a booking that hasn't started; the others follow DESIGN.md §4 Badges. */
const STATUS: Record<BookingPhase, { label: string; tone: LozengeTone }> = {
  upcoming: { label: 'Confirmed', tone: 'success' },
  'in-progress': { label: 'In progress', tone: 'accent' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function StatusLozenge({ phase }: { phase: BookingPhase }) {
  const { label, tone } = STATUS[phase];
  return <Lozenge tone={tone}>{label}</Lozenge>;
}

/** Each run of consecutive slots on its own line: a booking may hold times that aren't consecutive. */
function Times({ booking, suffix }: { booking: Booking; suffix: boolean }) {
  return (
    <ul className="space-y-0.5 tabular-nums">
      {bookingRanges(booking).map((range) => (
        // A range stays on one line: "10:00–" at the end of one line and "11:00" on the next reads as two times.
        <li key={range.start} className="whitespace-nowrap">
          {suffix ? rangeLabel(range) : range.text}
        </li>
      ))}
    </ul>
  );
}

function Member({ booking }: { booking: Booking }) {
  return (
    <>
      <span className="block text-label-14 break-words">{booking.user.name}</span>
      {booking.user.email ? <span className="block text-label-13 break-words text-fg-secondary">{booking.user.email}</span> : null}
    </>
  );
}

// Tighter at 768 px, where up to seven columns have to fit without scrolling; roomier from 1024 px.
const headerCell = 'px-2.5 py-3 text-label-14 text-fg-secondary lg:px-4';
const cell = 'px-2.5 py-3 align-middle text-copy-14 text-fg lg:px-4';

/**
 * The bookings as a table from 768 px and as cards below it, with no horizontal scrolling (DESIGN.md §4 Tables,
 * §5.7). Both are in the page; CSS shows one, and the hidden one is out of the accessibility tree. Only a booking that
 * hasn't started has a Cancel button: the visible word comes first and the booking follows for screen readers only, so
 * every button in the list has its own name.
 */
export function BookingList({ bookings, now, caption, showMember, onCancel }: BookingListProps) {
  return (
    <>
      {/* relative: the screen-reader-only text is absolutely positioned, so this must contain it or it escapes the scroll area and widens the page. */}
      <div className="relative hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-subtle">
            <tr>
              <th scope="col" className={headerCell}>
                Resource
              </th>
              <th scope="col" className={headerCell}>
                Date
              </th>
              <th scope="col" className={headerCell}>
                Time (IST)
              </th>
              <th scope="col" className={headerCell}>
                Duration
              </th>
              <th scope="col" className={headerCell}>
                Status
              </th>
              {showMember ? (
                <th scope="col" className={headerCell}>
                  Booked by
                </th>
              ) : null}
              <th scope="col" className={`${headerCell} text-right`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((booking) => {
              const phase = phaseOf(booking, now);
              return (
                <tr key={booking.id} className="h-13">
                  <th scope="row" className={`${cell} font-medium`}>
                    <span className="block text-label-14 break-words">{booking.resource.name}</span>
                    <span className="mt-1 block">
                      <Tag>{TYPE_LABEL[booking.resource.type]}</Tag>
                    </span>
                  </th>
                  <td className={`${cell} tabular-nums`}>{dateLabel(booking.date)}</td>
                  <td className={cell}>
                    <Times booking={booking} suffix={false} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{durationLabel(booking.slotStarts.length)}</td>
                  <td className={cell}>
                    <StatusLozenge phase={phase} />
                  </td>
                  {showMember ? (
                    <td className={cell}>
                      <Member booking={booking} />
                    </td>
                  ) : null}
                  <td className={`${cell} text-right`}>
                    {phase === 'upcoming' ? (
                      <Button variant="secondary" size="compact" aria-haspopup="dialog" onClick={() => onCancel(booking)}>
                        Cancel<span className="sr-only"> booking: {spokenBooking(booking)}</span>
                      </Button>
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">No actions</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {bookings.map((booking) => {
          const phase = phaseOf(booking, now);
          return (
            <li key={booking.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-title-card break-words text-fg">{booking.resource.name}</h2>
                <StatusLozenge phase={phase} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Tag>{TYPE_LABEL[booking.resource.type]}</Tag>
                <p className="min-w-0 text-label-13 break-words text-fg-secondary">{booking.resource.location}</p>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-copy-14">
                <dt className="text-fg-secondary">Date</dt>
                <dd className="text-fg tabular-nums">{dateLabel(booking.date)}</dd>
                <dt className="text-fg-secondary">{bookingRanges(booking).length === 1 ? 'Time' : 'Times'}</dt>
                <dd className="text-fg">
                  <Times booking={booking} suffix />
                </dd>
                <dt className="text-fg-secondary">Duration</dt>
                <dd className="text-fg tabular-nums">
                  {durationLabel(booking.slotStarts.length)} · {slotCountLabel(booking.slotStarts.length)}
                </dd>
                {showMember ? (
                  <>
                    <dt className="text-fg-secondary">Booked by</dt>
                    <dd className="min-w-0 text-fg">
                      <Member booking={booking} />
                    </dd>
                  </>
                ) : null}
              </dl>
              {phase === 'upcoming' ? (
                <div className="mt-4">
                  <Button variant="secondary" fullWidth aria-haspopup="dialog" onClick={() => onCancel(booking)}>
                    Cancel booking<span className="sr-only">: {spokenBooking(booking)}</span>
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
