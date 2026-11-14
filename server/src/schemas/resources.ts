import { z } from 'zod';

/**
 * `GET /api/resources` query. `status=all` lets an admin see inactive resources too;
 * members get the active ones either way (PLAN.md §6). Anything else is a 400.
 */
export const listResourcesQuery = z.object({
  status: z.enum(['active', 'all'], { error: 'Use "active" or "all"' }).optional(),
});
