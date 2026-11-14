import { z } from 'zod';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  RESOURCE_TYPES,
} from '../models/Resource.js';

/**
 * `GET /api/resources` query. `status=all` lets an admin see inactive resources too;
 * members get the active ones either way (PLAN.md §6). Anything else is a 400.
 */
export const listResourcesQuery = z.object({
  status: z.enum(['active', 'all'], { error: 'Use "active" or "all"' }).optional(),
});

/*
 * Field rules for `POST` and `PATCH /api/resources` (PLAN.md §5). The messages are written for people,
 * because the Manage resources form shows them next to the field (client/src/lib/resourceForm.ts repeats
 * the same checks and messages so most mistakes are caught before a request is sent).
 */

const name = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_NAME_LENGTH, `Use ${MAX_NAME_LENGTH} characters or fewer`);

const type = z.enum(RESOURCE_TYPES, { error: 'Choose room or equipment' });

const location = z
  .string({ error: 'Enter a location' })
  .trim()
  .min(1, 'Enter a location')
  .max(MAX_LOCATION_LENGTH, `Use ${MAX_LOCATION_LENGTH} characters or fewer`);

// Whether a capacity is needed (rooms) or dropped (equipment) depends on the type, which a PATCH may not
// send. That rule lives in the model's validate hook, which runs when the document is saved.
const capacity = z
  .number({ error: 'Enter a whole number' })
  .int('Enter a whole number')
  .min(1, 'Enter a capacity of 1 or more')
  .nullable();

const description = z
  .string({ error: 'Enter a description as text' })
  .trim()
  .max(MAX_DESCRIPTION_LENGTH, `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer`);

/**
 * Trims each tag and drops repeats (ignoring case, keeping the first spelling), then applies the limits.
 * Every problem is reported on `tags` itself, not on `tags.2`, because the form has a single Tags field.
 */
const tags = z
  .array(z.unknown(), { error: 'Tags must be a list' })
  .transform((entries, ctx) => {
    const unique: string[] = [];
    const seen = new Set<string>();
    const reject = (message: string) => {
      ctx.issues.push({ code: 'custom', message, input: entries });
      return z.NEVER;
    };

    for (const entry of entries) {
      if (typeof entry !== 'string') return reject('Tags must be text');
      const tag = entry.trim();
      if (tag.length === 0) return reject("Tags can't be empty");
      if (tag.length > MAX_TAG_LENGTH) return reject(`Use ${MAX_TAG_LENGTH} characters or fewer for each tag`);
      if (!seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        unique.push(tag);
      }
    }
    if (unique.length > MAX_TAGS) return reject(`Use at most ${MAX_TAGS} tags`);
    return unique;
  });

/**
 * `POST /api/resources`. Unknown keys are dropped, so `isActive` (or anything else) can't be set here:
 * a new resource is always active. A missing capacity for a room is caught by the model on save.
 */
export const createResourceBody = z.object({
  name,
  type,
  location,
  capacity: capacity.optional(),
  description: description.optional(),
  tags: tags.optional(),
});

/**
 * `PATCH /api/resources/:id`: any of the editable fields. `isActive` is how an admin deactivates or
 * reactivates a resource. Only these keys survive parsing, and at least one must be sent.
 */
export const updateResourceBody = z
  .object({
    name: name.optional(),
    type: type.optional(),
    location: location.optional(),
    capacity: capacity.optional(),
    description: description.optional(),
    tags: tags.optional(),
    isActive: z.boolean({ error: 'Use true or false' }).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Send at least one field to change',
  });

export type CreateResourceBody = z.infer<typeof createResourceBody>;
export type UpdateResourceBody = z.infer<typeof updateResourceBody>;
