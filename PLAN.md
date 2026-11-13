# SlotBook — Implementation Plan

> **Status: Plan approved on 2026-11-13. M0 (foundation) is done and verified, including the live Atlas connection. M1 (accounts and roles) is built and verified on an in-memory replica set; its last item, seeding the accounts in Atlas, waits for `JWT_SECRET` and `SEED_*` values in `.env`. M2 starts once that is confirmed.** Every checklist item below stays unchecked until it is built **and** verified.
> UI rules live in [DESIGN.md](DESIGN.md); working rules for coding agents live in [CLAUDE.md](CLAUDE.md).

## 1. Goal and scope

SlotBook lets the members of **one organization** find a meeting room or a piece of shared equipment, see its free 30-minute slots, and book one or more slots in a single all-or-nothing step. The database makes double booking impossible. Admins maintain the resource catalog.

- **Single organization:** one deployment serves one org. No tenants, org switching or cross-org data.
- **One timezone:** all business times are IST (Asia/Kolkata, UTC+05:30).
- **Roles:** `member` (default) and `admin`.
- **Budget:** one developer, 1–2 days. Portfolio quality, not production hardened.
- **Stack:** React + Tailwind CSS (Vite, TypeScript) · Node.js + Express (TypeScript) · MongoDB via Mongoose.

## 2. MVP

1. **Accounts:** register (always as a member), sign in, sign out, session restore. Admin accounts come from the seed script.
2. **Resource discovery:** list active rooms and equipment; search by name, location or tag; filter by type and minimum capacity.
3. **Resource detail and availability:** resource info, an IST date picker (today to +30 days) and a 30-minute slot grid for 08:00–20:00 IST, every day including weekends, that shows available, selected, unavailable and past slots.
4. **Atomic multi-slot booking:** select 1–8 slots (consecutive or not) on one date for one resource, then review and confirm. Either every slot is booked or none is: if even one selected slot is unavailable, the whole booking is rejected.
5. **My bookings:** Upcoming and History lists. Cancelling an upcoming booking releases all its slots at once, and they can be booked again immediately.
6. **Admin:** create, edit, deactivate and reactivate resources; view all bookings and cancel any upcoming booking.
7. **No double booking:** enforced by a unique index and proven by concurrent tests.

## 3. Deferred (not in the MVP)

- Approval workflow for selected resources: a planned future enhancement (see below), deferred to fit the 1–2 day budget
- Editing or rescheduling bookings (cancel and rebook instead), cancelling single slots of a booking, recurring bookings
- Booking titles or notes, attendee counts, per-user limits
- Cross-resource "what's free at 14:00?" search, maintenance or blackout periods, per-resource opening hours, slot lengths or buffers
- Email or push notifications, reminders, calendar sync or `.ics` export
- Analytics dashboard, user-management UI (roles change only through seed or DB), password reset, email verification, SSO
- Image uploads, pooled equipment quantities, multiple organizations or timezones
- Rate limiting, security headers, CI, client component tests, end-to-end tests
- Production deployment (stretch milestone M8)

### Future enhancement: approval workflow

This is not part of the MVP. The intended design is recorded here so the MVP doesn't block it:
- Resources get a `requiresApproval` flag (default `false`).
- A booking on such a resource starts as `pending`. Pending bookings keep their slot records, so the double-booking guard works unchanged.
- Admins approve (`pending` → `confirmed`) or reject (`pending` → `rejected`, deleting the slot records in the same transaction). A pending booking still undecided when it starts expires and releases its slots.
- UI: a "Pending approval" lozenge, a "Pending" slot label and an admin approval queue.
- Existing MVP records stay valid; the change only adds a field and new statuses.

## 4. Screens and journeys

| Route | Screen | Access |
|---|---|---|
| `/login`, `/register` | Sign in, create account | Signed out |
| `/resources` | Resource discovery (home after sign-in) | Signed in |
| `/resources/:id` | Resource detail, date picker, slot grid, booking | Signed in |
| `/bookings` | My bookings (Upcoming / History); admins can switch to All members | Signed in |
| `/admin/resources` | Manage resources | Admin |
| — | Not found (404) and No access (403) pages | — |

`/` redirects to `/resources` when signed in and to `/login` otherwise. There is no marketing landing page.

- **Member:** sign in → filter resources → open one → pick a date → select slots → review → confirm → see "Booking confirmed" → My bookings → cancel → the slots are free again.
- **Conflict:** member B confirms slots that member A has just taken → B's whole request is rejected and nothing is booked → B sees which times were taken, a refreshed grid, and B's still-valid selections kept for editing → B adjusts and confirms.
- **Admin:** sign in → Manage resources → add, edit or deactivate a resource → My bookings → All members → cancel a member's upcoming booking.

## 5. Data model and indexes

All instants are BSON Dates (UTC). Every collection has `createdAt` and `updatedAt`.

**users**

| Field | Type | Rules |
|---|---|---|
| name | string | required, 1–80 chars |
| email | string | required, trimmed, lowercased |
| passwordHash | string | bcrypt; never returned by the API |
| role | `member` or `admin` | default `member`; cannot be set through the API |

