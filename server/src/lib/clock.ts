/**
 * The one place the server reads the current time (PLAN.md §10, "Testability").
 * Business rules ("is this slot in the past?", "has this booking started?", "what is today in IST?") call
 * `now()` instead of `new Date()` or `Date.now()`, so tests can pin the time.
 */
type Clock = () => Date;

const systemClock: Clock = () => new Date();
let clock: Clock = systemClock;

/** The current instant. Each call returns a new Date, so a caller can't change the pinned time by mutating it. */
export function now(): Date {
  return new Date(clock().getTime());
}

/** For tests: pins the time to a fixed instant, or to whatever a function returns on each call. */
export function setClock(next: Date | string | Clock): void {
  if (typeof next === 'function') {
    clock = next;
    return;
  }
  const pinned = new Date(next).getTime();
  if (Number.isNaN(pinned)) throw new Error('setClock needs a valid date');
  clock = () => new Date(pinned);
}

/** For tests: goes back to the system clock. */
export function resetClock(): void {
  clock = systemClock;
}
