# SlotBook

SlotBook is a web app for booking meeting rooms and shared equipment within one organization. Members can find a resource, see its free 30-minute slots for any day up to 30 days ahead, book several of them in one all-or-nothing step, and see and cancel their bookings; admins maintain the catalog and can cancel anyone's booking. The database itself makes double booking impossible.

## Status

Built one milestone at a time. **Milestones M0 (foundation), M1 (accounts and roles), M2 (resource catalog and discovery), M3 (admin resource management), M4 (booking engine, API only), M5 (slot grid and booking flow) and M6 (My bookings and cancellation) are done and verified, and M7 (polish and release checks) is done except one check that needs a person: nobody has yet used the app with a screen reader.** The whole member and admin journey works in the app: find a resource, book, see the booking, cancel it, and the slots are free again.

**Production setup (M8): prepared and verified on a local machine, not deployed.** In production mode Express serves the built client and the API from one origin; the settings are validated at start-up; there are security headers, a check against forged cross-site writes, and a limit on wrong passwords and registrations. It has been run that way locally against an in-memory database (sign in, book, cancel, sign out, deep links, headers, cookies). It has **not** been run on a host or against Atlas, nothing was published, and some decisions (host, region, database, who gets which password) are the owner's: see [Production](#production) and [DEPLOYMENT.md](DEPLOYMENT.md). There is no CI and no analytics (both out of scope, PLAN.md §3). [PLAN.md](PLAN.md) has the scope, data model, API, milestones and the verification log.

### Implemented

- **Foundation (M0):** an npm workspace with a React client and an Express API. The API refuses to start unless MongoDB is a replica set (booking will use transactions) and exposes `GET /api/health` (is the process up) and `GET /api/ready` (is the database connected). The client uses the design tokens from [DESIGN.md](DESIGN.md).
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

- **Production setup (M8):**
  - **One origin:** with `NODE_ENV=production`, `npm start` serves the built client and the API together. React Router deep links and reloads work (`/bookings?view=history` loads from the server), unknown `/api` paths are JSON 404s and never the page, and a missing asset is a plain 404. There is no CORS.
  - **Start-up checks:** in production `MONGODB_URI`, `JWT_SECRET` and `TRUST_PROXY` (how many proxies sit in front) are required and validated, the built client must exist, and the error says which setting is wrong without printing a value. Nothing is seeded on start.
  - **Security:** a strict content security policy and the usual companion headers; HSTS on HTTPS requests; a `Secure`, `HttpOnly`, `SameSite=Lax` cookie; a check that refuses writes claiming to come from another site or origin (tried with a real forged form: see PLAN.md M8, where a same-site page on another port cancelled a booking until this check existed); at most ten wrong passwords per 15 minutes and ten registrations per hour per address. No new dependency was added for any of it.
  - **Health and readiness are separate:** `/api/health` says the process is up and never touches the database (what a host should check); `/api/ready` says the database is connected.
  - **Prepared, not done:** `render.yaml` (one free Render web service) and [DEPLOYMENT.md](DEPLOYMENT.md) (decisions, values, runbook, smoke test).
  - **Checked** from a fresh export of the code: the build command in `render.yaml`, `npm start` in production mode (also with only production dependencies installed), the whole member journey in a browser on one origin, a forged cancellation from another origin, the rate limit as a person meets it, and a search of the build and logs for secrets. **Not checked:** a real host, real HTTPS and a real proxy (simulated with headers), Atlas, and the screen reader.

### Planned, not built

- **Going live:** the owner's step (DEPLOYMENT.md). Nothing is deployed.

Deliberately out of scope for the MVP: approval workflows, recurring bookings, notifications, calendar sync, password reset, a user-management UI, analytics and CI (PLAN.md §3).

### Known limits

