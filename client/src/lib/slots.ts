import { type AvailabilitySlot, type Booking, MAX_SLOTS, type SlotConflict } from './bookings';
import { shortDateLabel, timeLabel } from './ist';

/** The three labelled groups of 8 slots (DESIGN.md §5.4): 08:00–11:30, 12:00–15:30 and 16:00–19:30. */
export const SLOT_GROUPS = [
  { label: 'Morning', from: 0 },
  { label: 'Afternoon', from: 8 },
  { label: 'Evening', from: 16 },
] as const;
export const SLOTS_PER_GROUP = 8;

/** Consecutive selected slots merged into one span, such as 10:00–11:00. */
export interface TimeRange {
  /** ISO start of the first slot and ISO end of the last. */
  start: string;
  end: string;
  /** How many 30-minute slots the span holds. */
  count: number;
  /** "10:00–11:00" (without "IST"). */
  text: string;
}

/** "10:00–11:00 IST": every time the UI shows says which zone it is in. */
export function rangeLabel(range: Pick<TimeRange, 'text'>): string {
  return `${range.text} IST`;
}

/**
 * The slots in `starts`, merged into spans of consecutive slots, in time order. Two slots are consecutive when
 * the first one's end is the second one's start, as the API reports them.
 */
export function toRanges(slots: readonly Pick<AvailabilitySlot, 'start' | 'end'>[], starts: readonly string[]): TimeRange[] {
  const wanted = new Set(starts);
  const spans: Omit<TimeRange, 'text'>[] = [];
  for (const slot of slots) {
    if (!wanted.has(slot.start)) continue;
    const last = spans[spans.length - 1];
    if (last && last.end === slot.start) {
      last.end = slot.end;
      last.count += 1;
    } else {
      spans.push({ start: slot.start, end: slot.end, count: 1 });
    }
  }
  return spans.map((span) => ({ ...span, text: `${timeLabel(span.start)}–${timeLabel(span.end)}` }));
}

const SLOT_MS = 30 * 60_000;

/**
 * A booking's slots merged into spans of consecutive slots. A booking may hold slots that aren't consecutive (10:00
 * and 14:00), so it can have several. Each slot is 30 minutes long (PLAN.md §10).
 */
export function bookingRanges(booking: Pick<Booking, 'slotStarts'>): TimeRange[] {
  const slots = booking.slotStarts.map((start) => ({
    start: new Date(start).toISOString(),
    end: new Date(Date.parse(start) + SLOT_MS).toISOString(),
  }));
  return toRanges(
    slots,
    slots.map((slot) => slot.start),
  );
}

/** "Room A · Sat, 14 Nov · 10:00–11:00 IST": a booking in the title of a message (DESIGN.md §5.7). */
export function describeBooking(booking: Booking): string {
  const times = bookingRanges(booking).map(rangeLabel).join(', ');
  return `${booking.resource.name} · ${shortDateLabel(booking.date)} · ${times}`;
}

/** "Room A, Sat 14 Nov, 10:00–11:00 IST": the same, for screen-reader-only text after a button's visible label. */
export function spokenBooking(booking: Booking): string {
  const times = bookingRanges(booking).map(rangeLabel).join(' and ');
  return `${booking.resource.name}, ${shortDateLabel(booking.date).replace(',', '')}, ${times}`;
}

/** "30 min", "1 h", "1 h 30 min": the length of `count` 30-minute slots. */
export function durationLabel(count: number): string {
  const minutes = count * 30;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours > 0 ? `${hours} h` : '', rest > 0 ? `${rest} min` : ''].filter(Boolean).join(' ');
}

