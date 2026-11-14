import { type RequestHandler, Router } from 'express';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { type CreateBookingBody, createBookingBody, listBookingsQuery } from '../schemas/bookings.js';
import { cancelBooking, createBooking, listBookings } from '../services/bookings.js';

/**
 * `/api/bookings/*` (PLAN.md §6). Every route needs a signed-in user. Listing everyone's bookings also needs
 * an admin, checked on the server before anything else is read. Ownership of a booking is checked in the
 * service (a member who targets someone else's booking gets the same 404 as for an id that doesn't exist).
 */
export function createBookingsRouter(requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', validateBody(createBookingBody), async (req, res) => {
    res.status(201).json(await createBooking(currentUser(req), req.body as CreateBookingBody));
  });

  // Registered before `/:id/...` routes so "mine" is never read as an id.
  router.get('/mine', async (req, res) => {
    const { view } = parseQuery(listBookingsQuery, req.query);
    res.json(await listBookings({ view, userId: currentUser(req).id }));
  });

  router.get('/', requireAdmin, async (req, res) => {
    const { view } = parseQuery(listBookingsQuery, req.query);
    res.json(await listBookings({ view }));
  });

  router.post<{ id: string }>('/:id/cancel', async (req, res) => {
    res.json(await cancelBooking(currentUser(req), req.params.id));
  });

  return router;
}