Indexes: `{ email: 1 }` unique.

**resources**

| Field | Type | Rules |
|---|---|---|
| name | string | required, 1–80 chars |
| type | `room` or `equipment` | required; an equipment resource is one individual item |
| location | string | required, e.g. "Block A, 2nd floor" |
| capacity | number or null | rooms: whole number ≥ 1; equipment: null |
| description | string | optional, ≤ 500 chars |
| tags | string[] | optional, ≤ 10, e.g. "Projector" |
| isActive | boolean | default true; resources are deactivated, never deleted |

Indexes: `{ name: 1 }` unique with a case-insensitive collation; `{ isActive: 1, type: 1 }`.

**bookings**: the parent record, one per booking.

| Field | Type | Rules |
|---|---|---|
| user | ObjectId → users | required |
| resource | ObjectId → resources | required |
| date | string `YYYY-MM-DD` | the IST calendar date |
| slotStarts | Date[] | 1–8 sorted, distinct slot starts, all on `date` |
| start, end | Date | first slot start; last slot start + 30 min |
| status | `confirmed` or `cancelled` | |
| cancelledAt, cancelledBy | Date, ObjectId → users | set on cancellation |

Indexes: `{ user: 1, start: -1 }` (my bookings), `{ status: 1, start: 1 }` (upcoming and admin lists).

**slot_reservations**: the child records, one per booked slot. Each links to its parent through `booking` and exists only while that booking is confirmed.

| Field | Type | Rules |
|---|---|---|
| resource | ObjectId → resources | required |
| start | Date | UTC start of a 30-minute slot |
| booking | ObjectId → bookings | required |
| user | ObjectId → users | lets availability mark "your booking" |

Indexes: **`{ resource: 1, start: 1 }` unique, the double-booking guard**; `{ booking: 1 }` to release slots on cancel.

Invariant (checked in tests): a confirmed booking has exactly one slot record per entry in `slotStarts`; a cancelled booking has none; every slot record points to a confirmed booking.

## 6. API

JSON under `/api`. Authentication uses an httpOnly session cookie (§7). Every error has the shape `{ "error": { "code", "message", "details"? } }`. A user is returned as `{ id, name, email, role }`, never with its password hash.

| Method and path | Access | Purpose → success |
|---|---|---|
| `GET /api/health` | Public | Server and DB status → 200 |
| `POST /api/auth/register` | Public | Create a member and start a session → 201 user |
| `POST /api/auth/login` | Public | Start a session → 200 user |
| `POST /api/auth/logout` | Public | Clear the session cookie → 204 |
| `GET /api/auth/me` | Signed in | Current user → 200 |
| `GET /api/resources` | Signed in | Active resources; admins may add `?status=all` (ignored for members) → 200 |
| `GET /api/resources/:id` | Signed in | One resource; inactive → 404 for members → 200 |
| `POST /api/resources` | Admin | Create → 201 |
| `PATCH /api/resources/:id` | Admin | Edit, deactivate, reactivate → 200 |
| `GET /api/resources/:id/availability?date=YYYY-MM-DD` | Signed in | The 24 slots of an IST date → 200 |
| `POST /api/bookings` | Signed in | Atomic multi-slot booking → 201 |
| `GET /api/bookings/mine?view=upcoming` (or `history`) | Signed in | Own bookings → 200 |
| `GET /api/bookings?view=upcoming` (or `history`) | Admin | All bookings, with member name and email → 200 |
| `POST /api/bookings/:id/cancel` | Owner or admin (other members get 404) | Atomic cancellation → 200 |

Availability response:

```json
{ "resourceId": "…", "date": "2026-11-14", "timeZone": "Asia/Kolkata", "slotMinutes": 30,
  "slots": [ { "start": "2026-11-14T02:30:00.000Z", "end": "2026-11-14T03:00:00.000Z",
               "label": "08:00", "status": "available", "mine": false } ] }
```

`status` is `available`, `unavailable` or `past`. `mine` is true only on the caller's own booked slots; members never see who else booked a slot.

Booking request: `{ "resourceId": "…", "slotStarts": ["2026-11-14T04:30:00.000Z", …] }`. The client sends back `start` values from the availability response and never computes instants itself.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body or query (`details.fields` maps each field to a message), or a body that isn't valid JSON |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | Missing, invalid or expired session; wrong email or password |
| 403 | `FORBIDDEN` | A member calling an admin-only endpoint |
| 404 | `NOT_FOUND` | Unknown id or unknown `/api` path; an inactive resource requested by a member; another member's booking (members get the same 404 as for an id that doesn't exist) |
| 409 | `EMAIL_TAKEN`, `NAME_TAKEN` | Duplicate account email or resource name |
| 409 | `SLOT_UNAVAILABLE` | `details.slots: [{ start, reason: "booked" or "past" }]` |
| 409 | `BOOKING_NOT_CANCELLABLE` | Already cancelled, or already started |
| 500 | `INTERNAL_ERROR` | Any unexpected failure; the message is generic, and the details go to the server log only |

## 7. Authorization

