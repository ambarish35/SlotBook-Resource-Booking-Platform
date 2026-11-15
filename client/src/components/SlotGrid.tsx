import { type KeyboardEvent, type Ref, useId, useRef, useState } from 'react';
import type { AvailabilitySlot } from '../lib/bookings';
import { timeLabel } from '../lib/ist';
import { SLOTS_PER_GROUP, SLOT_GROUPS, defaultTabStop } from '../lib/slots';
import { useMediaQuery } from '../lib/useMediaQuery';
import { TickIcon } from './icons';

/** What a slot looks like (DESIGN.md §6). Each one also has a word, so color is never the only cue. */
type SlotKind = 'available' | 'selected' | 'booked' | 'mine' | 'justTaken' | 'past';

const KIND_STYLE: Record<SlotKind, string> = {
  available: 'border-border-strong bg-surface text-fg hover:border-accent hover:bg-accent-subtle',
  selected: 'border-accent bg-accent text-white hover:bg-accent-hover',
  booked: 'border-transparent bg-surface-subtle text-fg-secondary',
  mine: 'border-transparent bg-accent-subtle text-accent-hover',
  justTaken: 'border-warning bg-warning-subtle text-warning',
  past: 'border-dashed border-border bg-transparent text-fg-muted',
};

const KIND_WORD: Record<SlotKind, string | null> = {
  available: null,
  selected: 'Selected',
  booked: 'Booked',
  mine: 'Your booking',
  justTaken: 'Just taken',
  past: 'Past',
};

/** The suffix of a slot's accessible name. "Selected" has none: `aria-pressed` already says so. */
const KIND_NAME_SUFFIX: Record<SlotKind, string> = {
  available: '',
  selected: '',
  booked: ', booked',
  mine: ', your booking',
  justTaken: ', just taken',
  past: ', past',
};

/**
 * `past` wins over everything, as the API orders it. A slot that is not available is never drawn as selected, even
 * if it still sits in the selection: the grid shows what the server last said.
 */
function kindOf(slot: AvailabilitySlot, selected: ReadonlySet<string>, justTaken: ReadonlySet<string>): SlotKind {
  if (slot.status === 'past') return 'past';
  if (slot.status === 'unavailable') return slot.mine ? 'mine' : justTaken.has(slot.start) ? 'justTaken' : 'booked';
  return selected.has(slot.start) ? 'selected' : 'available';
}

const LEGEND: { kind: SlotKind; label: string }[] = [
  { kind: 'available', label: 'Available' },
  { kind: 'selected', label: 'Selected' },
  { kind: 'booked', label: 'Booked' },
  { kind: 'mine', label: 'Your booking' },
  { kind: 'past', label: 'Past' },
];

/** The key above the grid (DESIGN.md §6). "Just taken" is listed only while a slot is drawn that way. */
export function SlotLegend({ showJustTaken }: { showJustTaken: boolean }) {
  const items = showJustTaken ? [...LEGEND.slice(0, 4), { kind: 'justTaken' as const, label: 'Just taken' }, LEGEND[4]!] : LEGEND;
  return (
    <ul aria-label="Key to the times" className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map(({ kind, label }) => (
        <li key={kind} className="flex items-center gap-2 text-label-13 text-fg-secondary">
          <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${KIND_STYLE[kind]}`}>
            {kind === 'selected' ? <TickIcon size={14} /> : null}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

interface SlotGridProps {
  slots: AvailabilitySlot[];
  /** Start strings of the selected slots. */
  selected: readonly string[];
  /** Start strings of the slots to draw as "Just taken". */
  justTaken: readonly string[];
  /** Click, Space or Enter on a slot. The page decides what each slot may do; this only reports. */
  onToggle: (slot: AvailabilitySlot) => void;
  /** The grid is being refreshed. */
  busy: boolean;
  /** Names the whole grid for screen readers. */
  label: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The day's 24 slots in three labelled groups (DESIGN.md §5.4). The whole grid is one Tab stop (a roving
 * `tabindex`); the arrow keys, Home and End move between slots (DESIGN.md §7). Unavailable and past slots take
 * focus and say what they are, but they can't be toggled.
 */
export function SlotGrid({ slots, selected, justTaken, onToggle, busy, label, ref }: SlotGridProps) {
  const idPrefix = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // Where the user last put focus. Until then the tab stop is the first selected or first available slot.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  // Up and Down move by a row, so they need the number of columns as drawn: 8 from 1024 px, 4 below.
  const columns = useMediaQuery('(min-width: 1024px)') ? 8 : 4;

  const selectedSet = new Set(selected);
  const justTakenSet = new Set(justTaken);
  const tabStop = focusIndex !== null && focusIndex < slots.length ? focusIndex : defaultTabStop(slots, selected);

  function moveTo(index: number) {
    setFocusIndex(index);
    buttons.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index);
    if (Number.isNaN(index)) return;
    const targets: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index - columns,
      ArrowDown: index + columns,
      Home: 0,
      End: slots.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next >= 0 && next < slots.length && next !== index) moveTo(next);
  }

  return (
    <div ref={ref} role="group" aria-label={label} aria-busy={busy || undefined} onKeyDown={handleKeyDown} className="space-y-5">
      {SLOT_GROUPS.map((group) => {
        const headingId = `${idPrefix}-${group.label}`;
        return (
          <div key={group.label}>
            <h3 id={headingId} className="mb-2 text-label-14 text-fg-secondary">
              {group.label}
            </h3>
            <div role="group" aria-labelledby={headingId} className="grid grid-cols-4 gap-2 lg:grid-cols-8">
              {slots.slice(group.from, group.from + SLOTS_PER_GROUP).map((slot, offset) => {
                const index = group.from + offset;
                const kind = kindOf(slot, selectedSet, justTakenSet);
                const interactive = kind === 'available' || kind === 'selected';
                const word = KIND_WORD[kind];
                return (
                  <button
                    key={slot.start}
                    ref={(element) => {
                      buttons.current[index] = element;
                    }}
                    type="button"
                    data-index={index}
                    data-start={slot.start}
                    data-kind={kind}
                    tabIndex={index === tabStop ? 0 : -1}
                    aria-pressed={interactive ? kind === 'selected' : undefined}
                    aria-disabled={interactive ? undefined : true}
                    aria-label={`${slot.label} to ${timeLabel(slot.end)} IST${KIND_NAME_SUFFIX[kind]}`}
                    onFocus={() => setFocusIndex(index)}
                    onClick={() => {
                      if (interactive) onToggle(slot);
                    }}
                    className={`flex min-h-13 flex-col items-center justify-center rounded-md border px-1 py-1 text-center ${KIND_STYLE[kind]}`}
                  >
                    <span className="text-label-14 tabular-nums">{slot.label}</span>
                    {word ? (
                      // The pressed state already announces "Selected", so the word is for the eyes only.
                      <span aria-hidden={kind === 'selected' || undefined} className="flex items-center gap-1 text-label-12 break-words">
                        {kind === 'selected' ? <TickIcon size={12} /> : null}
                        {word}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
