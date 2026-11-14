import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons';
import { IconButton } from './IconButton';

/*
 * Placement (DESIGN.md §4 Dialogs). Below the breakpoint a confirmation is a full-width bottom sheet with
 * rounded top corners, and a form fills the screen (DESIGN.md §5.8); above it, a centered dialog, 480 px
 * wide for confirmations and 640 px for forms. The class names are written out so Tailwind can see them.
 */
const placement = {
  'sm-confirm':
    'max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-t-xl sm:m-auto sm:w-full sm:max-w-120 sm:rounded-xl',
  'md-confirm':
    'max-md:mx-0 max-md:mt-auto max-md:mb-0 max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-t-xl md:m-auto md:w-full md:max-w-120 md:rounded-xl',
  'sm-form':
    'max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none sm:m-auto sm:w-full sm:max-w-160 sm:rounded-xl',
  'md-form':
    'max-md:m-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none md:m-auto md:w-full md:max-w-160 md:rounded-xl',
};

/** The inner column: capped at 90% of the viewport, except where the dialog fills the screen. */
const column = {
  'sm-confirm': 'max-h-[90dvh]',
  'md-confirm': 'max-h-[90dvh]',
  'sm-form': 'max-sm:h-full sm:max-h-[90dvh]',
  'md-form': 'max-md:h-full md:max-h-[90dvh]',
};

interface DialogProps {
  open: boolean;
  /** Called for every way of closing: Close, Esc, a click on the backdrop. The parent then sets `open` to false. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Where the dialog turns into a bottom sheet (a full-screen sheet for forms). Default: below 640 px. */
  sheetBelow?: 'sm' | 'md';
  /** `confirm` is 480 px wide, `form` 640 px. Default: `confirm`. */
  size?: 'confirm' | 'form';
  /**
   * A request is in progress: Close, Esc and a click on the backdrop do nothing until it finishes
   * (DESIGN.md §4 Dialogs: dismiss "except while a request is in progress").
   */
  busy?: boolean;
  /**
   * What to focus on open: a field, or `'title'` for a confirmation that is only text (DESIGN.md §4 Dialogs).
   * Without it the browser focuses the first focusable element. Never point it at a destructive button.
   */
  initialFocus?: RefObject<HTMLElement | null> | 'title';
}

/**
 * A modal built on the native `<dialog>` and `showModal()`: focus stays inside while it is open, Esc closes
 * it, and the browser returns focus to the element that opened it. Its content is mounted only while open.
 * Keep the component mounted and toggle `open`: removing an open dialog from the page loses that focus return.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  sheetBelow = 'sm',
  size = 'confirm',
  busy = false,
  initialFocus,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const pressedOnBackdrop = useRef(false);
  const variant = `${sheetBelow}-${size}` as const;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      (initialFocus === 'title' ? titleRef : initialFocus)?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc: while busy, refuse.
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={() => {
        const dialog = ref.current;
        // The browser dispatches `close` asynchronously, so it can arrive after the dialog was opened again.
        // It then describes an earlier closing; acting on it would shut the dialog that was just opened.
        if (dialog?.open) return;
        // A browser may close a dialog despite the refused Esc (Chrome does on a second press). If a request
        // is still running and the parent still wants it open, put it back instead of leaving a hidden dialog.
        if (busy && open && dialog) {
          dialog.showModal();
          return;
        }
        onClose();
      }}
      // The backdrop is part of the dialog element, so a press and release on it both target the dialog
      // itself. Requiring the press to start there too keeps a drag that begins inside (selecting text, a
      // select box) and ends outside from closing it.
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (event.target === ref.current && pressedOnBackdrop.current && !busy) onClose();
      }}
      className={`bg-surface p-0 text-fg shadow-overlay backdrop:bg-overlay ${placement[variant]}`}
    >
      {open ? (
        <div className={`flex flex-col ${column[variant]}`}>
          <div className="flex items-center justify-between gap-4 p-5 pb-3 md:p-6 md:pb-3">
            <h2
              ref={titleRef}
              id={titleId}
              // Focusable only so a text-only confirmation can start there; it isn't a tab stop.
              tabIndex={initialFocus === 'title' ? -1 : undefined}
              className="text-title-section text-fg"
            >
              {title}
            </h2>
            <IconButton
              label="Close"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onClose();
              }}
            >
              <CloseIcon size={20} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 md:px-6">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
