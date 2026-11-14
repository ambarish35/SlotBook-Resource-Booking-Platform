import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Resource } from '../lib/resources';
import { useOnOpen } from '../lib/useOnOpen';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Message } from './Message';

interface DeactivateDialogProps {
  /** The resource to deactivate, or `null` while the dialog is closed. */
  resource: Resource | null;
  onClose: () => void;
  /** The server deactivated it; `resource` is its confirmed state. The parent closes the dialog. */
  onDeactivated: (resource: Resource) => void;
}

/**
 * The confirmation before a resource is hidden from members (DESIGN.md §5.8). Focus starts on the title, never
 * on the destructive button. Reactivating needs no confirmation, so it has no dialog.
 */
export function DeactivateDialog({ resource, onClose, onDeactivated }: DeactivateDialogProps) {
  const open = resource !== null;
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ text: string } | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  useOnOpen(open, () => {
    setSubmitting(false);
    setFailure(null);
  });

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  async function handleDeactivate() {
    if (!resource || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const updated = await apiFetch<Resource>(`/resources/${resource.id}`, { method: 'PATCH', body: { isActive: false } });
      onDeactivated(updated);
    } catch {
      setFailure({ text: 'Nothing was changed. Check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Deactivate ${resource?.name ?? ''}?`}
      busy={submitting}
      initialFocus="title"
      footer={
        <>
          <Button
            variant="secondary"
            aria-disabled={submitting || undefined}
            onClick={() => {
              if (!submitting) onClose();
            }}
          >
            Keep active
          </Button>
          <Button variant="danger" loading={submitting} loadingLabel="Deactivating…" onClick={handleDeactivate}>
            Deactivate
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-3">
        {failure ? (
          <Message ref={failureRef} variant="danger" title="We couldn't deactivate this resource">
            {failure.text}
          </Message>
        ) : null}
        <p className="text-copy-14 text-fg">
          Members won&apos;t see it or be able to book it. Existing bookings stay; cancel them from My bookings → All members if
          needed.
        </p>
      </div>
    </Dialog>
  );
}
