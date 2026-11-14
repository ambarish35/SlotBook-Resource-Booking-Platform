/*
 * Time helpers (PLAN.md §10). Every instant is a UTC Date; business dates and times are IST (Asia/Kolkata).
 * IST is a fixed offset of UTC+05:30 with no daylight saving, so a constant 330-minute offset is enough.
 * Nothing here reads the server's timezone, and the current time comes from lib/clock.ts.
 */

export const TIME_ZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;
export const SLOT_MINUTES = 30;
/** 24 slots a day: the first starts at 08:00 IST and the last at 19:30 IST (closing time is 20:00). */
export const SLOTS_PER_DAY = 24;
export const FIRST_SLOT_MINUTE = 8 * 60;
export const MAX_SLOTS_PER_BOOKING = 8;
export const MAX_DAYS_AHEAD = 30;

const MINUTE_MS = 60_000;
const SLOT_MS = SLOT_MINUTES * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * MINUTE_MS;

const IST_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** The IST calendar date (`YYYY-MM-DD`) that an instant falls on. 2026-11-13T18:30Z is already 2026-11-14. */
export function istDateOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant of midnight at the start of an IST date, or null if `date` isn't a real `YYYY-MM-DD` date. */
export function istDayStart(date: string): Date | null {
  const match = IST_DATE.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-30 over to March and maps years 0-99 to 1900-1999; a round trip rejects both.
  if (utcMidnight.toISOString().slice(0, 10) !== date) return null;
  return new Date(utcMidnight.getTime() - IST_OFFSET_MS);
}

export function isIstDate(date: string): boolean {
  return istDayStart(date) !== null;
}

/** The IST date `days` days after (or, if negative, before) `date`. `date` must be a valid IST date. */
export function addDays(date: string, days: number): string {
  const start = istDayStart(date);
  if (!start) throw new Error(`Not an IST date: ${date}`);
  return istDateOf(new Date(start.getTime() + days * DAY_MS));
}

/** The last IST date a booking can be made for, when `today` is the current IST date (PLAN.md §8: today to today + 30). */
export function lastBookableDate(today: string): string {
  return addDays(today, MAX_DAYS_AHEAD);
}

/** The 24 slot starts of an IST date, 08:00 to 19:30. `date` must be a valid IST date. */
export function slotStartsOn(date: string): Date[] {
  const dayStart = istDayStart(date);
  if (!dayStart) throw new Error(`Not an IST date: ${date}`);
  const first = dayStart.getTime() + FIRST_SLOT_MINUTE * MINUTE_MS;
  return Array.from({ length: SLOTS_PER_DAY }, (_, index) => new Date(first + index * SLOT_MS));
}

export function slotEnd(start: Date): Date {
  return new Date(start.getTime() + SLOT_MS);
}

/** The IST wall-clock time of an instant as 24-hour `HH:mm`, for example `08:00`. */
export function istTimeLabel(instant: Date): string {
  const minuteOfDay = Math.floor((((instant.getTime() + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / MINUTE_MS);
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const minutes = String(minuteOfDay % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** The instant of the slot that starts at `time` (`HH:mm`, IST) on an IST date, or null if either is invalid. */
export function slotStartAt(date: string, time: string): Date | null {
  const dayStart = istDayStart(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dayStart || !match) return null;
  const start = new Date(dayStart.getTime() + (Number(match[1]) * 60 + Number(match[2])) * MINUTE_MS);
  return isOnSlotGrid(start) ? start : null;
}

/**
 * True for the 24 slot starts of a day: on the :00 or :30 mark with no seconds or milliseconds, between
 * 08:00 and 19:30 IST. +05:30 is a multiple of 30 minutes, so "on the half hour" means the same in UTC and IST.
 */
export function isOnSlotGrid(instant: Date): boolean {
  const ms = instant.getTime();
  if (!Number.isInteger(ms) || ms % SLOT_MS !== 0) return false;
  const minuteOfDay = (((ms + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / MINUTE_MS;
  return minuteOfDay >= FIRST_SLOT_MINUTE && minuteOfDay <= FIRST_SLOT_MINUTE + (SLOTS_PER_DAY - 1) * SLOT_MINUTES;
}

/**
 * Parses an ISO-8601 UTC instant as the API sends it (`2026-11-14T04:30:00.000Z`, the `Z` is required, the
 * fraction is optional). Anything else, including an offset like `+05:30` or an impossible date, gives null.
 */
export function parseUtcInstant(text: string): Date | null {
  if (!UTC_INSTANT.test(text)) return null;
  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return null;
  // `new Date` can accept a day or hour that doesn't exist and roll it over; compare the date and time back.
  return instant.toISOString().slice(0, 19) === text.slice(0, 19) ? instant : null;
}
