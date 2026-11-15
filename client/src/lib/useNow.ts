import { useEffect, useState } from 'react';

/** The longest the page goes without looking at the clock again, so a changed clock or a long sleep is noticed. */
const MAX_WAIT_MS = 60_000;
/** Look just after an instant, not on it, so the clock has certainly passed it. */
const MARGIN_MS = 500;

/**
 * The current time in epoch milliseconds, read again when one of `instants` (ISO strings) goes by, whenever `version`
 * changes (pass the data the instants come from, so a list that was just replaced is judged by the clock of that
 * moment), when the tab becomes visible again (a hidden tab's timers are throttled), and at least once a minute. A
 * screen that says "starts later" or "in progress" stays true while it is open: a booking that begins while the list
 * is on screen loses its Cancel button at that moment. The browser's clock, so only a snapshot: the API has the last
 * word on whether a booking can still be cancelled.
 */
export function useNow(instants: readonly string[], version?: unknown): number {
  const [now, setNow] = useState(() => Date.now());
  const key = instants.join(' ');

  useEffect(() => {
    setNow(Date.now());
  }, [version]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const times = key === '' ? [] : key.split(' ').map((instant) => Date.parse(instant));
    const current = Date.now();
    // An instant went by since `now` was read (the list changed, or a timer ran late): catch up straight away.
    if (times.some((time) => time > now && time <= current)) {
      setNow(current);
      return;
    }
    const next = Math.min(Infinity, ...times.filter((time) => time > current));
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - current + MARGIN_MS, MAX_WAIT_MS));
    return () => clearTimeout(timer);
  }, [key, now]);

  return now;
}