- Each list of bookings shows at most 50 rows ("Showing the latest 50"), with no paging.
- The slot grid is a snapshot: the page doesn't poll, and the booking request is what decides. A refused booking is explained, and nothing is booked partially.
- "In progress" and "Completed" are worked out from the browser's clock, so a clock that disagrees with the server's moves those labels. The server still decides whether a cancellation is allowed.
- When the answer to a booking or a cancellation is lost, or the server fails, the page says it can't tell whether it went through and offers a refresh. "Nothing was booked" or "cancelled" is only said after a definite refusal.
- In very rare cases (a slot taken and freed three times in a row while one booking is being made) the API answers with a generic error. Nothing is booked, and the page words it like any other server failure.
- With the text size doubled on a screen 768 to 1279 px wide, the tables scroll sideways inside their card instead of turning into cards (browser zoom to 200% does turn them into cards).
- The rate limits live in one process's memory: a restart empties them, and a second instance would count separately.
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
4. In two terminals, run `npm run dev:server` (API on http://localhost:4000) and `npm run dev:client` (app on http://localhost:5173, which forwards `/api` to the API). `http://localhost:4000/api/health` answers `{"status":"ok"}` when the API is up, and `/api/ready` answers `{"status":"ready","db":"connected"}` when it can reach the database.
5. Open http://localhost:5173 and sign in with a seeded account (the values you chose in step 2), or create a member account on the register page. The seeded admin also sees Manage resources and, on My bookings, All members; accounts made on the register page are always members.

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | Server tests on an in-memory MongoDB replica set (the first run downloads a MongoDB binary) |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built API. With `NODE_ENV=production` it also serves the built client (see Production) |
| `npm run seed` | Creates the demo accounts, resources and bookings (needs `MONGODB_URI` and the `SEED_*` values) |



## Production

Production is **one Node process on one origin**: Express serves the API under `/api` and the built React client for every other path, behind the host's HTTPS proxy, with MongoDB Atlas as the database. [DEPLOYMENT.md](DEPLOYMENT.md) has the decisions, the runbook and a smoke test; `render.yaml` is the Blueprint for a free Render web service. **Nothing is deployed**, and it has only been run locally (see Status).

The commands (the ones `render.yaml` uses):

```
npm ci --include=dev && npm run build     # --include=dev: with NODE_ENV=production npm would skip TypeScript and Vite
npm start                                 # needs NODE_ENV=production and the variables below
```

| Variable | Required | In production | Checked at start-up |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | Only `development`, `test` or `production`. `production` serves the built client, sets the cookie `Secure`, sends HSTS on HTTPS requests, and makes the next row mandatory |
| `TRUST_PROXY` | **yes, in production** | How many reverse proxies sit in front of the API: `1` on Render, `0` if clients reach it directly | A whole number from 0 to 10. It has no default there: too few and every client shares one rate-limit budget, too many and a client can forge its address |
| `MONGODB_URI` | yes | A connection string for a **replica set** (Atlas is one) | Must start with `mongodb://` or `mongodb+srv://`; the unfilled example is refused; a standalone server is refused |
| `JWT_SECRET` | yes | At least 32 random characters, never reused from development. Changing it signs everyone out | At least 32 characters; the unfilled example is refused |
| `MONGODB_DB_NAME` | no | Defaults to `slotbook` | |
| `PORT` | no | Set by the host; defaults to 4000 | A whole number from 1 to 65535 |

A setting that is missing or wrong stops the API from starting, with a message that names it and never prints its value. In production the API also stops if `client/dist` hasn't been built.

- **Session cookie:** a signed token (HS256, 7 days) in a cookie that is `HttpOnly`, `SameSite=Lax`, path `/`, with no `Domain`, and `Secure` when `NODE_ENV=production`. A `Secure` cookie is only stored over HTTPS (browsers make an exception for `localhost`), so a production copy must be served over HTTPS or sign-in won't stick. The flag comes from `NODE_ENV`, not from the request.
- **Behind a proxy:** `TRUST_PROXY` makes Express believe `X-Forwarded-For` and `X-Forwarded-Proto` from that many proxies and no further. It decides which address the rate limit counts and whether HSTS is sent.
- **Forged writes:** `SameSite=Lax` alone doesn't stop a page on another port or a sibling subdomain of the same site, so every request that changes data is also refused with 403 when the browser says it came from another site (`Sec-Fetch-Site`; for a browser that doesn't send it, when `Origin` isn't the request's host). There is no CORS.
- **Limits:** ten wrong passwords per 15 minutes and ten registrations per hour, per address, answered with 429 and `Retry-After`. Counted in the process's memory, so run one instance; nothing locks an account.
- **Headers:** a content security policy that allows only the site's own files, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`, and `Strict-Transport-Security` on HTTPS requests. API responses are never cached.
- **Seeding:** nothing seeds on start-up. `npm run seed` is run by a person, once, from their own machine (DEPLOYMENT.md says how to do it without touching the wrong database). It prints the database's name and counts, never a password.
- **Health and readiness:** `GET /api/health` is liveness (the process is up; it never touches the database, so a host that restarts unhealthy instances doesn't do so over a database blip). `GET /api/ready` is readiness (200 when the database is connected, otherwise 503). Point a host's health check at `/api/health`.
- **Database:** on start the API checks that MongoDB is a replica set, runs a test transaction and builds the indexes (including the unique one that prevents double booking) before it starts listening. With Atlas, the cluster's Network Access list must allow the host the API runs on. A free host has no fixed outbound address, so the list would have to allow any address, protected by TLS and the database user's password alone: a decision for the owner (DEPLOYMENT.md).
- **Not included:** password change or reset, email verification, revoking a session token before it expires (a copied token works until it expires), account lockout, an access log, monitoring, response compression, CI (PLAN.md §3 and §14).
- **Node.js:** 22.11 or later (`engines` in `package.json`). `package-lock.json` is committed.

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md): the production arrangement, the decisions and values needed from the owner, and the runbook.
- [PLAN.md](PLAN.md): scope, data model, API, milestones and the verification log. It is the source of truth.
- [DESIGN.md](DESIGN.md): design tokens, components, screens and states.
- [CLAUDE.md](CLAUDE.md): working rules for coding agents.
- [HANDOFF.md](HANDOFF.md): where the last session stopped.
