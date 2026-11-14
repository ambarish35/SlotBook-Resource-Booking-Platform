import { afterEach, describe, expect, it } from 'vitest';
import { now, resetClock, setClock } from '../src/lib/clock.js';
import {
  addDays,
  isIstDate,
  isOnSlotGrid,
  istDateOf,
  istDayStart,
  istTimeLabel,
  parseUtcInstant,
  slotEnd,
  slotStartAt,
  slotStartsOn,
} from '../src/lib/time.js';

const iso = (date: Date | null) => date?.toISOString();

describe('IST dates and the PLAN.md §10 examples', () => {
  it('the IST date 2026-11-14 runs from 2026-11-13T18:30Z to 2026-11-14T18:30Z', () => {
    expect(iso(istDayStart('2026-11-14'))).toBe('2026-11-13T18:30:00.000Z');
    expect(iso(istDayStart('2026-11-15'))).toBe('2026-11-14T18:30:00.000Z');
  });

  it('rolls the IST date over at 18:30Z', () => {
    expect(istDateOf(new Date('2026-11-13T18:29:59.999Z'))).toBe('2026-11-13');
    expect(istDateOf(new Date('2026-11-13T18:30:00.000Z'))).toBe('2026-11-14');
    expect(istDateOf(new Date('2026-11-14T18:29:59.999Z'))).toBe('2026-11-14');
    expect(istDateOf(new Date('2026-11-14T18:30:00.000Z'))).toBe('2026-11-15');
  });

  it('08:00 IST is 02:30Z, 19:30 IST is 14:00Z and closing time 20:00 IST is 14:30Z', () => {
    const slots = slotStartsOn('2026-11-14');
    expect(iso(slots[0])).toBe('2026-11-14T02:30:00.000Z');
    expect(iso(slots[23])).toBe('2026-11-14T14:00:00.000Z');
    expect(iso(slotEnd(slots[23]!))).toBe('2026-11-14T14:30:00.000Z');
    expect(iso(slotStartAt('2026-11-14', '08:00'))).toBe('2026-11-14T02:30:00.000Z');
    expect(iso(slotStartAt('2026-11-14', '19:30'))).toBe('2026-11-14T14:00:00.000Z');
  });

  it('has 24 slots a day, 30 minutes apart, each one on the :00 or :30 mark in UTC as well', () => {
    const slots = slotStartsOn('2026-11-14');
    expect(slots).toHaveLength(24);
    slots.forEach((slot, index) => {
      expect([0, 30]).toContain(slot.getUTCMinutes());
      expect(slot.getUTCSeconds() + slot.getUTCMilliseconds()).toBe(0);
      if (index > 0) expect(slot.getTime() - slots[index - 1]!.getTime()).toBe(30 * 60_000);
      expect(isOnSlotGrid(slot)).toBe(true);
      expect(istDateOf(slot)).toBe('2026-11-14');
    });
  });

  it('labels slots with 24-hour IST times', () => {
    const labels = slotStartsOn('2026-11-14').map(istTimeLabel);
    expect(labels[0]).toBe('08:00');
    expect(labels[1]).toBe('08:30');
    expect(labels[4]).toBe('10:00');
    expect(labels[23]).toBe('19:30');
    expect(istTimeLabel(new Date('2026-11-13T18:30:00.000Z'))).toBe('00:00');
    expect(istTimeLabel(new Date('2026-11-14T14:30:00.000Z'))).toBe('20:00');
  });

  it('does not depend on the server timezone or on daylight saving', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = zone;
        // 2026-11-01 is the day US clocks go back; 2026-09-27 is when New Zealand's go forward.
        expect(istDateOf(new Date('2026-11-01T18:30:00.000Z'))).toBe('2026-11-02');
        expect(iso(istDayStart('2026-11-01'))).toBe('2026-10-31T18:30:00.000Z');
        expect(iso(slotStartAt('2026-09-27', '08:00'))).toBe('2026-09-27T02:30:00.000Z');
        expect(istTimeLabel(new Date('2026-09-27T02:30:00.000Z'))).toBe('08:00');
        expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('isIstDate and istDayStart', () => {
  it('accepts real calendar dates', () => {
    for (const date of ['2026-11-14', '2028-02-29', '2026-12-31', '2026-01-01']) expect(isIstDate(date)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const date of [
      '2026-02-30', // no such day
      '2027-02-29', // not a leap year
      '2026-13-01',
      '2026-00-10',
      '2026-11-00',
      '0050-01-01', // Date.UTC would read the year as 1950
      '26-11-14',
      '2026-1-4',
      '2026/11/14',
      '2026-11-14T00:00:00Z',
      ' 2026-11-14',
      '2026-11-14 ',
      '',
      'tomorrow',
    ]) {
      expect(isIstDate(date), JSON.stringify(date)).toBe(false);
      expect(istDayStart(date)).toBeNull();
    }
  });
});

describe('addDays', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays('2026-11-14', 30)).toBe('2026-12-14');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-14', 0)).toBe('2026-11-14');
  });

  it('refuses an invalid date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => slotStartsOn('nope')).toThrow();
  });
});

