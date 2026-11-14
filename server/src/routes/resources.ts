import { type RequestHandler, Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import {
  type CreateResourceBody,
  type UpdateResourceBody,
  createResourceBody,
  listResourcesQuery,
  updateResourceBody,
} from '../schemas/resources.js';
import { createResource, getResource, listResources, updateResource } from '../services/resources.js';

/**
 * `/api/resources/*` (PLAN.md §6). Every route needs a signed-in user; creating and editing also need
 * an admin, checked here on the server (hiding the buttons in the UI is not access control).
 * The order is deliberate: sign-in, then role, then the body, so a member gets 403 whatever they send.
 */
export function createResourcesRouter(requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { status } = parseQuery(listResourcesQuery, req.query);
    // `status=all` only means something to admins; for members it is ignored.
    const includeInactive = status === 'all' && req.user?.role === 'admin';
    res.json(await listResources({ includeInactive }));
  });

  router.post('/', requireAdmin, validateBody(createResourceBody), async (req, res) => {
    res.status(201).json(await createResource(req.body as CreateResourceBody));
  });

  router.get('/:id', async (req, res) => {
    res.json(await getResource(req.params.id, { isAdmin: req.user?.role === 'admin' }));
  });

  router.patch<{ id: string }>('/:id', requireAdmin, validateBody(updateResourceBody), async (req, res) => {
    res.json(await updateResource(req.params.id, req.body as UpdateResourceBody));
  });

  return router;
}
