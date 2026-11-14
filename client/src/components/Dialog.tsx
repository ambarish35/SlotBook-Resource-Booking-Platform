import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons';
import { IconButton } from './IconButton';

/**
 * Below the breakpoint the dialog is a full-width bottom sheet with rounded top corners; above it, a
 * centered 480 px dialog (DESIGN.md §4 Dialogs). The class names are written out so Tailwind can see them.
 */
const placement = {
  sm: 'max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-t-xl sm:m-auto sm:w-full sm:max-w-120 sm:rounded-xl',
  md: 'max-md:mx-0 max-md:mt-auto max-md:mb-0 max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-t-xl md:m-auto md:w-full md:max-w-120 md:rounded-xl',
};

interface DialogProps {
  open: boolean;
  /** Called for every way of closing: Close, Esc, a click on the backdrop. The parent then sets `open` to false. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Where the dialog turns into a bottom sheet. Default: below 640 px. */
  sheetBelow?: 'sm' | 'md';
  /** The field to focus on open. Without it the browser focuses the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * A modal built on the native `<dialog>` and `showModal()`: focus stays inside while it is open, Esc closes
 * it, and the browser returns focus to the element that opened it. Its content is mounted only while open.
 */
export function Dialog({ open, onClose, title, children, footer, sheetBelow = 'sm', initialFocus }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocus?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // The backdrop is part of the dialog element, so a press and release on it both target the dialog
      // itself. Requiring the press to start there too keeps a drag that begins inside (selecting text, a
      // select box) and ends outside from closing it.
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (event.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
      className={`bg-surface p-0 text-fg shadow-overlay backdrop:bg-overlay ${placement[sheetBelow]}`}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-4 p-5 pb-3 md:p-6 md:pb-3">
            <h2 id={titleId} className="text-title-section text-fg">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <CloseIcon size={20} />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-2 md:px-6">{children}</div>
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