describe('isOnSlotGrid', () => {
  const at = (text: string) => isOnSlotGrid(new Date(text));

  it('accepts the 24 starts from 08:00 to 19:30 IST', () => {
    expect(at('2026-11-14T02:30:00.000Z')).toBe(true); // 08:00 IST
    expect(at('2026-11-14T04:30:00.000Z')).toBe(true); // 10:00 IST
    expect(at('2026-11-14T05:00:00.000Z')).toBe(true); // 10:30 IST
    expect(at('2026-11-14T14:00:00.000Z')).toBe(true); // 19:30 IST
  });

  it('rejects quarter hours, the half hour before opening, closing time and anything between slots', () => {
    expect(at('2026-11-14T04:45:00.000Z')).toBe(false); // 10:15 IST
    expect(at('2026-11-14T02:00:00.000Z')).toBe(false); // 07:30 IST
    expect(at('2026-11-14T14:30:00.000Z')).toBe(false); // 20:00 IST
    expect(at('2026-11-13T18:30:00.000Z')).toBe(false); // midnight IST
    expect(at('2026-11-14T04:30:01.000Z')).toBe(false); // a second late
    expect(at('2026-11-14T04:30:00.001Z')).toBe(false); // a millisecond late
    expect(at('2026-11-14T10:00:00.000Z')).toBe(true); // 15:30 IST, in the afternoon
  });

  it('rejects an invalid Date', () => {
    expect(isOnSlotGrid(new Date('nope'))).toBe(false);
  });
});

describe('parseUtcInstant', () => {
  it('reads ISO-8601 UTC instants ending in Z', () => {
    expect(iso(parseUtcInstant('2026-11-14T04:30:00.000Z'))).toBe('2026-11-14T04:30:00.000Z');
    expect(iso(parseUtcInstant('2026-11-14T04:30:00Z'))).toBe('2026-11-14T04:30:00.000Z');
    expect(iso(parseUtcInstant('2026-11-14T04:30:00.5Z'))).toBe('2026-11-14T04:30:00.500Z');
  });

  it('rejects offsets, missing Z, other formats and impossible dates', () => {
    for (const text of [
      '2026-11-14T10:00:00+05:30',
      '2026-11-14T04:30:00',
      '2026-11-14',
      '2026-11-14 04:30:00Z',
      '2026-11-14T04:30Z',
      '2026-02-30T04:30:00.000Z',
      '2026-11-14T25:30:00.000Z',
      '2026-11-14T04:61:00.000Z',
      '1700000000000',
      '',
    ]) {
      expect(parseUtcInstant(text), JSON.stringify(text)).toBeNull();
    }
  });
});

describe('clock', () => {
  afterEach(() => {
    resetClock();
  });

  it('can be pinned and restored', () => {
    setClock('2026-11-14T04:00:00.000Z');
    expect(iso(now())).toBe('2026-11-14T04:00:00.000Z');
    expect(iso(now())).toBe('2026-11-14T04:00:00.000Z');

    resetClock();
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('returns a copy, so changing it does not move the pinned time', () => {
    setClock('2026-11-14T04:00:00.000Z');
    now().setUTCFullYear(2000);
    expect(iso(now())).toBe('2026-11-14T04:00:00.000Z');
  });

  it('accepts a function, and refuses an invalid date', () => {
    let current = new Date('2026-11-14T04:00:00.000Z');
    setClock(() => current);
    expect(iso(now())).toBe('2026-11-14T04:00:00.000Z');
    current = new Date('2026-11-14T04:30:00.000Z');
    expect(iso(now())).toBe('2026-11-14T04:30:00.000Z');
    expect(() => setClock('not a date')).toThrow();
  });
});
