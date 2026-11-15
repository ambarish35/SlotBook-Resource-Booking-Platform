# SlotBook

SlotBook is a web app for booking meeting rooms and shared equipment within one organization. Members can find a resource, see its free 30-minute slots for any day up to 30 days ahead, book several of them in one all-or-nothing step, and see and cancel their bookings; admins maintain the catalog and can cancel anyone's booking. The database itself makes double booking impossible.

## Status

Built one milestone at a time. **Milestones M0 (foundation), M1 (accounts and roles), M2 (resource catalog and discovery), M3 (admin resource management), M4 (booking engine, API only), M5 (slot grid and booking flow) and M6 (My bookings and cancellation) are done and verified, and M7 (polish and release checks) is done except one check that needs a person: nobody has yet used the app with a screen reader.** The whole member and admin journey works in the app: find a resource, book, see the booking, cancel it, and the slots are free again.

**Not ready to deploy as it stands.** Deployment is the optional milestone M8 and hasn't been started: the API doesn't serve the built client, so there is no production setup yet (see [Running a built copy](#running-a-built-copy-and-what-is-missing-for-deployment)). There is no CI either, and no analytics (both are out of scope, PLAN.md §3). [PLAN.md](PLAN.md) has the scope, data model, API, milestones and the verification log.

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

- **My bookings and cancellation (M6):**
  - **Your bookings:** My bookings lists Upcoming (soonest first) and History (newest first) as a table on a wide screen and as cards on a phone, with resource, date, time in IST, duration and status: Confirmed, In progress, Completed or Cancelled. A booking that has started shows "In progress" and can no longer be cancelled; the page notices when that happens while it is open. Each list shows up to 50 bookings and says so. The list you are on is in the address (`?view=history`), so it can be bookmarked.
  - **Cancelling:** "Cancel" asks for confirmation, showing the booking, then cancels all of its slots at once; they are free to book again straight away. A request is sent only once, however often the button is pressed. If the booking was cancelled elsewhere, has started, or isn't yours, the page says which and refreshes. If the answer to a cancellation is lost, the page says it can't tell whether it went through and offers to refresh the list, rather than guessing. The same care is taken when booking: "Nothing was booked" is only said after the server has definitely refused.
  - **Admins:** an extra "All members" view lists everyone's bookings with who made them, and an admin can cancel any upcoming booking. Members can't: the server answers 403 for the admin list and 404 for someone else's booking, whatever the page does.
  - **Checked** in headless Edge at desktop and phone sizes, including a lost cancellation answer, a session that ends while the dialog is open, and an admin cancelling a member's booking. As before, there are no automated tests for the screens and a screen reader hasn't been tried yet (M7).

- **Polish and release checks (M7):**
  - **Every screen and dialog** (20 of them) was checked at 1280 px, at 375 px and at 200% browser zoom (a 640 px window), and the main screens also with the text size doubled, in headless Edge on an in-memory database. An automated accessibility audit (axe-core, the WCAG 2.0 to 2.2 A and AA rules plus its best-practice rules) found nothing to report on any of them, and there is no horizontal scrolling, clipped text or text squeezed to a sliver.
  - **Pages:** each has its own title and one heading, signed-in pages start with a skip link, and focus moves to the heading after navigation.
  - **Keyboard:** a member (sign in, find, book, see the booking, cancel, sign out) and an admin (add, deactivate and reactivate a resource, open All members) can complete those journeys without a mouse, and every Tab stop along the way shows a focus ring.
  - **Motion:** the spinner is the only animation, and it stops when the system asks for reduced motion.
  - **One end-to-end run:** an admin adds a resource, a newly registered member finds and books it, it shows in My bookings (and in the admin's All members), the member cancels it, and its slots are available again.
  - **Fixed on the way:** at a large text size the resource cards were squeezed into slivers and the top bar ran off the screen; the date field showed no focus ring of its own.
  - **Not checked:** with a screen reader (Narrator or NVDA), in Safari, or on real touch devices. The checks above are not a substitute for the first of these.

### Planned, not built

- **M8** (optional): deployment. Nothing for it exists yet.

Deliberately out of scope for the MVP: approval workflows, recurring bookings, notifications, calendar sync, password reset, a user-management UI, analytics, CI, rate limiting and security headers (PLAN.md §3).

### Known limits

- Each list of bookings shows at most 50 rows ("Showing the latest 50"), with no paging.
- The slot grid is a snapshot: the page doesn't poll, and the booking request is what decides. A refused booking is explained, and nothing is booked partially.
- "In progress" and "Completed" are worked out from the browser's clock, so a clock that disagrees with the server's moves those labels. The server still decides whether a cancellation is allowed.
- When the answer to a booking or a cancellation is lost, or the server fails, the page says it can't tell whether it went through and offers a refresh. "Nothing was booked" or "cancelled" is only said after a definite refusal.
- In very rare cases (a slot taken and freed three times in a row while one booking is being made) the API answers with a generic error. Nothing is booked, and the page words it like any other server failure.
- With the text size doubled on a screen 768 to 1279 px wide, the tables scroll sideways inside their card instead of turning into cards (browser zoom to 200% does turn them into cards).
- More in PLAN.md §14.

## Stack

React 19, React Router 7 and Tailwind CSS 4 (built with Vite) · Node.js and Express 5 · MongoDB through Mongoose · TypeScript throughout · Vitest and Supertest for server tests.

## Getting started

You need **Node.js 22.11 or later** and a **MongoDB replica set**. A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works, and every Atlas cluster is a replica set. Atlas only accepts connections from addresses on its Network Access list, so allow every public IP your network uses.

1. `npm ci` installs exactly what `package-lock.json` pins (`npm install` also works).
2. Copy `.env.example` to `.env` (in the repository root) and fill it in. `.env` is ignored by git, so never commit it.
   - `MONGODB_URI`: your connection string.
   - `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD`: the demo accounts to create (passwords 8–72 characters). Optional `SEED_ADMIN_NAME` and `SEED_MEMBER_NAME` set their display names (default "Admin" and "Member").
   - Optional: `MONGODB_DB_NAME` (default `slotbook`) and `PORT` (default 4000). Real environment variables win over `.env`.
3. `npm run seed` creates the admin and member accounts from those values, plus 8 demo resources and 4 demo bookings for the next few days. It is safe to run again: it never changes an existing account's password or overwrites an existing resource, and it adds demo bookings only when the demo accounts have no upcoming bookings.
4. In two terminals, run `npm run dev:server` (API on http://localhost:4000) and `npm run dev:client` (app on http://localhost:5173, which forwards `/api` to the API). `http://localhost:4000/api/health` answers `{"status":"ok","db":"connected"}` when the API is up.
5. Open http://localhost:5173 and sign in with a seeded account (the values you chose in step 2), or create a member account on the register page. The seeded admin also sees Manage resources and, on My bookings, All members; accounts made on the register page are always members.

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | Server tests on an in-memory MongoDB replica set (the first run downloads a MongoDB binary) |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built API (the API only: see below) |
| `npm run seed` | Creates the demo accounts, resources and bookings (needs `MONGODB_URI` and the `SEED_*` values) |

## Running a built copy, and what is missing for deployment

`npm run build` followed by `npm start` runs the **API only**, on `PORT` (default 4000). It does not serve the client. `client/dist` holds static files that need a web server, and the API has no CORS support, so the browser has to reach the app and `/api` on **one origin**. A production setup therefore needs a reverse proxy (or a host that does the same) that serves `client/dist`, answers unknown paths with `index.html`, and forwards `/api` to the API. That setup isn't built or tested here: it is the optional milestone M8, so **the app is not ready to deploy yet**.

What the API needs once it runs somewhere real:

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | A connection string for a **replica set** (Atlas is one). The API refuses to start on a standalone server |
| `JWT_SECRET` | yes | At least 32 random characters, never reused from development. Changing it signs everyone out |
| `NODE_ENV` | no | Defaults to `development`. Set it to `production` (see the cookie below) |
| `PORT` | no | Defaults to 4000 |
| `MONGODB_DB_NAME` | no | Defaults to `slotbook` |

- **Session cookie:** a signed token (HS256, 7 days) in a cookie that is `httpOnly`, `SameSite=Lax`, path `/`, and `Secure` when `NODE_ENV=production`. A `Secure` cookie is only stored over HTTPS (browsers make an exception for `localhost`), so a production copy must be served over HTTPS or sign-in won't stick. The flag comes from `NODE_ENV`, not from the request, so a proxy that ends HTTPS needs no extra setting.
- **Database:** on start the API checks that MongoDB is a replica set, runs a test transaction and builds the indexes (including the unique one that prevents double booking) before it starts listening. With Atlas, the cluster's Network Access list must allow the host the API runs on. Run `npm run seed` once if you want the demo data.
- **Health check:** `GET /api/health` returns 200 with `{"status":"ok","db":"connected"}`, or 503 when the database is not connected.
- **Not included:** rate limiting, security headers, email verification, password reset, revoking a session token before it expires (a copied token works until it expires), CI, and monitoring (PLAN.md §3 and §14).
- **Node.js:** 22.11 or later (`engines` in `package.json`). `package-lock.json` is committed.

## Documentation

- [PLAN.md](PLAN.md): scope, data model, API, milestones and the verification log. It is the source of truth.
- [DESIGN.md](DESIGN.md): design tokens, components, screens and states.
- [CLAUDE.md](CLAUDE.md): working rules for coding agents.
- [HANDOFF.md](HANDOFF.md): where the last session stopped.
