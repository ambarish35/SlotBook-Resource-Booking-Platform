# SlotBook — Implementation Plan

> **Status: Plan approved on 2026-11-13. M0 (foundation) is done and verified, including the live Atlas connection. M1 (accounts and roles) is done and verified, including the seeded accounts in Atlas. M2 (resource catalog and discovery) is done and verified, including its demo data in Atlas. M3 (admin resource management) is done and verified on an in-memory replica set; it adds no collection or index, and Atlas wasn't touched. M4 (booking engine, API only) is done and verified on an in-memory replica set; it adds two collections and four indexes, which the API builds at startup (the agent ran nothing against Atlas). M5 (slot grid and booking flow, the first booking screens) is done and verified on an in-memory replica set; it changes only `client/`, adds no collection or index, and Atlas wasn't touched. M6 (My bookings and cancellation, with the admin All members view) is done and verified on an in-memory replica set; it changes only `client/` and DESIGN.md, adds no collection or index, and Atlas wasn't touched. M7 (polish and release readiness) is done except its screen-reader checks, which need a person: everything else on its checklist and acceptance list was run and logged on an in-memory replica set, and Atlas wasn't touched. M8 (optional deployment) hasn't started, so the app is not ready to deploy yet.** Every checklist item below stays unchecked until it is built **and** verified.
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
| location | string | required, 1–120 chars, e.g. "Block A, 2nd floor" |
| capacity | number or null | rooms: whole number ≥ 1; equipment: null |
| description | string | optional, ≤ 500 chars |
| tags | string[] | optional, ≤ 10, each 1–30 characters, e.g. "Projector" |
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

JSON under `/api`. Authentication uses an httpOnly session cookie (§7). Every error has the shape `{ "error": { "code", "message", "details"? } }`. A user is returned as `{ id, name, email, role }`, never with its password hash. A resource is returned as `{ id, name, type, location, capacity, description, tags, isActive }`, and the list endpoint returns an array of them: rooms first and then equipment, each alphabetical ignoring case.

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

`POST` and `PATCH /api/resources` bodies (admins only):