| Action | Signed out | Member | Admin |
|---|---|---|---|
| Register, sign in | ✓ | — | — |
| View resources and availability | 401 | ✓ (active only) | ✓ (including inactive) |
| Book slots | 401 | ✓ for self | ✓ for self |
| View bookings | 401 | own | own and all |
| Cancel a booking before it starts | 401 | own (others → 404) | any |
| Create, edit, deactivate or reactivate resources | 401 | 403 | ✓ |

- **Session:** a JWT (HS256, `JWT_SECRET`, 7-day expiry) in an `httpOnly`, `SameSite=Lax` cookie that is `Secure` in production. Never stored in localStorage. `JWT_SECRET` is required and at least 32 characters; the API won't start without it.
- `requireAuth` verifies the token and **reloads the user on every request**, so role changes and deleted users take effect immediately. `requireAdmin` checks the role and returns 403 to members.
- Ownership checks live in the booking service. When a member targets another member's booking, the API returns 404, exactly as for an id that doesn't exist, so booking ids can't be probed. Admins can act on any booking.
- Registration ignores any `role` in the body. Passwords are hashed with bcrypt (cost 10) and must be 8–72 characters and at most 72 bytes in UTF-8, because bcrypt ignores everything after that. Login errors don't reveal whether an email exists.
- Logout clears the cookie. Server-side token revocation is deferred (accepted risk).
- Client route guards only shape the UI; the API is the authority.

## 8. Atomic booking and cancellation

Each booking is one **parent** record in `bookings` plus one **child** slot record per booked slot in `slot_reservations`. Every child stores its parent's id in `booking`, and the parent keeps the list of its `slotStarts`. A parent and its children are always created together and released together, each time in a single transaction.

**Booking (`POST /api/bookings`)**

1. Validate: 1–8 distinct ISO instants, each on the 30-minute grid, starting between 08:00 and 19:30 IST, all on the same IST date, with that date between today and today + 30 (IST). Failure → 400.
2. If any slot's start ≤ now, reject the whole request with 409 `SLOT_UNAVAILABLE` (reason `past`).
3. The resource must exist and be active, otherwise 404.
4. In one transaction (`session.withTransaction`): insert the parent booking as `confirmed`, then insert one child slot record per slot, each referencing the parent.
5. If even one slot is already taken, its insert hits the unique `{ resource, start }` index and the whole transaction aborts. **No parent and no slot records are written**, not even for the free slots. Look up which requested slots are taken and return 409 `SLOT_UNAVAILABLE` (reason `booked`). The server never books the remaining subset; DESIGN.md §5.6 describes what the client does with the selection.
6. On commit → 201 with the booking.

**Why this is safe:** the unique index makes two slot records for the same resource and slot impossible, whatever the timing. The transaction makes a booking all-or-nothing: no partially booked selection, no orphan slot record, no parent without its slot records. Colliding concurrent transactions get either a duplicate-key error or a transient write conflict. The driver retries the conflict, and the retry then hits the duplicate key. Duplicate-key errors are never retried.

**Cancellation (`POST /api/bookings/:id/cancel`)**

1. Load the booking. If it doesn't exist, or the caller is a member who doesn't own it → 404 (the same response in both cases). Admins may cancel any booking.
2. It must be `confirmed` and not yet started, otherwise 409 `BOOKING_NOT_CANCELLABLE`.
3. In **one MongoDB transaction** (a single session), do both of the following. Either both commit or neither does.
   - Conditionally update the parent's `status` from `confirmed` to `cancelled` and set `cancelledAt` and `cancelledBy`. If nothing matched because a concurrent cancel won, abort with 409.
   - Delete all of the booking's child slot records (`{ booking: id }`).
4. On commit → 200. With its slot records gone, the unique index no longer blocks those slots, so they can be booked again immediately. Cancellation never changes the parent's `date`, `slotStarts`, `start` or `end`, so History still shows the original times. Only whole bookings can be cancelled.

Slot records are deleted rather than marked cancelled. That way an existing slot record always means the slot is taken, and the unique index needs no filter.

## 9. MongoDB deployment requirement

Booking and cancellation use **multi-document transactions, which need a replica set or sharded cluster**. A standalone `mongod` rejects them.

- **Development:** a free MongoDB Atlas cluster (every Atlas cluster is a replica set), so nothing needs to be installed. Atlas accepts connections only from IP addresses on the project's **Network Access** list; from any other address the TLS handshake fails. A local single-node replica set (`mongod --replSet rs0`, then `rs.initiate()` once) also works.
- **Tests:** `MongoMemoryReplSet` from `mongodb-memory-server`, using the `wiredTiger` storage engine. This runs real transactions without an external database; the first run downloads a MongoDB binary.
- **Production (stretch):** Atlas.
- **Startup guard:** on boot the server runs `hello`. If the deployment is neither a replica set nor `mongos`, it exits with "SlotBook needs a MongoDB replica set (transactions)". It then builds indexes (`Model.init()`) before accepting requests, because the unique index on slot records must exist before the first booking.

## 10. Time: stored in UTC, shown in IST

