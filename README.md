# SlotBook

SlotBook is a web app for booking meeting rooms and shared equipment within one organization. Members can already find a resource; they will also see its free 30-minute slots and book several in one all-or-nothing step, while admins maintain the resource catalog. The database itself will make double booking impossible.

## Status

Under construction, built one milestone at a time. **Milestones M0 (foundation), M1 (accounts and roles) and M2 (resource catalog and discovery) are done and verified.** Booking and the admin tools are not built yet: the My bookings and Manage resources pages exist only as placeholders that say so, and a resource's page shows its details but no slots to book. [PLAN.md](PLAN.md) has the scope, data model, API, milestones and the verification log.

### Implemented

- **Foundation (M0):** an npm workspace with a React client and an Express API. The API refuses to start unless MongoDB is a replica set (booking will use transactions) and exposes `GET /api/health`. The client uses the design tokens from [DESIGN.md](DESIGN.md).
- **Accounts and roles (M1):**
  - Register (always as a member), sign in, sign out, and a session that survives a reload. The session is a JWT in an httpOnly cookie that scripts can't read.
  - Members and admins. Admin accounts come only from `npm run seed`, never from registration.
  - Signed-in-only pages that return you to where you were after signing in, a nav that shows "Manage resources" to admins only, and 403 and 404 pages.
  - One error format for the whole API.
- **Resource catalog and discovery (M2):**
  - Signed-in users see the catalog as cards: rooms first, then equipment. Search by name, location or tag, filter by type and minimum capacity (all in the browser, so results appear as you type), and open a resource to see its location, capacity, tags and description.
  - Loading, empty, no-results and error states, and a mobile layout where the filters open from a "Filters" button.
  - `npm run seed` also creates 8 demo resources (rooms and equipment, including projectors). It is demo data in the database, not sample data baked into the screens.
  - Server tests (90 in total) cover the auth flow, roles, error handling and the catalog.

### Planned, not built

- **M3:** admins add, edit, deactivate and reactivate resources.
- **M4–M5:** availability on a 30-minute grid (08:00–20:00 IST) and atomic booking of 1–8 slots, with a unique index guarding against double booking.
- **M6:** My bookings with cancellation, plus an admin view of all bookings.
- **M7:** polish, accessibility checks and a final pass over this README. **M8** (optional): deployment.

Deliberately out of scope for the MVP: approval workflows, recurring bookings, notifications, calendar sync, password reset and a user-management UI (PLAN.md §3).

## Stack

React 19, React Router 7 and Tailwind CSS 4 (built with Vite) · Node.js and Express 5 · MongoDB through Mongoose · TypeScript throughout · Vitest and Supertest for server tests.

## Getting started

You need **Node.js 22.11 or later** and a **MongoDB replica set**. A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works, and every Atlas cluster is a replica set. Atlas only accepts connections from addresses on its Network Access list, so allow every public IP your network uses.

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in. `.env` is ignored by git, so never commit it.
   - `MONGODB_URI`: your connection string.
   - `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD`: the demo accounts to create (passwords 8–72 characters).
3. `npm run seed` creates the admin and member accounts from those values, plus the demo resources. It is safe to run again: it never changes an existing account's password or overwrites an existing resource.
4. In two terminals, run `npm run dev:server` (API on http://localhost:4000) and `npm run dev:client` (app on http://localhost:5173, which forwards `/api` to the API).
5. Open http://localhost:5173 and sign in with a seeded account, or create a member account on the register page.

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | Server tests on an in-memory MongoDB replica set (the first run downloads a MongoDB binary) |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built API |

## Documentation

- [PLAN.md](PLAN.md): scope, data model, API, milestones and the verification log. It is the source of truth.
- [DESIGN.md](DESIGN.md): design tokens, components, screens and states.
- [CLAUDE.md](CLAUDE.md): working rules for coding agents.
- [HANDOFF.md](HANDOFF.md): where the last session stopped.
