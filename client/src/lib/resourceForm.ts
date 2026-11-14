import type { ApiError } from './api';
import type { Resource, ResourceType } from './resources';

/**
 * The Add and Edit resource form (DESIGN.md §5.8): its values, the checks that run before a request is sent,
 * and the mapping of server errors back onto fields. The checks follow server/src/schemas/resources.ts, with
 * the same limits and the same messages, so the server's answer reads the same as the form's. The server stays
 * the authority: whatever slips through comes back as a 400 whose field messages the form shows.
 */

// The same limits as server/src/models/Resource.ts.
export const MAX_NAME_LENGTH = 80;
export const MAX_LOCATION_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export interface ResourceFormValues {
  name: string;
  type: ResourceType;
  location: string;
  /** Text, so a half-typed or invalid number can be shown and checked. Used for rooms only. */
  capacity: string;
  description: string;
  /** Comma-separated, as typed. */
  tags: string;
}

export type ResourceFormField = keyof ResourceFormValues;
export type ResourceFormErrors = Partial<Record<ResourceFormField, string>>;

/** The form's fields in page order, so the first invalid one is the one to focus. */
export const FORM_FIELDS: readonly ResourceFormField[] = ['name', 'type', 'location', 'capacity', 'description', 'tags'];

export const EMPTY_FORM: ResourceFormValues = { name: '', type: 'room', location: '', capacity: '', description: '', tags: '' };

export function formFromResource(resource: Resource): ResourceFormValues {
  return {
    name: resource.name,
    type: resource.type,
    location: resource.location,
    capacity: resource.capacity === null ? '' : String(resource.capacity),
    description: resource.description,
    tags: resource.tags.join(', '),
  };
}

/** Splits the Tags field on commas, trims each, drops empty ones and repeats (ignoring case, keeping the first spelling). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const piece of text.split(',')) {
    const tag = piece.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

function validateCapacity(text: string): string | undefined {
  const value = text.trim();
  if (!value) return 'Enter a capacity of 1 or more';
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return 'Enter a whole number';
  if (Number(value) < 1) return 'Enter a capacity of 1 or more';
  return undefined;
}

/** All the problems with the form as it stands, by field. An empty object means it can be sent. */
export function validateResourceForm(values: ResourceFormValues): ResourceFormErrors {
  const errors: ResourceFormErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer`;

  const location = values.location.trim();
  if (!location) errors.location = 'Enter a location';
  else if (location.length > MAX_LOCATION_LENGTH) errors.location = `Use ${MAX_LOCATION_LENGTH} characters or fewer`;

  // Equipment has no capacity, and the field isn't shown for it.
  if (values.type === 'room') {
    const problem = validateCapacity(values.capacity);
    if (problem) errors.capacity = problem;
  }

  if (values.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer`;
  }

  const tags = parseTags(values.tags);
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) errors.tags = `Use ${MAX_TAG_LENGTH} characters or fewer for each tag`;
  else if (tags.length > MAX_TAGS) errors.tags = `Use at most ${MAX_TAGS} tags`;

  return errors;
}

/** The request body for a form that passed `validateResourceForm`. Used for both POST and PATCH. */
export function toRequestBody(values: ResourceFormValues) {
  return {
    name: values.name.trim(),
    type: values.type,
    location: values.location.trim(),
    capacity: values.type === 'room' ? Number(values.capacity.trim()) : null,
    description: values.description.trim(),
    tags: parseTags(values.tags),
  };
}

/**
 * The fields of the form that differ from the resource as it was when the dialog opened, as a PATCH body.
 * Sending only these means saving an edit can't undo another admin's change to a field this admin never touched.
 * An empty object means there is nothing to save.
 */
export function changedFields(values: ResourceFormValues, original: Resource): Partial<ReturnType<typeof toRequestBody>> {
  const next = toRequestBody(values);
  const before = toRequestBody(formFromResource(original));
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const a = next[key];
    const b = before[key];
    const same = Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((tag, i) => tag === b[i]) : a === b;
    if (!same) changes[key] = a;
  }
  return changes;
}

/**
 * Turns a server rejection into messages on the form's fields: a 400 VALIDATION_ERROR carries one per field,
 * and 409 NAME_TAKEN belongs to the name. Returns null for any other failure, which the form reports as a
 * message of its own.
 */
export function errorsFromServer(error: ApiError): ResourceFormErrors | null {
  if (error.code === 'NAME_TAKEN') return { name: error.message };
  if (error.code !== 'VALIDATION_ERROR') return null;
  const errors: ResourceFormErrors = {};
  for (const field of FORM_FIELDS) {
    const message = error.fields[field];
    if (message) errors[field] = message;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