- **Storage:** every instant is a UTC Date. `bookings.date` keeps the IST calendar date for grouping and display.
- **IST is a fixed offset** (UTC+05:30, no daylight saving), so server and client convert with a constant 330-minute offset and no date library. Never use the server's or the browser's local timezone.
- **Grid:** slots start at 08:00, 08:30 … 19:30 IST, 24 per day. Because +05:30 is a multiple of 30 minutes, every valid slot start also falls on :00 or :30 in UTC.
- **Examples:** the IST date 2026-11-14 runs from `2026-11-13T18:30Z` to `2026-11-14T18:30Z`; 08:00 IST = `02:30Z`; 19:30 IST = `14:00Z`; closing time 20:00 IST = `14:30Z`.
- **API contract:** `date` parameters are IST calendar dates (`YYYY-MM-DD`); instants are ISO-8601 UTC strings ending in `Z`. The server produces each slot's `start`, `end` and `label`; the client displays them and sends them back.
- **Display:** `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`, 24-hour `HH:mm`, always labelled IST. Pages show "All times IST (UTC+05:30)".
- **Today and the past:** "today" is computed in IST on both sides. A slot is past once its start ≤ now, so a slot already in progress cannot be booked.
- **Testability:** every read of "now" goes through one clock helper so tests can pin the time.

## 11. Milestones

Work through these in order, one at a time (see CLAUDE.md). Hours are rough budgets: **Day 1 ≈ M0–M3 (about 7.5 h), Day 2 ≈ M4–M7 (about 9 h)**. M8 is optional. If time runs short, cut in this order: M8 → the admin "All members" view (keep its API) → the mobile filter sheet (show filters inline instead) → the Previous/Next day buttons.

Repository layout (created in M0):

```
client/   Vite + React + TS + Tailwind   (src/pages, src/components, src/lib)
server/   Express + TS                   (src/routes, src/services, src/models, src/middleware, src/lib, test/)
PLAN.md · DESIGN.md · CLAUDE.md · README.md
```

### M0: Foundation (≈ 1.5 h). Status: done (verified 2026-11-13)

Checklist
- [x] npm workspaces root with `client` and `server`
- [x] Client: Vite React-TS app, Tailwind v4 (`@tailwindcss/vite`), DESIGN.md tokens in `@theme`, React Router, placeholder app shell
- [x] Server: Express 5 + TypeScript (`tsx` in development, `tsc` for builds), with `app.ts` separate from `index.ts`
- [x] Config loaded from the repo-root `.env` by Node's built-in loader and validated with Zod (real environment variables win); `.env.example` committed; `*.env` files ignored
- [x] DB connection with the replica-set guard, a read-only test transaction and the index build (§9); `GET /api/health`
- [x] Vite dev proxy from `/api` to the API server
- [x] Vitest + Supertest + `MongoMemoryReplSet`, with a health test and a guard test against a standalone `MongoMemoryServer`
- [x] Real commands recorded in CLAUDE.md
- [x] The API connects to the Atlas cluster in `.env`

Acceptance (results on 2026-11-13; details in the §12 log)
- ✅ The client dev URL shows the placeholder shell on the `canvas` background with the SlotBook header (headless Edge screenshots at 1280 px wide and inside a 375 px frame).
- ✅ `GET /api/health` through the client dev server returns 200 `{"status":"ok","db":"connected"}` against Atlas, and also against a local in-memory replica set.
  - The first Atlas attempt failed during the TLS handshake (SSL alert 80) although DNS and TCP worked. The most likely cause is the Network Access list: this network sends traffic from more than one public address, and the list held one. That is inferred, not proven. The address the port-27017 traffic used was never observed, and the list itself isn't visible from here.
  - After the user changed the Network Access list, the API connected. A re-check in a new session connected 7 times out of 7 in fresh processes.
- ✅ The guard test refuses a standalone MongoDB with the replica-set message. An unreachable `MONGODB_URI` makes the API exit with code 1 and "Could not connect to MongoDB …".
- ✅ The typecheck, test (9/9) and build commands succeed and are written into CLAUDE.md.

Notes
- Versions are pinned to work with Node 22.11 (D13). ESLint is allowed but not added yet; the strict typecheck covers M0.
- The API reads `MONGODB_URI` from the repo-root `.env`; the credentials are inside the URI. It also reads optional `MONGODB_DB_NAME` (default `slotbook`, since the URI names no database) and `PORT`. The other variables in `.env` aren't used.
- If SSL alert 80 returns, check the Network Access list against the machine's current public addresses first. This network uses more than one, so a single "current IP" entry may not be enough.

### M1: Accounts and roles (≈ 2.5 h). Status: built and verified on an in-memory replica set (2026-11-13); seeding the accounts in Atlas is pending

Checklist
- [x] User model; register, login, logout, me; bcrypt; JWT cookie
- [x] `requireAuth`, `requireAdmin`, Zod validation middleware, a central error handler that uses the error envelope
- [x] Seed script that creates an admin and a member from `SEED_*` env vars (idempotent)
- [x] Client: auth state from `/api/auth/me`; Sign in and Register pages; protected routes that return to the original page after sign-in; 401 → sign in; 403 and 404 pages; role-aware nav; sign out
- [x] API tests for the auth flow, the ignored `role` field and the 401s
- [ ] The seeded admin and member exist in the Atlas database. This needs `JWT_SECRET` and the `SEED_*` values in `.env` (the user supplies them), then `npm run seed`.

