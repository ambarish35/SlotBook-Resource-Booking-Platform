import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  type ResourceFormErrors,
  type ResourceFormField,
  type ResourceFormValues,
  changedFields,
  errorsFromServer,
  formFromResource,
  toRequestBody,
  validateResourceForm,
} from '../lib/resourceForm';
import { type Resource, type ResourceType, TYPE_LABEL } from '../lib/resources';
import { useOnOpen } from '../lib/useOnOpen';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Message } from './Message';
import { TextAreaField } from './TextAreaField';
import { TextField } from './TextField';

interface ResourceFormDialogProps {
  /** `'add'` for a new resource, a resource to edit it, or `null` while the dialog is closed. */
  target: 'add' | Resource | null;
  onClose: () => void;
  /** The server saved the resource; `resource` is its confirmed state. The parent closes the dialog. */
  onSaved: (resource: Resource, kind: 'added' | 'updated') => void;
}

/**
 * The Add and Edit resource dialog (DESIGN.md §5.8). It stays mounted and starts fresh each time it opens.
 * Mistakes are caught on submit (and on blur once the user has tried to submit), with focus on the first
 * invalid field; whatever the server rejects, such as a name that is taken, appears on its field too.
 */
export function ResourceFormDialog({ target, onClose, onSaved }: ResourceFormDialogProps) {
  const open = target !== null;
  const editing = target !== null && target !== 'add' ? target : null;
  const formId = useId();
  const typeGroup = useId();

  const [values, setValues] = useState<ResourceFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<ResourceFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A message inside the dialog: the server couldn't save, or there was nothing to save. A new object each time,
  // so the effect below moves focus to it even when the same message appears twice in a row.
  const [failure, setFailure] = useState<{ variant: 'danger' | 'info'; title: string; text: string } | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLInputElement>(null); // the checked radio, the group's tab stop
  const locationRef = useRef<HTMLInputElement>(null);
  const capacityRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<ResourceFormField, { current: HTMLElement | null }> = {
    name: nameRef,
    type: typeRef,
    location: locationRef,
    capacity: capacityRef,
    description: descriptionRef,
    tags: tagsRef,
  };

  useOnOpen(open, () => {
    setValues(editing ? formFromResource(editing) : EMPTY_FORM);
    setErrors({});
    setSubmitted(false);
    setSubmitting(false);
    setFailure(null);
  });

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  function update<K extends ResourceFormField>(field: K, value: ResourceFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function changeType(type: ResourceType) {
    update('type', type);
    // Equipment has no capacity, so a capacity error would point at a field that is no longer there.
    if (type === 'equipment') setErrors((current) => ({ ...current, capacity: undefined }));
  }

  // Validate on submit, then on blur once the user has tried to submit; never on every keystroke.
  function handleBlur(field: ResourceFormField) {
    if (!submitted) return;
    setErrors((current) => ({ ...current, [field]: validateResourceForm(values)[field] }));
  }

  /** Shows the errors and moves focus to the first invalid field. Returns whether there were any. */
  function showErrors(found: ResourceFormErrors): boolean {
    setErrors(found);
    const firstInvalid = FORM_FIELDS.find((field) => found[field]);
    if (firstInvalid) fieldRefs[firstInvalid].current?.focus();
    return Boolean(firstInvalid);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setFailure(null);
    if (showErrors(validateResourceForm(values))) return;

    // An edit sends only what changed (see changedFields); a new resource sends everything.
    const body = editing ? changedFields(values, editing) : toRequestBody(values);
    if (editing && Object.keys(body).length === 0) {
      setFailure({ variant: 'info', title: 'No changes to save', text: 'Change a field first, or choose Cancel.' });
      return;
    }

    setSubmitting(true);
    try {
      const saved = editing
        ? await apiFetch<Resource>(`/resources/${editing.id}`, { method: 'PATCH', body })
        : await apiFetch<Resource>('/resources', { method: 'POST', body });
      onSaved(saved, editing ? 'updated' : 'added');
    } catch (error) {
      const fromServer = error instanceof ApiError ? errorsFromServer(error) : null;
      if (fromServer) showErrors(fromServer);
      else {
        setFailure({
          variant: 'danger',
          title: "We couldn't save this resource",
          text: `Nothing was ${editing ? 'changed' : 'added'}. Check your connection and try again.`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Add resource'}
      size="form"
      sheetBelow="md"
      busy={submitting}
      initialFocus={nameRef}
      footer={
        <>
          <Button
            variant="secondary"
            aria-disabled={submitting || undefined}
            onClick={() => {
              if (!submitting) onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={submitting} loadingLabel={editing ? 'Saving…' : 'Adding…'}>
            {editing ? 'Save changes' : 'Add resource'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4 pb-3">
        {failure ? (
          <Message ref={failureRef} variant={failure.variant} title={failure.title}>
            {failure.text}
          </Message>
        ) : null}

        <TextField
          ref={nameRef}
          label="Name"
          name="name"
          autoComplete="off"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          onBlur={() => handleBlur('name')}
          error={errors.name}
        />

        <fieldset>
          <legend className="mb-1 text-label-14 text-fg">Type</legend>
          <div className="flex flex-wrap gap-x-6">
            {(['room', 'equipment'] as const).map((type) => (
              <label key={type} className="flex min-h-11 items-center gap-2 text-copy-14 text-fg md:min-h-8">
                <input
                  ref={values.type === type ? typeRef : undefined}
                  type="radio"
                  name={typeGroup}
                  value={type}
                  checked={values.type === type}
                  onChange={() => changeType(type)}
                  className="size-4 accent-accent"
                />
                {TYPE_LABEL[type]}
              </label>
            ))}
          </div>
        </fieldset>

        <TextField
          ref={locationRef}
          label="Location"
          name="location"
          autoComplete="off"
          caption="For example, Block A, 2nd floor"
          value={values.location}
          onChange={(event) => update('location', event.target.value)}
          onBlur={() => handleBlur('location')}
          error={errors.location}
        />

        {values.type === 'room' ? (
          <TextField
            ref={capacityRef}
            label="Capacity"
            name="capacity"
            inputMode="numeric"
            autoComplete="off"
            caption="Seats, a whole number of 1 or more"
            value={values.capacity}
            onChange={(event) => update('capacity', event.target.value)}
            onBlur={() => handleBlur('capacity')}
            error={errors.capacity}
          />
        ) : null}

        <TextAreaField
          ref={descriptionRef}
          label="Description (optional)"
          name="description"
          caption="Up to 500 characters"
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          onBlur={() => handleBlur('description')}
          error={errors.description}
        />

        <TextField
          ref={tagsRef}
          label="Tags (optional)"
          name="tags"
          autoComplete="off"
          caption="Separate with commas, e.g. Projector, Whiteboard"
          value={values.tags}
          onChange={(event) => update('tags', event.target.value)}
          onBlur={() => handleBlur('tags')}
          error={errors.tags}
        />
      </form>
    </Dialog>
  );
}
