import { notFound } from '../lib/errors.js';
import { isObjectIdString } from '../lib/object-id.js';
import { NAME_COLLATION, type PublicResource, RESOURCE_TYPES, Resource, toPublicResource } from '../models/Resource.js';

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
