import { type RequestHandler, Router } from 'express';
import { parseQuery } from '../middleware/validate.js';
import { listResourcesQuery } from '../schemas/resources.js';
import { getResource, listResources } from '../services/resources.js';

/** `/api/resources/*` (PLAN.md §6). Every route needs a signed-in user. */
export function createResourcesRouter(requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { status } = parseQuery(listResourcesQuery, req.query);
    // `status=all` only means something to admins; for members it is ignored.
    const includeInactive = status === 'all' && req.user?.role === 'admin';
    res.json(await listResources({ includeInactive }));
  });

  router.get('/:id', async (req, res) => {
    res.json(await getResource(req.params.id, { isAdmin: req.user?.role === 'admin' }));
  });

  return router;
}
