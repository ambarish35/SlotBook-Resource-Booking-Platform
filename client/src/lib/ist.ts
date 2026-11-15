/*
 * Business times are IST, a fixed UTC+05:30 with no daylight saving (PLAN.md §10). The browser's own time zone is
 * never used: "today" and every label come from here, so a visitor in another zone sees the same day and times.
 * Dates are `YYYY-MM-DD` strings (IST calendar dates); instants are ISO-8601 UTC strings, as the API sends them.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** How far ahead a slot can be booked, counted from today (PLAN.md §10). The API enforces it as well. */
export const MAX_DAYS_AHEAD = 30;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Always IST, 24-hour "HH:mm" (PLAN.md §10 Display). `hourCycle: 'h23'` keeps midnight "00:00", never "24:00".
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The IST calendar date of an instant (a Date, epoch milliseconds or ISO string). */
export function istDateOf(instant: Date | number | string): string {
  return new Date(new Date(instant).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today in IST. */
export function todayIst(): string {
  return istDateOf(Date.now());
}

/** True for a real calendar date written `YYYY-MM-DD` (2026-02-30 and 0999-01-01 are not). */
export function isIstDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** The date `days` after `date` (before it when negative). */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** "Sat, 14 Nov 2026" for an IST date. The names are fixed English, so they don't depend on the browser's locale data. */
export function dateLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]}, ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** "Sat, 14 Nov" for an IST date, for places where the year would only add noise. */
export function shortDateLabel(date: string): string {
  return dateLabel(date).replace(/ \d{4}$/, '');
}

/** "10:30": the IST wall-clock time of an instant. */
export function timeLabel(instant: string): string {
  return timeFormat.format(new Date(instant));
}
