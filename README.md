# SlotBook

SlotBook is a web app for booking meeting rooms and shared equipment within one organization. Members can find a resource, see its free 30-minute slots for any day up to 30 days ahead, and book several of them in one all-or-nothing step; admins maintain the catalog. The database itself makes double booking impossible. A member's list of bookings, and cancelling from it, come next.

## Status

Under construction, built one milestone at a time. **Milestones M0 (foundation), M1 (accounts and roles), M2 (resource catalog and discovery), M3 (admin resource management), M4 (booking engine, API only) and M5 (slot grid and booking flow) are done and verified.** You can book from a resource's page, but there is no list of your bookings yet: the My bookings page exists only as a placeholder that says so, so a booking can't be cancelled from the app until the next milestone. [PLAN.md](PLAN.md) has the scope, data model, API, milestones and the verification log.

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
- **Admin resource management (M3):**
  - Admins get a Manage resources page: every resource, active or not, as a table on desktop and as cards on mobile, with search, a type filter and Active / Inactive / All views.
  - They add and edit a room or a piece of equipment in a dialog (a room needs a capacity, and names are unique ignoring case), deactivate one after a confirmation, and reactivate it. A deactivated resource disappears for members until it is reactivated.
  - The API refuses these changes from members with 403, so hiding the buttons is not the only protection.
- **Booking engine (M4, API only):**
  - **Availability:** the 24 slots of a date (08:00–19:30 IST, 30 minutes each), from today to 30 days ahead, as available, unavailable or past. The caller's own slots are marked, and nobody else is identified.
  - **Booking:** 1–8 slots on one date in one step. If even one slot is taken, nothing is booked. A unique index on resource and slot makes double booking impossible, and a transaction keeps a booking and its slot records together.
  - **Cancelling:** the owner or an admin, before the booking starts. All its slots are freed at once and can be booked again straight away.
  - **Lists:** a member's own upcoming and past bookings, and an admin list of everyone's.
  - `npm run seed` also creates 4 demo bookings (some belong to the demo member, some to the demo admin). It is demo data in the database.
  - Server tests (346 in total) cover the auth flow, roles, error handling, the catalog, admin resource management and the booking engine, including ten members booking the same slot at the same moment and getting exactly one booking.

- **Slot grid and booking flow (M5):**
  - **Choosing a time:** a resource's page has a date picker (today to 30 days ahead, with Previous day, Next day and Today) and the day's 24 slots, 08:00–19:30 IST, marked available, selected, booked, "Your booking" or past. All times are shown in IST, whatever the browser's time zone. The date is in the address, so a day can be bookmarked.
  - **Selecting and reviewing:** pick 1–8 slots (not necessarily consecutive) on one day. A summary shows the ranges and the total, as a side panel on a wide screen and a sticky bar on a phone, and a confirmation step shows the resource, date and times before anything is sent.
  - **Conflicts:** if someone else takes a slot while you are choosing, nothing is booked. The page refreshes the day, says which times were taken, keeps your other selections for editing, and shows the taken ones as "Just taken". The server's answer to the booking request decides, not the grid you were looking at.
  - **Also:** it works from the keyboard alone (one Tab stop in the grid, arrow keys, Home and End, Space or Enter to select), has loading, error, and fully-booked states, and takes you to sign in and back to the same day if your session ends. An admin who opens an inactive resource sees a notice instead of a grid, because nobody can book it.
  - **Checked** in headless Edge at desktop and phone sizes, including two members racing for the same slot. There are no automated tests for the screens (PLAN.md §3), and a screen reader hasn't been tried yet (M7).

### Planned, not built

- **M6:** My bookings with cancellation, plus an admin view of all bookings. Until then a booking can be made but not cancelled in the app.
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
3. `npm run seed` creates the admin and member accounts from those values, plus the demo resources and a few demo bookings for the next few days. It is safe to run again: it never changes an existing account's password or overwrites an existing resource, and it adds demo bookings only when the demo accounts have no upcoming bookings.
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