export function slotCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'slot' : 'slots'}`;
}

/** The start strings of the slots in grid order, so a selection is always sorted the way the grid is drawn. */
function inGridOrder(slots: readonly AvailabilitySlot[], starts: ReadonlySet<string>): string[] {
  return slots.filter((slot) => starts.has(slot.start)).map((slot) => slot.start);
}

/**
 * Selects `start`, or deselects it when it is selected already. The 9th slot is refused: the selection stays as it
 * was and `limitReached` is true (DESIGN.md §5.5). Whether a slot may be selected at all is the caller's business.
 */
export function toggleSelection(
  selected: readonly string[],
  slots: readonly AvailabilitySlot[],
  start: string,
): { selected: string[]; limitReached: boolean } {
  if (selected.includes(start)) return { selected: selected.filter((item) => item !== start), limitReached: false };
  if (selected.length >= MAX_SLOTS) return { selected: [...selected], limitReached: true };
  return { selected: inGridOrder(slots, new Set([...selected, start])), limitReached: false };
}

/** Removes every selected slot that falls inside `range`. */
export function removeRange(selected: readonly string[], range: Pick<TimeRange, 'start' | 'end'>): string[] {
  const from = Date.parse(range.start);
  const to = Date.parse(range.end);
  return selected.filter((start) => {
    const time = Date.parse(start);
    return time < from || time >= to;
  });
}

/**
 * Sorts a selection after the server refused it (DESIGN.md §5.6). `removed` are the selected slots the refusal named
 * and the selected slots that the refreshed grid no longer offers; `kept` is every other selection, which stays.
 */
export function afterConflict(
  selected: readonly string[],
  freshSlots: readonly AvailabilitySlot[],
  conflicts: readonly SlotConflict[],
): { kept: string[]; removed: string[] } {
  const gone = new Set(conflicts.map((conflict) => conflict.start));
  for (const slot of freshSlots) if (slot.status !== 'available') gone.add(slot.start);
  return {
    kept: selected.filter((start) => !gone.has(start)),
    removed: selected.filter((start) => gone.has(start)),
  };
}

/**
 * The slots to draw as "Just taken": the ones the server reported as booked that the refreshed grid shows as held
 * by someone. A slot that was freed again in the meantime is simply available, and one that has started is Past.
 */
export function justTakenStarts(freshSlots: readonly AvailabilitySlot[], conflicts: readonly SlotConflict[]): string[] {
  const booked = new Set(conflicts.filter((conflict) => conflict.reason === 'booked').map((conflict) => conflict.start));
  return freshSlots.filter((slot) => booked.has(slot.start) && slot.status === 'unavailable').map((slot) => slot.start);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The warning shown after a refused booking (DESIGN.md §5.6): which times were taken, or have started, that nothing
 * was booked, and what happened to the rest of the selection.
 */
export function conflictNotice(
  slots: readonly AvailabilitySlot[],
  conflicts: readonly SlotConflict[],
  keptCount: number,
): { title: string; text: string } {
  // A slot the refreshed grid shows as the caller's own is theirs, not "someone else's": it happens when an earlier
  // request did go through but its answer never arrived, or the same booking was made in another tab.
  const mineStarts = new Set(slots.filter((slot) => slot.mine).map((slot) => slot.start));
  const named = (keep: (conflict: SlotConflict) => boolean) =>
    toRanges(
      slots,
      conflicts.filter(keep).map((conflict) => conflict.start),
    ).map(rangeLabel);

  const sentences: string[] = [];
  const booked = named((conflict) => conflict.reason === 'booked' && !mineStarts.has(conflict.start));
  const yours = named((conflict) => conflict.reason === 'booked' && mineStarts.has(conflict.start));
  const started = named((conflict) => conflict.reason === 'past');
  if (booked.length > 0) sentences.push(`${joinList(booked)} ${booked.length === 1 ? 'was' : 'were'} booked by someone else while you were choosing.`);
  if (yours.length > 0) sentences.push(`${joinList(yours)} ${yours.length === 1 ? 'is' : 'are'} already your booking.`);
  if (started.length > 0) sentences.push(`${joinList(started)} ${started.length === 1 ? 'has' : 'have'} already started.`);
  if (sentences.length === 0) sentences.push('Some of the times you chose are no longer available.');
  sentences.push('Nothing was booked.');
  sentences.push(
    keptCount > 0
      ? `We refreshed the times and kept your other ${keptCount} ${keptCount === 1 ? 'selection' : 'selections'}.`
      : 'None of your selected times are available now. Choose other times.',
  );
  return { title: 'Some times are no longer available', text: sentences.join(' ') };
}

/** Where the grid's single tab stop starts: the first selected slot, else the first available one, else the first. */
export function defaultTabStop(slots: readonly AvailabilitySlot[], selected: readonly string[]): number {
  const chosen = slots.findIndex((slot) => selected.includes(slot.start));
  if (chosen >= 0) return chosen;
  const open = slots.findIndex((slot) => slot.status === 'available');
  return open >= 0 ? open : 0;
}
