export type ResourceType = 'room' | 'equipment';

/** A resource as the API returns it (PLAN.md §6). */
export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  location: string;
  capacity: number | null;
  description: string;
  tags: string[];
  isActive: boolean;
}

export const TYPE_LABEL: Record<ResourceType, string> = { room: 'Room', equipment: 'Equipment' };

export type TypeFilter = 'all' | ResourceType;

export interface Filters {
  query: string;
  type: TypeFilter;
  minCapacity: number | null;
}

export const NO_FILTERS: Filters = { query: '', type: 'all', minCapacity: null };

/** The "Minimum capacity" choices; "Any" is no filter. */
export const CAPACITY_OPTIONS = [2, 4, 6, 8, 12, 20];

/** How many of the filter-panel controls (not the search box) are set. Shown on the mobile "Filters" button. */
export function activeFilterCount({ type, minCapacity }: Filters): number {
  return (type !== 'all' ? 1 : 0) + (minCapacity !== null ? 1 : 0);
}

/**
 * Filters the whole catalog in the browser (PLAN.md D8). Every search word must appear, ignoring case,
 * in the name, the location or a tag. A minimum capacity keeps only rooms with that many seats or more,
 * because equipment has no capacity.
 */
export function filterResources(resources: Resource[], { query, type, minCapacity }: Filters): Resource[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return resources.filter((resource) => {
    if (type !== 'all' && resource.type !== type) return false;
    if (minCapacity !== null && !(resource.type === 'room' && resource.capacity !== null && resource.capacity >= minCapacity)) {
      return false;
    }
    if (words.length === 0) return true;
    const text = [resource.name, resource.location, ...resource.tags].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** "Block A, 2nd floor · Seats 8" for a room, just the location for equipment (DESIGN.md §4 Cards). */
export function describeResource({ type, location, capacity }: Resource): string {
  return type === 'room' && capacity !== null ? `${location} · Seats ${capacity}` : location;
}

export function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'resource' : 'resources'}`;
}
