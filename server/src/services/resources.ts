import { Error as MongooseError } from 'mongoose';
import { nameTaken, notFound, validationError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/object-id.js';
import {
  NAME_COLLATION,
  type PublicResource,
  RESOURCE_TYPES,
  Resource,
  type ResourceDocument,
  toPublicResource,
} from '../models/Resource.js';
import type { CreateResourceBody, UpdateResourceBody } from '../schemas/resources.js';
import { isDuplicateKeyError } from './auth.js';

/**
 * The catalog in the order the discovery page shows it (DESIGN.md §5.3): rooms first, then equipment,
 * each alphabetical ignoring case. The database sorts by name; the sort by type below is stable, so each
 * type keeps that order, and RESOURCE_TYPES defines which type comes first.
 */
export async function listResources({ includeInactive }: { includeInactive: boolean }): Promise<PublicResource[]> {
  const resources = await Resource.find(includeInactive ? {} : { isActive: true })
    .sort({ name: 1 })
    .collation(NAME_COLLATION);
  resources.sort((a, b) => RESOURCE_TYPES.indexOf(a.type) - RESOURCE_TYPES.indexOf(b.type));
  return resources.map(toPublicResource);
}

/**
 * One resource. A member asking for an inactive resource gets the same 404 as for an id that doesn't
 * exist, so deactivated resources can't be probed (PLAN.md §6). Admins can see inactive ones.
 */
export async function getResource(id: string, { isAdmin }: { isAdmin: boolean }): Promise<PublicResource> {
  const resource = isObjectIdString(id) ? await Resource.findById(id) : null;
  if (!resource || (!resource.isActive && !isAdmin)) throw notFound('Resource not found.');
  return toPublicResource(resource);
}

/**
 * Saves a resource, turning the two failures an admin can cause into API errors:
 * - the unique name index (also hit by two requests racing for one name) → 409 NAME_TAKEN;
 * - the model's rules, such as a room without a capacity → 400 VALIDATION_ERROR with a message per field.
 */
async function saveResource(resource: ResourceDocument): Promise<void> {
  try {
    await resource.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) throw nameTaken();
    if (error instanceof MongooseError.ValidationError) {
      throw validationError(Object.fromEntries(Object.entries(error.errors).map(([field, problem]) => [field, problem.message])));
    }
    throw error;
  }
}

/** Creates an active resource. Only the listed fields are used, whatever else the caller sent. */
export async function createResource({ name, type, location, capacity, description, tags }: CreateResourceBody): Promise<PublicResource> {
  const resource = new Resource({ name, type, location, capacity, description, tags });
  await saveResource(resource);
  return toPublicResource(resource);
}

/** How many times an edit is applied again after losing a race with another edit of the same resource. */
const MAX_SAVE_ATTEMPTS = 10;

/** The only fields a PATCH may change. */
const EDITABLE_FIELDS =['name', 'type', 'location', 'capacity', 'description', 'tags', 'isActive'] as const;

/**
 * Edits, deactivates or reactivates a resource (any admin can see inactive ones, so there is no active check).
 * The document is loaded, changed field by field and saved, never updated in place with `updateOne` or
 * `findOneAndUpdate`: those skip the model's validate hook, which holds the capacity rules (a room needs a
 * whole-number capacity; equipment has none). A malformed or unknown id → 404.
 *
 * Setting `tags` makes Mongoose check the document's version when saving, so if another request changed the
 * resource after it was loaded, the save finds nothing to update and throws a VersionError. The change is then
 * applied again to a fresh copy, which is what a later edit would have done anyway (the last write wins per field).
 */
export async function updateResource(id: string, changes: UpdateResourceBody): Promise<PublicResource> {
  if (!isObjectIdString(id)) throw notFound('Resource not found.');
  for (let attempt = 1; ; attempt += 1) {
    const resource = await Resource.findById(id);
    if (!resource) throw notFound('Resource not found.');
    for (const field of EDITABLE_FIELDS) {
      const value = changes[field];
      if (value !== undefined) resource.set(field, value);
    }
    try {
      await saveResource(resource);
      return toPublicResource(resource);
    } catch (error) {
      if (error instanceof MongooseError.VersionError && attempt < MAX_SAVE_ATTEMPTS) continue;
      throw error;
    }
  }
}