- **`POST`** takes `name`, `type` and `location` (all required), and `capacity` (required for a room), `description` and `tags` (optional). The new resource is always active, so `isActive` in the body is ignored. It returns 201 with the resource.
- **`PATCH`** takes any of `name`, `type`, `location`, `capacity`, `description`, `tags` and `isActive`, and at least one of them. `isActive: false` deactivates and `true` reactivates. Only the fields it is given change. It returns 200 with the whole resource.
- **Both** drop unknown keys (an `id`, a `role`, timestamps), trim text, and drop repeated tags ignoring case. The limits are 80 characters for the name, 120 for the location, 500 for the description, and 10 tags of at most 30 characters. A room's capacity must be a whole number of 1 or more; equipment has none. A capacity sent with equipment is checked like any other (a whole number of 1 or more, or `null`) and then ignored, and turning a room into equipment clears the stored one.
- **Order of checks:** signed in (401), then admin (403, whatever a well-formed JSON body holds or the id is), then the body (400), then the resource (404), then the database (409 for a taken name). One exception: `express.json()` runs ahead of every route, so text that isn't valid JSON, or a body over 100 kB, is a 400 even for a signed-out caller or a member. Nothing is read or written in that case. A second exception: a path parameter that can't be decoded (an id such as `%E0%A4%A`) is rejected by Express before any handler runs, so a signed-in caller gets 404 (a member's `PATCH` too, rather than 403) and a signed-out one 401.
- **Capacity rules run on every update.** They live in the model's validate hook, so `PATCH` loads the document, sets only the fields above and calls `save()`. It never uses `updateOne` or `findOneAndUpdate`, which skip that hook.
- **Simultaneous edits** of one resource all succeed, and the last write wins per field. Saving `tags` makes Mongoose check the document's version, so a save that lost a race is applied again to a fresh copy (up to 10 times) instead of failing.

Availability response:

```json
{ "resourceId": "…", "date": "2026-11-14", "timeZone": "Asia/Kolkata", "slotMinutes": 30,
  "slots": [ { "start": "2026-11-14T02:30:00.000Z", "end": "2026-11-14T03:00:00.000Z",
               "label": "08:00", "status": "available", "mine": false } ] }
```

`status` is `available`, `unavailable` or `past`. `mine` is true only on the caller's own booked slots; members never see who else booked a slot.

- **`past` wins over `unavailable`.** A slot whose start is at or before now is `past` even when someone holds it, the same order §8 checks them in. `mine` still marks the caller's own slots, so an owner sees their own slot that has started as `past` with `mine: true`.
- **The date.** It must be a real calendar date (`YYYY-MM-DD`); anything else, or a missing one, is 400 with `details.fields.date`. A date more than 30 days after today (IST) is 400, because nothing there can be booked. A date before today is allowed and shows every slot as `past`.
- **Order of checks:** signed in (401), the query (400), the date window (400), then the resource (404: an inactive resource is 404 for members, and admins may look at it).
- Nothing in the response identifies another member, for members and for admins alike.

Booking request: `{ "resourceId": "…", "slotStarts": ["2026-11-14T04:30:00.000Z", …] }`. The client sends back `start` values from the availability response and never computes instants itself.

- **Body rules (400, on `details.fields.slotStarts` or `resourceId`):** `resourceId` is a 24-character hex id. `slotStarts` is 1–8 ISO-8601 UTC instants ending in `Z` (a fraction is optional; an offset such as `+05:30` is refused), each on the 30-minute grid from 08:00 to 19:30 IST, with no repeats, all on one IST date. Unknown keys (a `user`, `status`, `start`…) are dropped, so a booking is always the caller's. The server sorts the slots.
- **Order of checks (§8):** signed in (401), the body (400), the date window of today to today + 30 in IST (400), any slot that has already started (409 `SLOT_UNAVAILABLE`, reason `past`, listing only those), the resource (404: an inactive resource is 404 for everyone, admins included), then the transaction (409 `SLOT_UNAVAILABLE`, reason `booked`, listing only the taken slots, oldest first). A date earlier than today is a 400; a slot earlier today is a 409.
- **One booking shape** for the 201, the cancel 200 and the lists: `{ id, resource: { id, name, type, location }, user: { id, name, email }, date, slotStarts, start, end, status, cancelledAt, createdAt }`. Instants are ISO UTC strings, and `cancelledAt` is `null` until the booking is cancelled.
- **Lists** are bare arrays of at most 50 rows (the client shows "Showing the latest 50" when it receives 50). `view` is `upcoming` (the default) or `history`; anything else is 400.
  - `upcoming`: confirmed bookings that haven't ended, soonest first, so one in progress is still upcoming.
  - `history`: cancelled bookings and confirmed ones that have ended, newest start first.
  - `mine` is always the caller's own, for admins too. `GET /api/bookings` is everyone's, and a member gets 403 before the query is read.
  - If a member's account was removed from the database by hand, their bookings still appear, with the name "Deleted account" and an empty email, rather than breaking the whole list.
- **Cancelling** (the owner, or an admin): a second cancel, or one at or after the booking's start, is 409 `BOOKING_NOT_CANCELLABLE` (the message says which). Someone else's booking, an unknown id and a malformed id are the same 404 for members.

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
   - Conditionally update the parent's `status` from `confirmed` to `cancelled` and set `cancelledAt` and `cancelledBy`. The update also requires that the booking's start is still after the clock, which is read again inside the transaction, so a booking that starts while the request is in flight can't be cancelled. If nothing matched because a concurrent cancel won, or because the booking has just started, abort with 409.
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

### M1: Accounts and roles (≈ 2.5 h). Status: done (built and verified 2026-11-13; accounts seeded and checked in Atlas 2026-11-15)

Checklist
- [x] User model; register, login, logout, me; bcrypt; JWT cookie
- [x] `requireAuth`, `requireAdmin`, Zod validation middleware, a central error handler that uses the error envelope
- [x] Seed script that creates an admin and a member from `SEED_*` env vars (idempotent)
- [x] Client: auth state from `/api/auth/me`; Sign in and Register pages; protected routes that return to the original page after sign-in; 401 → sign in; 403 and 404 pages; role-aware nav; sign out
- [x] API tests for the auth flow, the ignored `role` field and the 401s
- [x] The seeded admin and member exist in the Atlas database. The user put `JWT_SECRET` and the `SEED_*` values in `.env` and ran `npm run seed`; the accounts were then checked read-only and through sign-in (§12, 2026-11-15).

Acceptance (results on 2026-11-13; details in the §12 log). Browser checks ran in headless Edge against the Vite dev client and the built API, with an in-memory replica set standing in for Atlas.
- ✅ A new visitor registers and lands on `/resources` as a member. Reloading keeps the session. Signing out returns to `/login`, after which `/api/auth/me` returns 401.
- ✅ A wrong password shows "Email or password is incorrect.", and focus moves to that message.
- ✅ Registering with `"role": "admin"` in the body creates a member (API test, checked in the response and in the database).
- ✅ The seeded admin sees "Manage resources" in the nav. A member doesn't, and opening `/admin/resources` shows the 403 page at the same address. In the scripted browser run the seeded accounts came from `npm run seed` with throwaway values; the real seeded accounts were checked in Atlas through sign-in (§12, 2026-11-15) and by the user in a browser.
- ✅ `document.cookie` in the browser console doesn't include the session cookie. The browser's cookie jar holds it as `httpOnly` with `SameSite=Lax`.

Notes
- **New environment variables.** `JWT_SECRET` is required (at least 32 characters), and the API refuses to start without it. The `SEED_*` variables are read only by `npm run seed`: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD`, and optional `SEED_ADMIN_NAME` and `SEED_MEMBER_NAME` (defaults Admin and Member). `.env.example` holds placeholders only.
- **Seed rules.** A missing account is created. An existing account keeps its name and password, and only its role is corrected, which is how someone who registered first becomes an admin (§3: roles change only through the seed or the database). Running it again changes nothing.
- **Placeholder pages.** `/resources`, `/bookings` and `/admin/resources` are honest placeholders that say the feature isn't built (M2, M3 and M6 have since replaced them). They exist so the nav, the guards and the 403 page can be verified. They show no sample data.
- **Mid-session expiry.** Any 401 `UNAUTHENTICATED` from `apiFetch` ends the session and returns the user to `/login`, then back to the page they were on. A wrong password (401 `INVALID_CREDENTIALS`) doesn't trigger it. A deliberate sign-out doesn't bring the next sign-in back to the old page.
- **Console and M7.** A signed-out first load makes the browser log the expected 401 from `/api/auth/me`. Scripts can't suppress that line, so M7's "no console errors" check has to allow it.
- **Cookie and M8.** The cookie is `Secure` only when `NODE_ENV=production`, so the production deployment must be served over HTTPS.
- **No client tests.** The UI was checked with scripted headless-Edge runs. They aren't kept in the repo, because end-to-end tests are deferred (§3).

### M2: Resource catalog and discovery (≈ 2 h). Status: done (built and verified 2026-11-15, including against Atlas)

Checklist
- [x] Resource model and indexes; seed about 8 demo resources (rooms and equipment units, including a projector)
- [x] `GET /api/resources`, `GET /api/resources/:id`
- [x] Discovery page: search, type filter, minimum-capacity filter, result count, cards; loading, empty, no-results and error states; mobile layout
- [x] Resource detail header (info only; slots arrive in M5)
- [x] API tests: inactive resources excluded for members; 401 when signed out

Acceptance (results on 2026-11-15; details in the §12 log). Browser checks ran in headless Edge against the Vite dev client and the built API, with an in-memory replica set standing in for Atlas. The data and API were then checked against Atlas, and the discovery page in a browser on the user's own dev stack.
- ✅ The seeded resources appear as cards. Typing "proj" narrows the list instantly, from 8 to 4, with no further request to the API. Type and capacity filters combine, and "Clear filters" restores the full list.
- ✅ A search with no matches shows the "No resources match your filters" empty state.
- ✅ "View availability" opens `/resources/:id` showing the name, type, location, capacity and tags.
- ✅ At 375 px wide the cards form one column and filters open from a "Filters" button, as a bottom sheet.
- ✅ With the API stopped, the page shows the error state with "Try again" rather than a blank screen, and "Try again" loads the list once the API is back.

Notes
- **Demo data.** `npm run seed` now also creates 8 demo resources: Boardroom, Focus Room, Huddle 1, Huddle 2, Training Room, Projector 1, Projector 2 and Conference speakerphone. It skips any resource that already exists, matching names ignoring case, so it never overwrites an admin's edits or re-activates a deactivated resource. Running it again creates nothing.
- **Behavior details.** `status` other than `active` or `all` gives 400; a malformed id gives 404, like an unknown one. A minimum capacity keeps only rooms of that size or more, because equipment has no capacity. Other UI decisions are recorded in DESIGN.md §5.3 and §5.4.
- **For M3: the capacity rules are not enforced on updates.** They live in the model's validate hook (a room needs a whole-number capacity of 1 or more; equipment is forced to null). That hook doesn't run for `updateOne` or `findOneAndUpdate`, so M3's PATCH must load the document, change it and `save()`, or the rules can be bypassed.
- **Atlas side effect.** The `resources` collection and its two indexes appeared in Atlas before the seed ran. The user's running `tsx watch` dev API restarted on the M2 code, and startup builds the indexes of every model.
- **No client tests.** As in M1, the UI was verified with scripted headless-Edge runs that aren't kept in the repo (§3).

### M3: Admin resource management (≈ 1.5 h). Status: done (built and verified 2026-11-15, on an in-memory replica set)

Checklist
- [x] `POST /api/resources` and `PATCH /api/resources/:id` with validation (rooms need a capacity; names are unique)
- [x] Manage resources page: table on desktop, cards on mobile, status filter, Add/Edit dialog, Deactivate/Reactivate with confirmation
- [x] API tests: member → 403; invalid body → 400; deactivated resource → 404 for members

Acceptance (results on 2026-11-15; details in the §12 log). Browser checks ran in headless Edge against the Vite dev client and the built API, with an in-memory replica set standing in for Atlas.
- ✅ An admin adds "Room 204" with capacity 6 from the Add dialog. The success message "Room 204 added" is focused, the row appears in catalog order, and after signing in as a member and reloading, "Room 204" is in discovery (10 resources) with its own page.
- ✅ Saving a room without a capacity shows the inline error "Enter a capacity of 1 or more" on the Capacity field, with focus there, and sends nothing. The same request made straight to the API returns 400 `VALIDATION_ERROR` with `details.fields.capacity`.
- ✅ Deactivating "Room 204" (after the confirmation) removes it from a member's discovery, and its URL shows "Resource not found". Reactivating it (no confirmation) restores both.
- ✅ A member calling `POST` or `PATCH /api/resources` directly gets 403 and nothing changes; opening `/admin/resources` shows the 403 page.
- ✅ Loading, empty, no-match, error and success states, at 1280, 1024, 768 and 375 px (§12 log).

Notes
- **The M2 carryover is closed.** `PATCH` loads the document, sets only the permitted fields and calls `save()`, so the capacity rules in the model's validate hook run on every update. Tests that an `updateOne`-based version could not pass: turning equipment into a room without a capacity is refused (400) and leaves it unchanged; turning a room into equipment clears the stored capacity even when none is sent; clearing a room's capacity is refused.
- **Decisions where this plan was silent** (also in §5, §6 and DESIGN.md §5.8):
  - A location is at most 120 characters (the other text fields already had limits).
  - Tags are trimmed and de-duplicated ignoring case; every tag problem is reported on the single `tags` field, so the form can show it.
  - A capacity sent for equipment is checked like any other and then ignored, which matches the model's rule that equipment has none.
  - The Edit form sends only the fields that changed, so saving one field can't undo another admin's edit of a different field. With nothing changed, the dialog says so and sends nothing.
  - Deactivating and reactivating go through `PATCH` with `isActive`; there is no separate endpoint and no delete (D9).
  - The page's default view is All, so a deactivated row stays and turns Inactive. Search covers the name and the location.
  - After a change, the page updates the row from the server's response instead of reloading the list, and slots it in with the same ordering rule as the server (checked against a fresh API call in the browser run).
- **Shared components extended, not redesigned:** `Dialog` (a 640 px form width, a full-screen sheet below 768 px, a busy state that blocks every way of closing, focus on the title for text-only confirmations), `Message` (a dismiss button), `Button` (a compact size for table rows), `SearchField` (label and caption), plus new `SelectField`, `TextAreaField` and `ViewSwitch`.
- **Not run:** a check against Atlas (nothing here needs it: no new collection or index, and the mutation tests belong on an isolated database); mutation checks on the new tests; screen-reader testing; Safari. The user's own dev API reaches Atlas, so the first real edit through the page will be the first write to Atlas through these endpoints.
- **No client tests,** as in M1 and M2: the UI was verified with scripted headless-Edge runs that aren't kept in the repo (§3).

### M4: Booking engine, API only (≈ 3 h). Status: done (built and verified 2026-11-15, on an in-memory replica set)

Checklist
- [x] IST time helpers and the clock helper, with unit tests covering the §10 examples
- [x] Booking and SlotReservation models with their indexes (§5)
- [x] Availability endpoint
- [x] Transactional booking and cancellation of parent and slot records (§8)
- [x] `GET /api/bookings/mine` and the admin `GET /api/bookings`
- [x] Seed: a few demo bookings created through the booking service
- [x] Automated checks V1–V5 (§12), and V6 after every booking scenario

Acceptance (results on 2026-11-15; details in the §12 log). Everything ran on in-memory replica sets, through Vitest and Supertest and through the built API over real HTTP.
- ✅ V1–V5 pass with the recorded test command (`npm test`, 346 tests), and V6 is checked after every test of the booking files.
  - V1: ten members book one slot at the same moment, three rounds: each round has exactly one 201 and nine 409 `SLOT_UNAVAILABLE`, one booking and one slot record.
  - V1b: overlapping selections made at the same moment, five rounds with the order varied: exactly one succeeds, the other leaves no parent and no slot record.
  - Also 14 members asking for overlapping sets of three slots at once, and 20 simultaneous calls to the service itself: every request ends in a 201 or a 409, every success is stored whole, every refusal leaves nothing, no slot is held twice.
- ✅ With the time pinned at 09:30 IST, availability marks the earlier slots (including the one in progress) `past` and seeded bookings `unavailable`, with `mine: true` only for their owner (`availability` and `seed-bookings` tests).
- ✅ The number of slot records always equals the number of slots in confirmed bookings: `expectBookingInvariant()` (V6) runs after every test of the booking files, and after each round of the concurrency tests.
- ✅ The built API over real HTTP, with the real `npm run seed`: 29 of 29 checks (§12 log).

Notes
- **Decisions where this plan was silent** (now in §6): `past` wins over `unavailable` in availability, with `mine` kept; availability accepts any real date up to today + 30 and shows an earlier date as all `past`; an inactive resource can be looked at by an admin but booked by nobody (§8 step 3, as written); one booking shape with the resource and the member for every response; lists are bare arrays of at most 50, `upcoming` by `end` after now (so one in progress counts), `history` by newest start; `view` defaults to `upcoming`; the two 409s of cancellation share one code and differ in their message; a booking whose member was removed by hand lists as "Deleted account".
- **A booking's `end` and `date`.** `end` is the last slot's start plus 30 minutes and `date` is the IST date; both are set once and never change, including on cancellation.
- **What makes double booking impossible is the unique index, not the transaction.** In a throwaway database with that index dropped, ten simultaneous bookings of one slot all succeeded in every one of 8 rounds; with it, exactly one did in every round. The transaction is what keeps a booking and its slot records together (tests make the second write fail and check that no parent survives, and that a failed release leaves a booking confirmed).
- **Demo bookings.** Four are created through the booking service, two for the member and two for the admin, dated one to three days ahead. The seed creates nothing while either demo account has a confirmed booking that hasn't ended, and a fresh set after they are over. History can't be seeded this way, because the service refuses slots that have started.
- **Atlas.** The agent ran nothing against Atlas and wrote nothing to it. The API builds the two collections and four indexes at startup, and the user's running `tsx watch` API restarted on the M4 code and answered `/api/health` afterwards, so they were almost certainly created then (inferred). `npm run seed` has not been run with the demo bookings: the first real run will be the first booking write to Atlas.
- **Not run:** browser checks and screenshots (there is no UI in M4 and `client/` didn't change: the build's CSS and JS sizes are identical to M3's); mutation checks on the tests, apart from the one index-drop check above, run because a concurrency test that passes first time may not be racing; checks against Atlas; screen-reader testing.
- **Test tooling fixed in M4** (HANDOFF.md has the details): a test setup that failed after the database had started leaked a helper process and its data directory, and a killed test run left its directory behind. In-memory databases now get a named data directory that `stop()` and a failed startup remove, and the next run removes the leftovers of killed ones.

### M5: Slot grid and booking flow (≈ 3 h). Status: done (built and verified 2026-11-15, on an in-memory replica set)

Checklist
- [x] Date control: native date input (min today IST, max today + 30), Previous day, Next day, Today
- [x] Slot grid with every state and a legend (DESIGN.md §6), plus roving-tabindex keyboard support (DESIGN.md §7)
- [x] Selection summary: side panel on desktop, sticky bar on mobile, 8-slot limit message
- [x] Confirmation dialog → booking request → success message and refreshed grid
- [x] Conflict handling exactly as in DESIGN.md §5.6
- [x] Loading, fully booked and error states

Acceptance (results on 2026-11-15; details in the §12 log). Checked in headless Edge at desktop and phone sizes, against the Vite client and the built API, on an in-memory replica set, with the server clock pinned to 12:15 IST.
- ✅ Selecting 10:00 and 10:30 shows "10:00–11:00 IST · 2 slots" and a total of 1 h. Confirming shows "Booking confirmed · Room A · …", the database holds one confirmed booking with both slots, and both slots then read "Your booking".
- ✅ Two-browser test (two separate browser contexts, so separate sessions), at 1280 px and with the second member on a 375 px phone: A books 15:30 while B has 15:00–16:00 selected. B's confirm books nothing (no booking, no slot record for B, 15:00 and 16:00 still free), shows the warning "15:30–16:00 IST was booked by someone else while you were choosing. Nothing was booked. We refreshed the times and kept your other 2 selections.", draws 15:30 as "Just taken", keeps 15:00 and 16:00 selected, and B then books them. No "Booking confirmed" appears until the real success.
- ✅ Past and booked slots can't be selected with the mouse or the keyboard: they take focus, announce "…, past" or "…, booked", and Space, Enter and clicks change nothing.
- ✅ Keyboard only: Tab enters the grid on the first available slot, arrows, Home and End move between slots (↓ by 8 slots on desktop), Space and Enter toggle, Tab reaches Remove and then "Review booking", Enter opens the dialog with focus on its title, and Esc closes it with focus back on "Review booking".

Notes
- **No server change.** M5 uses the M4 API and response shapes as built; `server/` and the test suite are untouched (346 tests, all passing).
- **Decisions where the plan and DESIGN.md were silent** are in DESIGN.md §5.6 under "Settled while building M5": the date lives in the address (`?date=`), the summary is a panel from 1024 px and a bar below it, how a typed date is checked, the wording when a network failure leaves a booking's outcome unknown, what an inactive resource shows an admin, and the exact conflict rules (which slots are dropped, when "Just taken" goes away).
- **"View my bookings".** The success message carries the link DESIGN.md §5.5 asks for. It went to the placeholder My bookings page until M6 built the list (it now opens Upcoming); the placeholder's text said so.
- **Bugs the browser run and its checks found, all fixed:** returning to a date you had left brought its old selection (and its conflict warning) back, and while that day reloaded the summary bar crashed on an empty list of ranges; the date field showed its "Choose a date from…" message while a date was only half typed (typing a new month into 27 Nov passes through 27 Feb); and the 400 text ran the server's unpunctuated reason into "Nothing was booked". The first now resets with the date, the second waits for a pause in typing, the third adds the full stop.
- **Not run:** screen-reader testing (the announcements are verified as live-region text and focus moves, not as speech); Safari and real devices (phone sizes were emulated, without touch events); anything against Atlas; mutation checks on the UI; the M2 and M3 browser scripts (no shared component was changed: `Dialog`, `Message`, `Button` and the rest are as they were, and only the detail page's own flows, from M2, were re-checked inside the new run); client unit tests (none by plan, §3 and §14).
- **No client tests,** as in M1 to M3: the UI was verified with a scripted headless-Edge run that isn't kept in the repo (§3).

### M6: My bookings and cancellation (≈ 1.5 h). Status: done (built and verified 2026-11-15, on an in-memory replica set)

Checklist
- [x] `/bookings` with Upcoming and History views; table on desktop, cards on mobile; status lozenges
- [x] Cancel through a confirmation dialog, then a success message and a refreshed list
- [x] Admin "All members" view with a member column and cancellation
- [x] Loading, empty and error states

Acceptance (results on 2026-11-15; details in the §12 log). Checked in headless Edge at desktop and phone sizes, against the Vite client and the built API, on an in-memory replica set, with members and an admin each in their own browser context.
- ✅ A booking made in M5 appears under Upcoming with its resource, IST date and times, and "Confirmed". A member books Room B 13:00–14:00 on the resource page, presses "View my bookings", and lands on `/bookings` (Upcoming, clean address) with the row "Room B · the IST date · 13:00–14:00 · 1 h · Confirmed".
- ✅ Cancelling it moves it to History as "Cancelled", and its slots show as available on the resource page. The confirmation shows the booking; while the request is pending the button reads "Cancelling…" and further presses, Esc and the backdrop send and close nothing (exactly one request reaches the server). The success message "Booking cancelled · Room A · Sat, 14 Nov · 10:00–11:00 IST" takes focus; the row leaves Upcoming; History lists it as Cancelled with its original date and times; the database holds it as cancelled with the slot records gone (V6); on the resource page 10:00 and 10:30 are available, and another member books 10:00 straight away (201).
- ✅ An in-progress booking shows "In progress" and no Cancel action. With the server's clock and the page's clock moved together, a booking that starts while the page is open turns "In progress" by itself and loses its Cancel button, without any request to the server; a booking that ends makes the page fetch the list once more and leaves Upcoming. A page that hadn't noticed (a Cancel pressed after the booking started) gets the server's 409 "has already started", refreshes, and then shows the row as "In progress" with no Cancel.
- ✅ An admin cancels a member's booking from All members (the dialog names the member), and the member then sees it as "Cancelled" under History with its original times; the database records the admin as the canceller.

Notes
- **No server change.** M6 uses the M4 API and response shapes as built; `server/` and its 346 tests are untouched. The page only shows what the API lists and sends the cancellation; it never decides who may cancel what.
- **Decisions where the plan and DESIGN.md were silent** are in DESIGN.md §5.7 under "Settled while building M6": the address (`?view=history`, `?scope=all`), the two view switches, the rows, the clock rule behind "In progress" and "Completed", and the exact wording for every way a cancellation can end.
- **Carryovers from M5, done.** "View my bookings" now has its destination. DESIGN.md §5.5 said a network failure while booking meant "Nothing was booked"; it now says the outcome is unknown unless the server definitely refused the request, and the same rule is applied to a 5xx, in the page as well as the document. A 5xx can't claim "nothing was booked" because the server can fail after it has committed (the cancel service, for one, reads the booking back after its transaction commits and could fail there). M5's date navigation, selection reset, conflict recovery and session-expiry behavior were not touched, and the full M5 browser script was run again on the changed code (219/219; its one expectation about a 500's wording was changed on purpose).
- **Lost answers.** A cancellation whose answer never arrives (or arrives as a 5xx) never claims the booking was, or was not, cancelled: the dialog says it can't tell, offers "Refresh bookings", and trying again is safe because a repeated cancel is a plain 409. Tested with the request dropped before it reached the server, and with the answer dropped after the server had committed (the dialog said it couldn't tell while the database already held the cancellation; a refresh then explained that the booking had left Upcoming and linked to History, where it shows as Cancelled).
- **Not built, by plan:** pagination or sorting (the lists show 50 rows and say so), rescheduling, partial cancellation, notifications.
- **Gaps found while designing the checks and reviewing the result, all fixed before the final runs:** (1) the page's idea of "now" was only re-read when a booking started or ended, so after a refresh that followed a 409 a row the server called started could still show Cancel until the next timer (found while planning that scenario; the clock is now also re-read when the list is replaced and when the tab becomes visible); (2) cancelling a removed account's booking said "Deleted account will see it as Cancelled" (found while reviewing the code; the scenario was added afterwards); (3) in the 768 px All members table a time range could break after the dash, "10:00–" and "11:00" (seen in a screenshot).
- **Test tooling: disk.** Free space on C: fell about 1 GB during the first three M6 runs although nothing of mine was left in TEMP's usual places. Cause found and proved with a probe that started only the browser: a headless Edge with a fresh profile downloads and unpacks a roughly 68 MB extension package (about 300 MB on disk) through its component updater, and a force-kill at cleanup left that behind (the files begin with `Cr24`, folders named `scoped_dir<pid>_…` hold `CRX_INSTALL`). With `--disable-component-update --disable-background-networking --disable-sync --disable-default-apps --no-pings --metrics-recording-only`, the profile stays at 17–21 MB and none of it happens. The harness now also closes Edge with `Browser.close` before force-killing it, and removes `scoped_dir<pid>_*` of its own browser's pids. The five leftovers from the three runs (about 780 MB) were removed after checking each one. With the fix a full browser run cost about 1 MB of free space. HANDOFF.md has the flags.
- **Not run:** screen-reader testing (announcements verified only as live-region text and focus moves); Safari and real devices (phones are emulated, without touch events); anything against Atlas; mutation checks on the UI; the M2 and M3 browser scripts (no shared component changed: `Dialog`, `Message`, `Button`, `ViewSwitch`, `Lozenge`, `EmptyState` are as they were); client unit tests (none by plan, §3 and §14).
- **No client tests,** as in M1 to M5: the UI was verified with scripted headless-Edge runs that aren't kept in the repo (§3).

### M7: Polish and release readiness (≈ 1.5 h). Status: done except the screen-reader checks, which need a person (built and verified 2026-11-15, on an in-memory replica set)

Checklist
- [x] Check every screen at 375 px and 1280 px wide, and at 200% zoom
- [ ] Keyboard-only and screen-reader (Narrator or NVDA) smoke tests of the member and admin journeys. **Keyboard-only is done and logged; the screen-reader part has not been run.** Nobody could run Narrator or NVDA from the tooling used here, and the substitutes below are not speech
- [x] Page titles, skip link, focus after navigation, reduced-motion behavior
- [x] Copy pass: sentence case and specific button labels
- [x] README: real setup steps, commands, demo accounts, honest feature status
- [ ] Full run of §12 (automated and manual) with results logged. Everything that can be run was, and is logged; one manual check, screen-reader announcements, has not been run

Acceptance (results on 2026-11-15; details in the §12 log)
- ❌ **Not met in full:** "Every §12 manual check has been run and logged". Three of the four were: the two-browser conflict test (M5, two separate browser contexts, one of them a phone), keyboard-only booking and cancellation (M5, M6 and the full journeys of M7), and booking at 375 px (M5, and again for every screen in M7). The fourth, screen-reader announcements of the success and conflict messages, is not run. Only the text of the live regions, where focus lands and the accessibility tree's names and roles were checked, which is not what a screen reader says. A person should run the script under §12.
- ✅ Following the README from a fresh copy gets the app running. A fresh export of the staged files (what a clone would hold): `npm ci` (290 packages, 0 vulnerabilities), typecheck, build, 346 tests; the README's own steps: the unfilled `.env` is refused with a message that names the variables, `npm run seed` twice (8 resources and 4 bookings, then nothing), `npm run dev:server` and `npm start` answer `/api/health`, the seeded member and admin sign in, and in a browser the member sees 8 resources and 2 bookings and the admin all 4. Throwaway values only, in the process environment, on an in-memory replica set; the real `.env` was not read.
- ✅ The browser console is clean during the member and admin journeys: no uncaught error or rejection on any page, and the only entry is the signed-out first load's 401 from `/api/auth/me`, which the browser logs by itself (M1 note).
- ✅ The end-to-end journey asked for: an admin adds "Studio 7" in Manage resources; a new member registers, finds it by search, books 10:00–11:00 tomorrow; the booking shows in My bookings as Confirmed (and, for the admin, in All members with the member's name); the member cancels it; the row leaves Upcoming and appears in History as Cancelled; the database holds it as cancelled with no slot record; and on the resource page the two slots are available again (V6 checked).

Notes
- **What M7 does not include.** PLAN §3 puts analytics, CI and production deployment outside the MVP, and M8 (deploy) is a separate, optional milestone that hasn't started. So no analytics, no CI and no hosting configuration were added, and nothing was published or created. There is no CI to check for the committed lockfile and Node version; instead `package-lock.json` is committed, unchanged and in sync (`npm ci` succeeds from it on a fresh export, `npm audit` reports 0 vulnerabilities for production and for all dependencies), and `engines` asks for Node 22.11 or later (the version used throughout).
- **Production configuration is documented, not deployed.** The README has a "Running a built copy" section with the exact variables (`MONGODB_URI`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `MONGODB_DB_NAME`), the build and start commands, the cookie (`httpOnly`, `SameSite=Lax`, path `/`, 7 days, `Secure` only when `NODE_ENV=production`) and the replica-set requirement. All of it was checked against the built API: `npm start` answers `/api/health`, answers 404 for `/` (it serves no client), and with `NODE_ENV=production` sets `Secure`. The gap is stated there too: `client/dist` isn't served by the API and the API has no CORS, so a deployment needs a same-origin proxy or static host, which is M8. **The application is therefore not ready to deploy.**
- **Findings, all fixed** (found by the three-size screen audit and the text-size runs; see the log): at a large text size the resource cards were squeezed until the titles broke letter by letter and the "View availability" button overflowed; the top bar ran off the screen at 768 and 1024 px; the date field had no focus ring of its own; the "SlotBook" wordmark link was shorter than the 44 px of the other touch targets on a phone; and the "All resources" back link was under 24 px high on desktop (it passed axe's spacing rule, but is now 24 px). Documented in DESIGN.md ("Settled while polishing") and not fixed: with the text size doubled on a 768 to 1279 px screen the tables scroll sideways inside their card instead of becoming cards.
- **Screen audit (every screen and state, three sizes).** 20 screens and states (sign in with and without errors, register, discovery with filters and with no results, a resource's page with and without a selection, the booking dialog, My bookings (Upcoming, History, All members), the cancel dialog, 403, 404, a missing resource, Manage resources with the add form's errors and the deactivate dialog, an inactive resource) at 1280 px, 375 px and 200% browser zoom (a 640 px window at device scale 2), 60 combinations. For each: the page title, one `h1`, no skipped heading level, no horizontal scrolling, no clipped or squeezed text, no target under 24 px, `lang="en"`, an accessible name for every control and for every open dialog, and axe-core 4.10.2 with the WCAG 2.0 to 2.2 A and AA rules and its best-practice rules: no violation anywhere. A probe with an image without alt text, a nameless button and an unlabelled input confirmed that the audit does report violations. axe was installed in a scratch folder outside the repository (pinned, install scripts disabled) and is not a project dependency. Contact sheets of all 60 screenshots were looked at as well.
- **Text size, not only zoom.** With the root font size doubled (the browser's text-size setting, which leaves the pixel breakpoints where they are), the main screens were checked at 1280, 1024 and 768 px: no page-level horizontal scrolling, no squeezed or clipped text, no axe violation. This is where the cards and the top bar were found wanting.
- **Copy pass.** The accessible names of all 101 distinct controls (buttons, links, fields, radios) across the screens were read through and checked mechanically: none is "OK", "Submit", "Click here" or similar, none is in Title Case (apart from resource and member names), and sentence case holds in headings and messages. The browser's own date-field parts ("Day Day", "Show date picker") aren't ours. One cosmetic point left alone: on a phone card the screen-reader name of the cancel button reads "Cancel booking : Room A…" with a space before the colon, which is spoken the same way.
- **Skip link, focus and titles.** The first Tab stop of a signed-in page is "Skip to main content", visible when focused, and Enter moves focus to the main content (the path and query of the address stay as they were; the check allowed a trailing `#main`, which it didn't distinguish). The sign-in and register pages have no app shell and no repeated navigation, so no skip link. After signing in, and after every route change, focus is on the page's heading. Every kind of page has its own title.
- **Keyboard-only.** A member signs in, searches, opens a resource, moves to tomorrow with Next day, selects two slots with Space and an arrow key, reviews, confirms, follows "View my bookings", cancels, switches to History and signs out. An admin signs in, opens Manage resources, adds a resource (Enter in a field submits), deactivates and reactivates it, and opens All members. Every Tab stop (92 across both journeys) showed a focus ring and none was out of view; dialogs open on their title and cycle through their controls and the browser's own UI, never the page behind.
- **Reduced motion.** With the system setting "reduce", `document.getAnimations()` is empty and no element has a CSS transition; with no preference the spinner is a running animation (so the check can tell the two apart).
- **Screen-reader substitutes (not a screen-reader test).** The accessibility tree of each screen, queried through the browser, has a name for every control and dialog; axe passed; the live regions' text and the places focus lands were checked in M5, M6 and M7.
- **Not run:** a screen reader (Narrator or NVDA); Safari and real touch devices; anything against Atlas; mutation checks on the UI; client unit tests (none by plan, §3 and §14); the M2 and M3 browser scripts (they no longer exist as files, and the same screens were covered by the three-size audit instead).
- **No client tests,** as in M1 to M6: the UI was verified with scripted headless-Edge runs that aren't kept in the repo (§3).

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

| Manual check | Result (2026-11-15) |
|---|---|
| Two-browser conflict test | **Run** (M5): two separate browser contexts (separate sessions, as a normal and a private window would be), the second on a 375 px phone. Nothing booked for the loser, the warning names the taken time, the other selections are kept, then success |
| Keyboard-only booking and cancellation | **Run** (M5 booking, M6 cancelling, M7 both as one journey for a member and an admin). 92 Tab stops with a visible ring |
| Booking at 375 px | **Run** (M5 the whole flow; M7 every screen and dialog) |
| Screen-reader announcements of the success and conflict messages | **Not run.** Needs a person with Narrator or NVDA. Substitutes only: live-region text, focus placement and the accessibility tree's names |

**Script for the screen-reader check** (about 15 minutes; Narrator is Win+Ctrl+Enter, or NVDA; Edge or Chrome; the app and a seeded member and admin as in the README). Write the result of each step into the table above.
1. Sign-in page: the title is read ("Sign in"); each field is announced with its label ("Email", "Password"). Submit it empty: focus goes to the first field with a problem and its message is read.
2. Find a resource: the heading is read after signing in. Type in the search field: the count ("2 resources") is announced as it changes.
3. A resource's page, tomorrow: each slot is read as "10:00 to 10:30 IST", a booked one as "…, booked", your own as "…, your booking", and a selected one as pressed. Select one: "1 slot selected" is announced. Select nine: "You can book up to 8 slots at a time." is announced.
4. Review booking: the dialog is announced ("Confirm booking", dialog), starting on its title. Confirm: the success message is read, since focus moves to it: "Booking confirmed · Room A · …".
5. Conflict: in a second browser, book one of the slots you selected, then confirm in the first. The warning "Some times are no longer available" is read, with which time was taken and that nothing was booked.
6. My bookings: the table is read with its headers; each cancel button is named "Cancel booking: Room A, Sat 14 Nov, 10:00–11:00 IST". Cancel one: the dialog, then the success message ("Booking cancelled · …").
7. As the admin: Manage resources (the add dialog's field errors are read; the deactivate dialog starts on its title) and My bookings, All members ("Booked by" column).

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
| 2026-11-15 | M1 | Read-only check of the Atlas `users` collection after the user ran `npm run seed` | Pass | 2 users (1 admin, 1 member); both emails match the `SEED_*` variables; password hashes are bcrypt cost 10; the unique email index is present. Only counts and booleans were printed |
| 2026-11-15 | M1 | Sign-in against Atlas through the real app (in-process server on an ephemeral port); credentials read from `.env` in memory only | Pass | Admin: login 200, role `admin`, `me` 200. Member: login 200, role `member`, `me` 200. Cookie `httpOnly` and `SameSite=Lax`. A wrong password gives 401 `INVALID_CREDENTIALS` |
| 2026-11-15 | M1 | Browser sign-in as the seeded admin and member against Atlas | Pass (reported by the user; not re-run by the agent) | The user ran `npm run seed` and signed in as both accounts |
| 2026-11-15 | M2 | `npm run typecheck`, `npm run build` | Pass | Client and server; `client/dist` CSS 22.30 kB, JS 350.56 kB |
| 2026-11-15 | M2 | `npm test` | Pass | 90 tests in 6 files: resources 33 (401s, member and admin lists, `?status`, ordering, 404s, model rules, indexes, demo catalog, seeding, seed race), auth 38, seed 7, config 8, health 2, guard 2 |
| 2026-11-15 | M2 | Mutation checks on the new tests | Pass | Six deliberate breaks, each turning tests red: members also seeing inactive resources in the list (4 tests), members opening an inactive resource (1), sorting by name only (2), removing authentication from the routes (4), dropping the explicit type ordering (2), removing the seed's duplicate-key tolerance (1). Each was reverted and byte-compared with the original, and the suite re-run green |
| 2026-11-15 | M2 | Browser acceptance script: headless Edge, Vite dev client plus the built API (started and stopped by the script), in-memory replica set | Pass | 68/68 checks on the final code: empty catalog for a member and an admin; the real `npm run seed` CLI; 8 cards in order with tags, "+2 more" and only two interactive elements per card; "proj" narrows 8 to 4 with no extra API request; type and capacity filters combine; "Clear filters" restores everything; no-results state; detail pages, unknown and malformed ids, inactive resources for a member and an admin; 1280, 900 and 375 px layouts with 44 px targets; the filter sheet (focus, Esc, backdrop, a drag from inside, widening the window); API stopped → error state, failed retry, successful retry, and the focus after each. Only expected 401, 404 and 5xx responses reached the console |
| 2026-11-15 | M2 | Atlas, read-only look before the seed | Pass | `users` had 2 documents. `resources` already existed with 0 documents and both indexes, created by the user's running `tsx watch` dev API when it restarted on the M2 code |
| 2026-11-15 | M2 | `npm run seed` against Atlas, then again | Pass | First run: users unchanged, 8 demo resources created. Second run: 0 created, 8 already existed |
| 2026-11-15 | M2 | The real app against Atlas (in-process server), real accounts read from `.env` in memory | Pass | Signed out: 401. Member: 200 with 8 resources, rooms before equipment, all demo resources present and active, equipment capacity null. Admin `?status=all` and member `?status=all`: 8 each. `?status=bogus`: 400. Detail: 200. Unknown id and malformed id: 404 |
| 2026-11-15 | M2 | Discovery in a browser on the user's own dev stack (Vite 5173, API 4000, Atlas), signing in as the seeded member | Pass | `/resources` showed "8 resources" in the expected order; opening a card showed the resource page; the session cookie wasn't readable from scripts. Only counts and names were printed |
| 2026-11-15 | M2 | Independent code review (medium) | Done | 8 findings. 5 fixed: the seed's duplicate-key race, the filter sheet staying open when the window widens, the type sort leaning on string order (now sorted explicitly in code, with the name sort served by the collated index), unchecked errors in `useApiData` (a failed body read is now a network error), and a drag from inside the sheet closing it. 1 recorded for M3 (capacity rules are not enforced on updates). 2 were not code: a temporary verification config (deleted before committing) and docs still to update (done here) |
| 2026-11-15 | M2 | Credential scan of the full working-tree diff against `.env` and `atlas-credentials.env` | Pass | No value found; no Atlas hostnames in the diff |
| 2026-11-15 | M3 | `npm run typecheck`, `npm run build` | Pass | Client and server; `client/dist` CSS 24.77 kB, JS 369.62 kB |
| 2026-11-15 | M3 | `npm test` | Pass | 190 tests in 7 files (was 90): resources-admin 100 (new), resources 33, auth 38, seed 7, config 8, health 2, guard 2. The new file covers 401 and 403 on every kind of change, 403 before 400 and 404, create and edit, every invalid field with its exact message, the capacity rules on update (the M2 carryover), duplicate names including two requests racing, simultaneous edits of the tags, deactivate and reactivate as members see them, and mass-assignment attempts |
| 2026-11-15 | M3 | Browser acceptance script: headless Edge, Vite dev client plus the built API (started and stopped by the script), in-memory replica set | Pass | 107/107 on the final code. A member is refused (403 page, 403 from direct `POST` and `PATCH`, database unchanged); the list in catalog order with the table's markup, 32 px row actions and the status links; search, type and status filters; the Add dialog (every field, empty submit shows every error at once with focus on the first, a room without a capacity shows the inline error and sends nothing, the API's own 400, Enter submits, a taken name appears on the Name field, Equipment hides Capacity); success messages focused and dismissible; the new room visible to a member after a reload; Edit (prefilled, abandoned edit gone on reopening, Esc returns focus to the trigger, only changed fields are sent so tags another admin set meanwhile survive, "No changes to save" when nothing changed, rename re-sorts like the server, room to equipment drops the capacity, refused without one); Deactivate (focus on the title, "Keep active", the member's list and the resource's URL "Resource not found", the Inactive view) and Reactivate (no dialog, restored for members); a request in progress locks the dialog (Close, Cancel, backdrop, Esc twice, a second submit ignored, exactly one PATCH); the API stopped (add, deactivate and reactivate failures, the list error state with "Try again" and its focus); the loading skeleton and the empty catalog; 375 px cards, full-screen form sheet, bottom-sheet confirmation, 44 px targets and no overflow; 768 and 1024 px tables fit, and unbroken 80/120-character text and long tags never make the page scroll sideways. Only deliberate HTTP errors reached the console (400, 401, 403, 404, 409, and 500 from the dev proxy while the API was stopped) |
| 2026-11-15 | M3 | The M2 browser script re-run against the changed shared components (`Dialog`, `SearchField`, `Button`, `Message`) | Pass | 68/68, after one fix. The first re-run failed: a `close` event from an earlier closing arrived after the filter sheet had been opened again and shut it. `Dialog` now ignores a `close` event while its dialog is open |
| 2026-11-15 | M3 | Independent code review of the diff (a fresh agent, code only, nothing run) | Done | No authorization hole, mass-assignment path or crafted-body 500 found. 4 low-severity findings, all checked against the code and all valid: (1) the JSON body parser runs before authentication, so unparseable JSON from a signed-out caller or a member is a 400, not 401 or 403 (documented in §6; the test that claimed otherwise sent form data and was corrected); (2) two simultaneous edits of the tags gave 500 from a Mongoose version conflict (reproduced with a failing test: six simultaneous edits returned 200, 500, 500, 500, 200, 500; the service now reloads and re-applies the change, and the same test passes three runs in a row); (3) an invalid capacity for equipment is refused with 400 although §6 said it was ignored (the wording is corrected: it is checked, then ignored); (4) the Edit form sent every field, so it could undo another admin's change to a field it never touched (it now sends only changed fields). Also removed a test that passed vacuously |
| 2026-11-15 | M3 | Test-tooling problems found and fixed on the way (not app bugs) | Fixed | The headless browser's page turned `hidden` after some minutes and stopped producing frames, which delays `<dialog>` `close` events (flags and a CDP timeout added); a wrong expectation of mine that a table with unbroken 120-character text must fit at 1024 px. Restarts of the in-memory MongoDB left 23 `mongod` processes and Edge profiles that filled the C: drive (MongoDB then refused writes); all were mine, identified by command line, and removed (about 12 GB freed). Notes for future runs are in HANDOFF.md |
| 2026-11-15 | M4 | `npm run typecheck`, `npm run build` | Pass | Client and server. `client/dist` CSS 24.77 kB and JS 369.62 kB, identical to M3's, as expected since `client/` didn't change |
| 2026-11-15 | M4 | `npm test` | Pass | 346 tests in 14 files (was 190; 156 new), run under a process tracker, after the review fixes below: availability 19, bookings-create 53, bookings-cancel 18, bookings-lists 21, bookings-access 17, seed-bookings 10, time 18 (new); resources-admin 100, auth 38, resources 33, config 8, seed 7, health 2, db-guard 2. They cover V1, V1b, V2, V3, V3b, V4 and V5 as written in this section, and V6 after every booking test. Time is pinned to 09:30 IST on 2026-11-14 through the clock helper |
| 2026-11-15 | M4 | Concurrency | Pass | Ten members booking one slot at once, three rounds: one 201 and nine 409 each time. Overlapping selections at once, five rounds with the order varied: one succeeds. Fourteen members each asking for three of sixteen slots at once, and 20 simultaneous calls to the service: all-or-nothing every time. The first run of these passed, so their power was checked below |
| 2026-11-15 | M4 | Does the race exist? (built service, throwaway in-memory database, the unique index dropped there only) | Pass | Ten simultaneous bookings of one slot, 8 rounds. With the unique index: 1 winner in every round. Without it: 10 winners in every round. So the requests do run concurrently, the transaction alone doesn't prevent double booking, and the unique index is what does. This one check was run because a concurrency test that passes first time may not be racing; no repo file was changed |
| 2026-11-15 | M4 | The built API over real HTTP and the real `npm run seed` CLI, throwaway credentials, in-memory replica set | Pass | 29/29, run again on the final build after the review fixes: the seed creates 4 demo bookings, then 0 on the second run; the API starts and has built the unique `{ resource, start }` index, the `{ booking }` index and the two booking list indexes before the first request; sign-in; availability (24 slots, IST labels); a 2-slot booking, then `unavailable` for everyone and `mine` only for the member; an overlapping request from the admin is 409 naming only 10:30 and leaves 11:00 free; My bookings and the admin list (403 for a member); the admin cancels the member's booking, a second cancel is 409, the slots are free again, History shows it, and the refused selection can now be booked; 401 signed out; 400 for an off-grid time; no connection string or secret in the API log |
| 2026-11-15 | M4 | Test-process cleanup, reviewed and tested: success, failure, interruption (a tracker recorded every process a run started, including orphans, and removed only those) | Fixed | Success: a full run leaves no process and no directory. Failure: a setup that threw after the database had started leaked a `mongodb-memory-server` helper process and its data directory; fixed in `startTestDatabase`, then clean. Interruption: hard-killing a test worker, and vitest itself, ended `mongod` by itself but left a 200 MB directory; now it has a `slotbook-test-db-<pid>-…` name, and the next run deleted it (checked). No browser was started, so no profile existed |
| 2026-11-15 | M4 | Independent code review of the diff (a fresh agent, code and the MongoDB driver's source only, nothing run) | Done | No defect in the booking guarantees: the transaction, the duplicate-key handling, ownership and the 404s, the inactive-resource rules, the IST window and the lists were checked and found correct. 2 low findings, both fixed, and 1 very low, left as it is. (1) An id with a malformed percent-escape (`%E0%A4%A`) made Express throw a `URIError` that the error handler treated as unexpected: 500 instead of 404, on every route with an `:id` including M2's detail route and a member's `PATCH` (reproduced with a failing test first; the handler now answers 404, §6). (2) Cancellation checked "not started" before the transaction but not inside it, so a booking that started while the request was in flight could be cancelled; the clock is now read again inside the transaction and the update requires the start to be later (§8; two tests with a clock that moves between the two readings). (3) After three passes that each find the slots taken and then free, the booking returns a generic 500; left as is, because it can't realistically persist and the code comment says so. One point it couldn't confirm from the code, that the server reports a write conflict inside a transaction as a labelled top-level error: the concurrency tests passed five runs in a row with no 500 |
| 2026-11-15 | M4 | Mishap: `npm run seed` ran by accident against the real `.env` | No effect | A documentation edit passed through a double-quoted shell string had `npm run seed` in Markdown backticks, which bash executed. It stopped at the connection step ("Could not connect to MongoDB", a 10-second timeout), and the seed connects before it reads or writes anything, so nothing reached Atlas. Nothing was printed beyond that error, which holds no credentials. The edit itself failed and was redone with the editor tool. Lesson and rule in HANDOFF.md |
| 2026-11-15 | M4 | Credential scan of the staged diff against the values in `.env` | Pass | No value found, and no Atlas hostname or `mongodb+srv` URI in the diff. `atlas-credentials.env` was not opened |
| 2026-11-15 | M5 | `npm run typecheck`, `npm run build` | Pass | Client and server. `client/dist` CSS 26.69 kB (was 24.77) and JS 391.12 kB (was 369.62) |
| 2026-11-15 | M5 | `npm test` | Pass | 346 tests in 14 files, unchanged from M4: `server/` wasn't touched. Run after the last client change, under no browser, with nothing left behind |
| 2026-11-15 | M5 | Browser acceptance script: headless Edge, the Vite client plus the built API (both started and stopped by the script, in one process), in-memory replica set, server clock pinned to 12:15 IST, two members and an admin each in their own browser context | Pass | 219/219 on the final code. Before the 400 and 404 scenario and a one-line wording fix were added, the first 212 checks had passed on two full runs in a row. Desktop 1280 px, phone 375 px and the widths 320, 640, 768, 1023 and 1024. See the list below |
| 2026-11-15 | M5 | What that run covered | Pass | **Grid and states:** 24 slots in Morning, Afternoon and Evening groups; past, available, selected, booked, "Your booking" and "Just taken" drawn and named; the legend; every slot at least 52 px high. **Date:** the address carries `?date=`; a deep link survives signing in; Next day, Previous day, Today and the ends of the window; typed dates; bad `?date=` values dropped; Back button; today taken from IST with the browser in Los Angeles and Auckland and the page's clock set to 18:29Z and 19:00Z. **Selection:** ranges, totals (1 h, 1 h 30 min, 4 h), Remove, Clear, the 8-slot limit and its live-region text, the date change clearing it. **Keyboard:** one Tab stop, arrows, Home, End, Space, Enter, the visible focus ring, Tab to Review booking, Enter, Esc and the focus return, Space and Enter on past and booked slots. **Booking:** the dialog's content; Go back; success with focus, link and Dismiss; the database holds the booking and one slot record per slot; V6 after each step. **Conflicts:** two members, a stale grid, the warning's exact wording, "Just taken", kept selections, nothing booked, then success; a conflict that leaves nothing selected; a past conflict (the server clock moved to 12:45 while 12:30 was selected); a conflict whose refresh fails, then Try again. **Failures:** unreachable server, 500, retry; a 400 (the server's clock moved so the date fell outside its window; the dialog shows its reason and the same dialog books it once the clock is right) and a 404 (the resource deactivated while reviewing: the dialog closes and the page shows "Resource not found"); session expiry mid-booking (to sign in, back to the same resource and date, nothing booked); one request only while one is pending (four clicks, Enter, two Esc, Close and the backdrop). **Day states:** loading skeleton, load error with Try again and its focus, fully booked, fully past, last bookable day, a day that is all the caller's. **Admin and missing:** an inactive resource for an admin, "Resource not found" for a member, an unknown and a malformed id, the detail page's own error and retry. **Phone:** 4 columns, the sticky bar (text, "+1 more", the 9th-slot message, not covering the last slot), the bottom sheet, no horizontal scroll, 44 px controls, the same two-member conflict with the second member on the phone |
| 2026-11-15 | M5 | Console during the run | Pass | Only failed network loads reached the console, each one deliberate: 409 conflicts, an injected 500, an aborted request, the 400 and 404 of the booking scenario, an expired-session 401 and 404 pages |
| 2026-11-15 | M5 | Real bugs the browser run found | Fixed | (1) Leaving a date and coming back restored its old selection and its conflict warning, and while that day reloaded the summary bar threw on an empty list of ranges ("Unexpected Application Error"). It showed up as a flaky failure, because it depends on timing; the cause was state kept per date that became valid again. The state now resets in the render in which the date changes, only slots that are in the grid being shown count as selected, and the bar tolerates an empty list. Four runs of the scenario alone and every later full run passed. A third, smaller fix came from writing the 400 check: the server's message has no full stop, so the dialog text ran on into "Nothing was booked" (now punctuated). (2) The date field's error flashed while a date was half typed. It now waits for a pause of about 0.6 s, or for the field to be left, and a refused date stays in the field with its message |
| 2026-11-15 | M5 | Test-tooling problems (not app bugs) | Fixed | `Array.join` turns `null` into an empty string, so two probes compared the wrong text; a DOM element was returned from `Runtime.evaluate`; `Storage.clearCookies` for one browser context must be sent at browser level; Vite's dev server refuses a path with a malformed `%` escape on a direct load, so that page is reached by navigating inside the app; headless Edge's date field here is day-first, so the typing test finds the segment order first |
| 2026-11-15 | M5 | Test-process cleanup | Pass | Every run started its own `mongod` (data directory `slotbook-test-db-<pid>-…`), one Edge (profile `slotbook-edge-…`) and servers on ports 4100 and 5174, and removed all of them, by process id and by those directory names only, on success, on a failed run and on abort. After each run no matching process, directory or listening port remained. The user's own dev servers were not running during M5 and weren't touched. Free disk space moved from 27.9 to about 20 GB during the session with nothing of this run's left behind (TEMP held 55 MB); the cause wasn't known then (it was found in M6, see below: Edge's component download) |
| 2026-11-15 | M6 | `npm run typecheck`, `npm run build` | Pass | Client and server. `client/dist` CSS 26.99 kB (was 26.69) and JS 407.10 kB (was 391.12) |
| 2026-11-15 | M6 | `npm test` | Pass | 346 tests in 14 files, unchanged from M4 and M5: `server/` wasn't touched. Run after the last client change, with nothing left behind |
| 2026-11-15 | M6 | Browser acceptance script: headless Edge, the Vite client plus the built API (both started and stopped by the script, in one process), in-memory replica set, the server's clock and each page's clock movable together, members and an admin each in their own browser context | Pass | 161/161 on the final code (the run before the last two small changes had 153 of 155: both failures were wrong expectations in the script, a native dialog's one Tab stop in the browser's own UI and an emulated scrollbar's 15 px). See the list below |
| 2026-11-15 | M6 | What that run covered | Pass | **Deep link and sign-in:** `?scope=all&view=history` while signed out, back to the same address. **Lists:** a member's Upcoming (soonest first, only her own, headers, IST date and times, "1 h", "Confirmed", the names screen readers hear, two lines for slots that aren't consecutive) and History (newest first, "Cancelled" and "Completed", original times, "—" instead of actions); the same text with the browser in Auckland; an admin's Mine and All members (seven columns, "Booked by" with name and email, everyone's, the links keep each other's parameter); 50 of 52 history rows with "Showing the latest 50". **Layouts:** 375 px cards with a full-width 44 px "Cancel booking", view links filling the width, no sideways scroll at 320, 375, 768 and 1024; the 768 px seven-column table fits without scrolling. **Permissions:** a member's `?scope=all` and a bogus `?view` dropped, only `/bookings/mine` requested; her direct `GET /api/bookings` 403 and her cancel of another member's booking 404 with nothing changed; an admin keeps `scope=all`. **States:** the loading skeleton (no old rows under the new label, a slow answer for a view the user left doesn't replace the current one), empty Upcoming ("Find a resource") and History, load error with "Try again" and its focus (message after a failed retry, heading after a good one), the All members error title. **Cancelling:** the dialog's content and focus, Esc and "Keep booking", a held request (button "Cancelling…", repeated presses, Esc and Close do nothing, one request on the wire), the success message (focus, Dismiss, "Open History"), the row leaving Upcoming, the database (cancelled, slot records gone, V6), History, the resource page's slots available again and rebooked by someone else (201). **Rejections:** already cancelled elsewhere (409, "We refreshed your bookings", only Close, focus to the heading), already started (the page's clock behind the server's: 409, then "In progress" with no Cancel), another 4xx (a definite "not cancelled", then a retry works), a booking that isn't hers (404 "We couldn't find this booking"). **Lost answers:** request dropped before the server (can't tell, Refresh bookings, "It's still booked", retry works); answer dropped after the server committed (can't tell although it is cancelled, Refresh closes the dialog and says it has left Upcoming, "Open History" shows it Cancelled); retry after a lost answer (409 already cancelled); the refresh failing too; a 500 treated as unknown; focus back on the row's button. **Session:** the cookie removed while the dialog is open: sent to sign in, nothing cancelled, back on `/bookings` with the booking. **Admin:** cancelling a member's booking (the dialog says whose; the message names the member; the database records the admin; the member's History shows Cancelled; the admin's own list untouched). **Time:** a booking turns "In progress" by itself and loses Cancel, with no request; an ended booking leaves Upcoming after one extra request. **Keyboard:** Tab order through skip link, nav and view links to the first Cancel, Enter, the dialog's Tab cycle, Esc and focus return, Enter on "Cancel booking", focus on the message, Enter on a view link. **Phone:** the confirmation as a bottom sheet against the bottom edge, the success message on screen, no sideways scroll. **Also:** a deactivated resource's bookings in every list and cancellable by the admin; a removed account's booking ("Deleted account", no email, no claim that anyone will see it). **Booking dialog (M5 carryover):** a lost answer after the server committed says it can't tell (the booking exists, the grid then shows "Your booking", trying again is refused as already hers); a 500 says it can't tell; a 403 says nothing was booked |
| 2026-11-15 | M6 | Console during the run | Pass | No uncaught error or rejection on any page. Only failed network loads reached the console, each deliberate: 401 (expired session), 403, 404, 409 and injected 500 responses, and dropped requests |
| 2026-11-15 | M6 | M5 browser script re-run on the changed code (`ResourceBooking`, `toRanges`' type), on the new harness | Pass | 219/219. One expectation changed on purpose: a 500 while booking now says "We couldn't confirm your booking … can't tell if it went through" and not "Nothing was booked" |
| 2026-11-15 | M6 | Test-tooling problems (not app bugs) | Fixed | The script's own date helper spelled September "Sept" (`en-GB`); two checks read the page before React had rendered the new address or the retry; a native `<dialog>` has one Tab stop outside the page (the browser's UI), which my expectation didn't allow for; an emulated phone has a 15 px scrollbar, so a full-width sheet is 360 px wide, not 375 |
| 2026-11-15 | M6 | Disk space: unexplained consumption investigated before more runs | Fixed | Free space on C: fell from 19.92 to 18.94 GB over the first three runs although TEMP held nothing of the harness's usual files. TEMP had grown by about 780 MB: two `scoped_dir<pid>_…` folders holding `CRX_INSTALL` (298 and 172 MB) and three `.tmp` files of 68, 68 and 36 MB beginning with `Cr24`, created in the last seconds of each run, with their owner processes gone. A probe that started only the browser (own profile, 2.5 minutes) reproduced the cause: the fresh profile grew to 411–456 MB, started `msedge_url_fetcher` downloads at 63 s and 109 s and began unpacking a package at 125 s. With the updater and background networking disabled (flags in HANDOFF.md) the profile stayed at 17–21 MB and none of it happened. The five leftovers were removed after checking each (creation time inside the three runs, the `Cr24` header or `CRX_INSTALL`, no live owner); other entries in TEMP, from other programs (a `BraveComponentUpdater` download, `Importer_0_4`, an older 17 MB `scoped_dir` from earlier today, which can't be attributed), were left alone. Afterwards a full run (MongoDB, Vite, Edge, eight contexts) used 1 MB of free space (19.688 to 19.687 GB), and the remaining runs, `npm test` and `npm run build` together 13 MB (to 19.675 GB: build output and screenshots, not measured separately) |
| 2026-11-15 | M6 | Test-process cleanup | Pass | Every run started its own `mongod` (data directory `slotbook-test-db-<pid>-…`), one Edge (profile `slotbook-edge-…`) and servers on ports 4100 and 5174, and removed all of them, by process id and by those names only. After the final run no matching process, directory or listening port remained. The user's own dev servers on 4000 and 5173 were running and weren't touched |
| 2026-11-15 | M6 | Credential scan of the staged diff against the values in `.env` | Pass | No value found, and no Atlas hostname or connection-string pattern in the diff. `.env` is ignored and untracked; `atlas-credentials.env` was not opened. Nothing was run against Atlas |
| 2026-11-15 | M7 | `npm run typecheck`, `npm test`, `npm run build` | Pass | Client and server clean. 346 tests in 14 files, unchanged (`server/` wasn't touched in M7). `client/dist` CSS 27.35 kB (was 26.99) and JS 407.33 kB (was 407.10). The same three commands also passed in the fresh export (below) |
| 2026-11-15 | M7 | Browser run: the end-to-end journey, every screen at three sizes with an audit, keyboard-only journeys, reduced motion, console. Headless Edge, the Vite client plus the built API in one process, in-memory replica set | Pass | 157/157 on the final code, in 69 s (after fixes; see the findings row). Journey 15 checks (admin adds "Studio 7" through the form; a new member registers, finds it by search, books tomorrow 10:00–11:00; My bookings and, for the admin, All members list it; cancel; History; the slots available again; V6); screens 86 (60 screen and size combinations, 21 text-size runs, 5 across-the-board checks: the audit's teeth, names, titles, vague labels, Title Case); keyboard 44 (92 Tab stops, all with a ring and in view); reduced motion 3; console 9 |
| 2026-11-15 | M7 | What the screen audit measured, per screen and size | Pass | Title ending " · SlotBook", one `h1`, no skipped heading level, no horizontal scrolling, no clipped text, no text squeezed under 1.5 em wide, no target under 24 px, `lang="en"`, every control and every open dialog named in the accessibility tree, and axe-core 4.10.2 (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa and best-practice): no violation on any of the 60 combinations. A probe (an image without alt, a nameless button, an unlabelled input) proved the audit reports violations. Phone: the only control under 44 px was the wordmark link, now enlarged. Contact sheets of the 60 screenshots were viewed |
| 2026-11-15 | M7 | Text size doubled (the root font size at 200%), main screens at 1280, 1024 and 768 px | Pass | 21/21 after two fixes: no page-level horizontal scrolling, no squeezed or clipped text, no axe violation. Before them: the resource cards were squeezed until the card titles broke letter by letter and the "View availability" button overflowed (the grid had 3 columns at 1024 px or more whatever the text size), and the top bar overflowed by 131 px at 768 and 164 px at 1024 (the nav and the user group don't fit on a line). Not changed: at 768 to 1279 px the tables then scroll inside their card (DESIGN.md §4 last resort) |
| 2026-11-15 | M7 | Findings fixed during M7 | Fixed | (1) Resource grid: the column counts are now caps with a minimum column width in `rem` (§5.3 unchanged at the default text size); the card's type tag wraps below the name. (2) The top bar wraps. (3) A date field shows the accent focus ring (focus sits on its day, month or year part, so the field didn't report `:focus-visible`; 92 Tab stops now all show a ring). (4) The wordmark link is 44 px high on a phone. (5) The "All resources" back link is at least 24 px high on desktop |
| 2026-11-15 | M7 | Test-tooling problems (not app bugs) | Fixed | A visually hidden skip link kept its padding classes and so looked like a visible 24 × 16 px clipped element to my measure (a hidden-element test that compared `\(` inside a template string failed silently; plain string checks fixed it); two waits read the page before React had rendered (the registration form, the resource count: each card has two links to the same resource); the sign-in page has no skip link and my first expectation of one was wrong; after signing in focus is on the heading, below the nav, so the admin journey loaded a fresh page before tabbing to the nav; the first available slot of "today" became past while a test ran (the keyboard journey now uses tomorrow); one script variable misnamed (`name` for `text`); and the M5 script's "Today returns to today" check lacked the short wait its sibling has |
| 2026-11-15 | M7 | Keyboard, skip link, focus, titles, reduced motion | Pass | See the M7 notes above: first Tab stop is the skip link on signed-in pages, Enter moves focus to the main content, the heading takes focus after sign-in and every navigation, each kind of page has its own title; member and admin journeys by keyboard only; with "reduce" nothing animates and there are no CSS transitions |
| 2026-11-15 | M7 | Copy pass | Pass | 101 distinct accessible names of controls read through and checked: no vague name, no Title Case, sentence case throughout, no change needed. Cosmetic, left: "Cancel booking : Room A…" (space before the colon) in the phone card's accessible name |
| 2026-11-15 | M7 | Fresh copy: the README followed step by step (a fresh export of the staged files into a scratch folder outside the repository; throwaway values in the process environment; in-memory replica set) | Pass | 18/18 checks, after `npm ci` (290 packages, 0 vulnerabilities), typecheck, build and 346 tests (all in the copy). The unfilled `.env` is refused naming MONGODB_URI and JWT_SECRET and holding no value; the seed creates 8 resources and 4 bookings, then nothing; `npm run dev:server` and `npm start` answer `/api/health`; `npm start` answers 404 for `/` (no client served); with `NODE_ENV=production` the cookie is Secure, HttpOnly, SameSite=Lax; the seeded member and admin sign in (API and browser) and see 8 resources, 2 and 4 bookings, with the console clean. The script's own last step (deleting the copy's `node_modules`) was cut off by my 400 s timeout after all 18 checks had printed, and I finished that removal by hand, so its summary line is missing |
| 2026-11-15 | M7 | `npm audit`, lockfile | Pass | 0 vulnerabilities, production and all dependencies. `package-lock.json` is committed, unchanged, and `npm ci` (also `--dry-run`) succeeds from it. There is no CI (§3) |
| 2026-11-15 | M7 | M6 browser script re-run on the final code (the top bar, the resource page and the date field's style changed, all shared) | Pass | 161/161 |
| 2026-11-15 | M7 | M5 browser script re-run on the final code | Pass | 218/219 on the full run: "Today returns to today" read the date field in the frame after the address changed (the same race recorded in M5 for its sibling check, which has a short wait). With the same wait the scenario passed twice, 15/15 each; not an app change. Not re-run in full afterwards |
| 2026-11-15 | M7 | Disk space | Open (not from this work) | Free space on C: was 20.07 GB when M7 began and 18.31 GB after the runs. Cleanup left nothing of mine but about 10 MB of screenshots and the audit tool; free space doesn't move while idle (five samples); the tracked large folders (Docker 18.7 GB, caches, browser profiles) are the same size as in M6 except the npm cache, up 15 MB. Each run, measured: the whole M7 suite 1 MB, M6 and M5 together 2 MB, tests and build 2 MB. The Edge flags from M6 worked: no component download. The 1.9 GB isn't in anything I created (hypothesis: other programs; between M6 and M7 free space had already moved by 0.4 GB with nothing of mine running). The fresh export's `node_modules` did take space while it existed; it is removed |
| 2026-11-15 | M7 | Test-process cleanup | Pass | Every run's `mongod`, Edge and servers (ports 4100 to 4103, 5174, 9341) were removed by process id and by their own names; none remained after the final runs, and no `slotbook-*` folder. The user's dev servers on 4000 and 5173 were running and weren't touched. One removal of mine (`rm -rf` of a folder I hadn't created yet) was refused by the tool's safety check; it wasn't needed and wasn't worked around |
| 2026-11-15 | M7 | Credential scan of the staged diff against the values in `.env` | Pass | No value found, and no connection-string pattern or Atlas hostname in the diff. `.env` is ignored and untracked; `atlas-credentials.env` was not opened. Nothing was run against Atlas, and the fresh-copy run used only throwaway values in the process environment |

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
- **The grid is a snapshot.** The page doesn't poll, so another member's booking shows up only when the page reloads, when a conflict refreshes the day, or after the member's own booking. The booking request is what decides, and a refusal is explained (DESIGN.md §5.6).
- **A rare booking error.** If a booking's slots are reported taken three times in a row and found free each time (the holder cancelled in between, three times), the API gives up with a generic 500. Nothing is booked in that case, and the page says so ("We couldn't complete your booking. Nothing was booked. Try again."). It can't realistically persist, so it was left as it is (the code comment in `services/bookings.ts` says why). The page can't tell that 500 from any other, and a 500 or a lost answer may come after the server has committed, so for both it says it can't tell whether the booking went through (DESIGN.md §5.5); the refreshed grid shows the booking as "Your booking" if it did. "Nothing was booked" is written only after a definite refusal (a 4xx). The same rule governs cancelling (§5.7).
- **The clock behind "In progress".** My bookings works out "In progress" and "Completed" from the browser's clock, so a clock that disagrees with the server's moves those labels by the difference. The server decides whether a cancellation is allowed (409 if the booking has started) and which list a booking belongs to.
- **Time:** IST only, shown in 24-hour format.
- **Deactivation:** deactivating a resource doesn't cancel its existing bookings; an admin cancels them by hand.
- **Data clean-up:** slot records of past bookings are kept, and there is no clean-up job.
- **Testing:** server behavior has automated tests. The UI is checked manually, with no component tests, no end-to-end tests and no CI. The UI's checks (M1 to M7) are scripted headless-Edge runs that are not kept in the repository.
- **Accessibility:** checked with an automated audit (axe-core), the keyboard and the browser's accessibility tree, in Edge. Nobody has used the app with a screen reader, in Safari or on a real touch device (M7 left the screen-reader check as a script for a person, §12). With the text size doubled on a screen 768 to 1279 px wide, the tables scroll sideways inside their card instead of becoming cards (browser zoom does turn them into cards).
- **Deployment:** the API doesn't serve the built client and has no CORS, so there is no production setup until M8 (README "Running a built copy"). There is no CI, rate limiting, security headers or monitoring (§3).
- **Infrastructure:** MongoDB must be a replica set (Atlas for development). The first test run downloads a MongoDB binary. Deployment is optional (M8).