Acceptance (results on 2026-11-13; details in the §12 log). Browser checks ran in headless Edge against the Vite dev client and the built API, with an in-memory replica set standing in for Atlas.
- ✅ A new visitor registers and lands on `/resources` as a member. Reloading keeps the session. Signing out returns to `/login`, after which `/api/auth/me` returns 401.
- ✅ A wrong password shows "Email or password is incorrect.", and focus moves to that message.
- ✅ Registering with `"role": "admin"` in the body creates a member (API test, checked in the response and in the database).
- ✅ The seeded admin sees "Manage resources" in the nav. A member doesn't, and opening `/admin/resources` shows the 403 page at the same address. The seeded accounts here came from `npm run seed` with throwaway values, not the real ones.
- ✅ `document.cookie` in the browser console doesn't include the session cookie. The browser's cookie jar holds it as `httpOnly` with `SameSite=Lax`.

Notes
- **New environment variables.** `JWT_SECRET` is required (at least 32 characters), and the API refuses to start without it. The `SEED_*` variables are read only by `npm run seed`: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD`, and optional `SEED_ADMIN_NAME` and `SEED_MEMBER_NAME` (defaults Admin and Member). `.env.example` holds placeholders only.
- **Seed rules.** A missing account is created. An existing account keeps its name and password, and only its role is corrected, which is how someone who registered first becomes an admin (§3: roles change only through the seed or the database). Running it again changes nothing.
- **Placeholder pages.** `/resources`, `/bookings` and `/admin/resources` are honest placeholders that say the feature isn't built. They exist so the nav, the guards and the 403 page can be verified. They show no sample data.
- **Mid-session expiry.** Any 401 `UNAUTHENTICATED` from `apiFetch` ends the session and returns the user to `/login`, then back to the page they were on. A wrong password (401 `INVALID_CREDENTIALS`) doesn't trigger it. A deliberate sign-out doesn't bring the next sign-in back to the old page.
- **Console and M7.** A signed-out first load makes the browser log the expected 401 from `/api/auth/me`. Scripts can't suppress that line, so M7's "no console errors" check has to allow it.
- **Cookie and M8.** The cookie is `Secure` only when `NODE_ENV=production`, so the production deployment must be served over HTTPS.
- **No client tests.** The UI was checked with scripted headless-Edge runs. They aren't kept in the repo, because end-to-end tests are deferred (§3).

### M2: Resource catalog and discovery (≈ 2 h). Status: not started

Checklist
- [ ] Resource model and indexes; seed about 8 demo resources (rooms and equipment units, including a projector)
- [ ] `GET /api/resources`, `GET /api/resources/:id`
- [ ] Discovery page: search, type filter, minimum-capacity filter, result count, cards; loading, empty, no-results and error states; mobile layout
- [ ] Resource detail header (info only; slots arrive in M5)
- [ ] API tests: inactive resources excluded for members; 401 when signed out

Acceptance
- The seeded resources appear as cards. Typing "proj" narrows the list instantly. Type and capacity filters combine, and "Clear filters" restores the full list.
- A search with no matches shows the "No resources match your filters" empty state.
- "View availability" opens `/resources/:id` showing the name, type, location, capacity and tags.
- At 375 px wide the cards form one column and filters open from a "Filters" button.
- With the API stopped, the page shows the error state with "Try again" rather than a blank screen.

### M3: Admin resource management (≈ 1.5 h). Status: not started

Checklist
- [ ] `POST /api/resources` and `PATCH /api/resources/:id` with validation (rooms need a capacity; names are unique)
- [ ] Manage resources page: table on desktop, cards on mobile, status filter, Add/Edit dialog, Deactivate/Reactivate with confirmation
- [ ] API tests: member → 403; invalid body → 400; deactivated resource → 404 for members

Acceptance
- An admin adds "Room 204" with capacity 6, and a member sees it in discovery after reloading.
- Saving a room without a capacity shows an inline field error, and the API returns 400 `VALIDATION_ERROR`.
- Deactivating a resource hides it from members (its URL shows "Resource not found"). Reactivating restores it.

### M4: Booking engine, API only (≈ 3 h). Status: not started

Checklist
- [ ] IST time helpers and the clock helper, with unit tests covering the §10 examples
- [ ] Booking and SlotReservation models with their indexes (§5)
- [ ] Availability endpoint
- [ ] Transactional booking and cancellation of parent and slot records (§8)
- [ ] `GET /api/bookings/mine` and the admin `GET /api/bookings`
- [ ] Seed: a few demo bookings created through the booking service
- [ ] Automated checks V1–V5 (§12)

Acceptance
- V1–V5 pass when the recorded test command runs, with the output observed and logged in §12.
- With the time pinned, availability marks earlier slots `past` and seeded bookings `unavailable`, with `mine: true` only for their owner.
- The number of slot records always equals the number of slots in confirmed bookings (invariant test V6).

### M5: Slot grid and booking flow (≈ 3 h). Status: not started

Checklist
- [ ] Date control: native date input (min today IST, max today + 30), Previous day, Next day, Today
- [ ] Slot grid with every state and a legend (DESIGN.md §6), plus roving-tabindex keyboard support (DESIGN.md §7)
- [ ] Selection summary: side panel on desktop, sticky bar on mobile, 8-slot limit message
- [ ] Confirmation dialog → booking request → success message and refreshed grid
- [ ] Conflict handling exactly as in DESIGN.md §5.6
- [ ] Loading, fully booked and error states

Acceptance
- Selecting 10:00 and 10:30 shows "10:00–11:00 IST · 2 slots", total 1 h. Confirming shows "Booking confirmed", and both slots then read "Your booking".
- Two-browser test: member A books a slot that member B has also selected. B's confirm books nothing and shows a conflict message naming that time. The grid refreshes, B's other selections stay selected for editing, and B can then book them.
- Past and booked slots can't be selected with the mouse or the keyboard.
- Keyboard only: Tab moves into the grid, arrows move between slots, Space toggles, Tab reaches "Review booking", Enter opens the dialog, and Esc closes it with focus returned to the trigger.

### M6: My bookings and cancellation (≈ 1.5 h). Status: not started

Checklist
- [ ] `/bookings` with Upcoming and History views; table on desktop, cards on mobile; status lozenges
- [ ] Cancel through a confirmation dialog, then a success message and a refreshed list
- [ ] Admin "All members" view with a member column and cancellation
- [ ] Loading, empty and error states

Acceptance
- A booking made in M5 appears under Upcoming with its resource, IST date and times, and "Confirmed".
- Cancelling it moves it to History as "Cancelled", and its slots show as available on the resource page.
- An in-progress booking shows "In progress" and no Cancel action.
- An admin cancels a member's booking from All members, and the member then sees it as "Cancelled".

### M7: Polish and release readiness (≈ 1.5 h). Status: not started

Checklist
- [ ] Check every screen at 375 px and 1280 px wide, and at 200% zoom
- [ ] Keyboard-only and screen-reader (Narrator or NVDA) smoke tests of the member and admin journeys
- [ ] Page titles, skip link, focus after navigation, reduced-motion behavior
- [ ] Copy pass: sentence case and specific button labels
- [ ] README: real setup steps, commands, demo accounts, honest feature status
- [ ] Full run of §12 (automated and manual) with results logged

Acceptance
- Every §12 manual check has been run and logged with its date and result.
- Following the README from a fresh clone gets the app running (done once and logged).
- The browser console shows no errors during the member and admin journeys.

### M8: Deploy (stretch, ≈ 1 h). Status: not started

Checklist
- [ ] Express serves the built client with an SPA fallback (same origin, so the cookie just works)
- [ ] Production Atlas database, environment variables and demo seed
- [ ] Deploy to a Node host such as Render

Acceptance
- On the public URL a demo member can sign in, book and cancel, and `/api/health` returns 200.

## 12. Critical verification

The automated checks run with Vitest and Supertest against the real Express app and a `MongoMemoryReplSet`, so transactions are real. Time is pinned through the clock helper.

| ID | Scenario | Expected result |
|---|---|---|
| V1 | **Concurrent booking:** 10 members send `POST /api/bookings` for the same resource and slot at the same moment | Exactly one 201 and nine 409 `SLOT_UNAVAILABLE`; one confirmed booking; one slot record for that slot |
| V1b | Two members at the same moment request overlapping selections `[10:00, 10:30]` and `[10:30, 11:00]` | Exactly one succeeds; the other ends up with no parent booking and no slot records |
| V2 | **Partial overlap:** A holds 10:00 and 10:30; B requests 10:30 and 11:00 | The whole request is rejected: 409 listing only 10:30 (`booked`); no parent booking and no slot records exist for B, so 11:00 is still free. B then books 11:00 alone → 201 (adjacent slots are fine) |
| V3 | **Cancellation:** A cancels the booking from V2 | 200; the parent is `cancelled` with its `date`, `slotStarts`, `start` and `end` unchanged, and all its slot records are gone; availability shows 10:00 and 10:30 as available; B books 10:30 → 201 |
| V3b | Cancellation edge cases | A second cancel → 409; cancelling a started booking → 409; a member cancelling another member's booking → 404, the same body as for an unknown id, and nothing changes; owner and admin cancelling the same booking at the same moment → one 200 and one 409; an admin cancelling a member's booking → 200 |
| V4 | **Unauthorized access** | No cookie → 401 on resources, availability, booking, my bookings and cancel; a tampered or expired token → 401; member → 403 on `POST` and `PATCH /api/resources` and on `GET /api/bookings`; `role` ignored at registration; member → 404 for an inactive resource's detail, availability and booking; member → 404 when cancelling another member's booking |
| V5 | Time and validation | 08:00 IST ⇄ `02:30Z`; IST date rollover at 18:30Z; past slot → 409 `past`; starts at 10:15, 07:30 or 20:00 → 400; mixed dates, duplicate slots, more than 8 slots or a date beyond +30 days → 400 |
| V6 | **Record invariant**, checked after every scenario above | Each confirmed booking has exactly one slot record per slot; cancelled bookings and rejected requests have none; no slot record points to a missing or cancelled booking |

Manual checks (M5–M7): two-browser conflict test (normal plus private window), keyboard-only booking and cancellation, booking at 375 px, and screen-reader announcements of the success and conflict messages.

**Verification log.** Add a row only after a check has actually run.

| Date | Milestone | Check | Result | Notes |
|---|---|---|---|---|
| 2026-11-13 | M0 | `npm install` | Pass | 270 packages, 0 vulnerabilities, no engine warnings |
| 2026-11-13 | M0 | `npm run typecheck` | Pass | Client and server |
| 2026-11-13 | M0 | `npm test` | Pass | 9 tests in 3 files: health (ok, 503), guard (standalone refused, unreachable), config validation and credential redaction |
| 2026-11-13 | M0 | `npm run build` | Pass | `client/dist` (CSS 9.87 kB, JS 318.86 kB) and `server/dist` |
| 2026-11-13 | M0 | Dev API and Vite proxy, in-memory replica set standing in for Atlas | Pass | `/api/health` 200 directly on :4000 and through :5173 |
| 2026-11-13 | M0 | Built API (`npm start`, `node server/dist/index.js`), in-memory replica set | Pass | `/api/health` 200 |
| 2026-11-13 | M0 | Client shell and tokens | Pass | Token utilities compiled and default palette cleared; headless Edge screenshots at 1280 px and in a 375 px frame show the header, canvas and card with no overflow |
| 2026-11-13 | M0 | Unreachable and placeholder `MONGODB_URI` | Pass | Exit code 1 with a clear message; environment variables override `.env` |
| 2026-11-13 | M0 | Credential scan of every log | Pass | No credentials or cluster hostnames in any output |
| 2026-11-13 | M0 | Dev API against Atlas | **Blocked** | DNS and TCP 27017 OK; TLS rejected by all 3 servers (SSL alert 80). Most likely the Network Access list missed an address this network sends traffic from (inferred, not proven) |
| 2026-11-13 | M0 | Dev API and Vite proxy against Atlas, after the user changed the Network Access list (the exact entry isn't known) | Pass | `/api/health` 200 on :4000 and through :5173; replica set and transactions verified |
| 2026-11-13 | M0 | Atlas re-check in a new session: the API's own `connectDatabase` (connect, replica-set check, test transaction, index build) in a one-shot script, 7 fresh processes | Pass | 7/7, about 0.9 s each; no credentials or hostnames printed |
| 2026-11-13 | M0 | `npm start` against Atlas | Pass | `/api/health` 200 on :4001 |
| 2026-11-13 | M0 | Credential scan of the Atlas run logs | Pass | No credentials or cluster hostnames |
| 2026-11-13 | M1 | `npm install` of `bcryptjs` 3.0.3, `jsonwebtoken` 9.0.3, `cookie-parser` 1.4.7 and the two `@types/*` packages | Pass | 0 vulnerabilities. Node engine ranges checked against 22.11 (bcryptjs declares none). `npm ls vite` shows the single version 6.4.6. `@types/bcryptjs` skipped: it's a deprecated stub, since bcryptjs ships its own types |
| 2026-11-13 | M1 | `npm run typecheck` | Pass | Client and server |
| 2026-11-13 | M1 | `npm test` | Pass | 57 tests in 5 files: auth 38 (register, login, me, logout, `requireAdmin`, error envelope), seed 7, config 8, health 2, guard 2 |
| 2026-11-13 | M1 | Mutation checks on the new tests | Pass | Dropping the unique email index fails 2 tests; letting `role` through registration fails 1; restoring the old body-parser error mapping fails 2. Each change was reverted afterwards and the suite re-run green |
| 2026-11-13 | M1 | `npm run build` | Pass | `client/dist` (CSS 17.24 kB, JS 336.95 kB) and `server/dist` |
| 2026-11-13 | M1 | `npm run seed` against an in-memory replica set, throwaway `SEED_*` values | Pass | With no `SEED_*`: exit 1, names the missing variables, prints no values. First run: admin and member created. Second run: both unchanged |
| 2026-11-13 | M1 | Browser acceptance script: headless Edge, Vite dev client plus built API, in-memory replica set | Pass | 49/49 checks, run on the final build: register, land on `/resources`, reload, sign out, `me` 401, wrong password, 403 and 404 pages, return to the original page, seeded admin and member nav, `httpOnly` cookie absent from `document.cookie`, focus and titles, skip link, 375 px menu with 44 px targets, Esc and Back close the menu. Only the expected 401 responses and one deliberate 409 reached the console |
| 2026-11-13 | M1 | Mid-session expiry: cookie removed, then the app's own `apiFetch` called from the page | Pass | 6/6: the 401 `UNAUTHENTICATED` sends the user to `/login`, sign-in returns to the page they were on, and a wrong password isn't treated as expiry |
| 2026-11-13 | M1 | Built API booted against Atlas, throwaway `JWT_SECRET` passed in the environment only | Pass | Without `JWT_SECRET`: exit 1, message names the variable only. With it: replica set and transactions verified, `/api/health` 200, `/api/auth/me` 401, unknown API path 404 in the envelope. Startup builds the `users` indexes, which created the empty `users` collection and its unique email index in the Atlas `slotbook` database. No user was created |
| 2026-11-13 | M1 | Independent code review (medium) | Done | 10 findings. 4 fixed: body-parser 4xx errors now return 400 instead of 500; the seed shares the env parser; a regression test for the unique email index; the client email-check comment. 1 resolved by this documentation update. 5 declined as not applicable or out of scope: login-password length cap, seed find-then-create race, `Secure` cookie over plain HTTP (an M8 concern), `signOut` rejection (the caller already catches it), a DB error in `requireAuth` giving 500 |
| 2026-11-13 | M1 | Credential scan of the full working-tree diff against the values in `.env` and `atlas-credentials.env` | Pass | No value found; no Atlas hostnames in the diff |
| not run | M1 | Seeded admin and member in Atlas, signing in against Atlas | **Pending** | Needs the user's `JWT_SECRET` and `SEED_*` values in `.env`, then `npm run seed` |

## 13. Decisions (confirmed 2026-11-13)

| # | Decision | Reason |
|---|---|---|
| D1 | One org, IST only, roles member and admin, sign-in required on every app page | Smallest scope that still delivers the product |
| D2 | TypeScript on client and server, without a shared package (a few types are duplicated) | Chosen during planning; avoids monorepo build plumbing |
| D3 | Fixed 30-minute slots from 08:00 to 20:00 IST every day, including weekends; one resource and one date per booking; 1–8 slots, not necessarily consecutive; bookable up to 30 days ahead | A simple grid that matches the design |
| D4 | A parent booking record plus one child slot record per booked slot; a unique `{ resource, start }` index on the slot records; a transaction around every create and cancel; a request with any unavailable slot is rejected whole | The database enforces no double booking and no partial booking, and it is easy to test |
| D5 | Each equipment item is its own resource | Chosen during planning; same rules as rooms |
| D6 | Approval workflow deferred to post-MVP (future enhancement in §3) | Doesn't fit 1–2 days; the data model can take a `pending` status later |
| D7 | JWT in an httpOnly SameSite=Lax cookie, user reloaded on every request, no server-side revocation | Simple and safe enough for the MVP |
| D8 | Discovery filters run in the browser over the list of active resources | Small catalog, instant results, no extra endpoints |
| D9 | Resources are deactivated, never deleted; their existing bookings stay until cancelled | Keeps booking history intact |
| D10 | Only the dependencies below are allowed; anything else needs approval | Protects the 1–2 day scope |
| D11 | Real screens show only real API data; previews are labelled (DESIGN.md §9) | An honest demo |
| D12 | Members get 404, not 403, for another member's booking; admins can act on any booking | Doesn't reveal whether a booking id exists |
| D13 | Toolchain pinned to Node 22.11-compatible majors: Vite 6.4, @vitejs/plugin-react 4.7, Vitest 4.1, React Router 7.18, TypeScript 5.9. The rest are current: React 19.3, Tailwind 4.3, Express 5.3, Mongoose 9.12, Zod 4.6, mongodb-memory-server 11.3 | The dev machine runs Node 22.11; newer majors need 22.12 or later (React Router 8 needs 22.22 or later). Bump after a Node update |

**Dependency allowlist**
- Client: `react`, `react-dom`, `react-router`, `tailwindcss`, `@tailwindcss/vite`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, and the ESLint packages from the Vite template.
- Server: `express`, `mongoose`, `zod`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`. Dev: `typescript`, `tsx`, `vitest`, `supertest`, `mongodb-memory-server`, and the matching `@types/*` packages.
- Not used: data-fetching or state libraries, form libraries, UI kits, icon packs, date libraries, `axios`, `cors`, `dotenv`, `concurrently`.

## 14. Known MVP limitations (accepted)

These limits are deliberate for a 1–2 day build and are listed so nobody mistakes them for bugs. Features left out entirely are listed in §3.

- **Sessions:** signing out only clears the cookie. With no server-side revocation, a copied token stays valid until it expires (at most 7 days). Role changes and deleted users still take effect immediately.
- **Security hardening:** no rate limiting, security headers, email verification, password reset or SSO.
- **Lists and search:** discovery filters run in the browser over all active resources, which suits a small catalog. Booking lists show the latest 50, with no pagination or sorting.
- **Booking rules:** fixed 30-minute slots, 08:00–20:00 IST every day, up to 30 days ahead and at most 8 slots per booking. There is no rescheduling, partial cancellation, recurrence or approval.
- **Time:** IST only, shown in 24-hour format.
- **Deactivation:** deactivating a resource doesn't cancel its existing bookings; an admin cancels them by hand.
- **Data clean-up:** slot records of past bookings are kept, and there is no clean-up job.
- **Testing:** server behavior has automated tests. The UI is checked manually, with no component tests, no end-to-end tests and no CI.
- **Infrastructure:** MongoDB must be a replica set (Atlas for development). The first test run downloads a MongoDB binary. Deployment is optional (M8).
