# SlotBook — Session handoff (after M4)

Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md) and [DESIGN.md](DESIGN.md) first. This file only adds session context; if it ever disagrees with PLAN.md, PLAN.md wins.

## State

- **Branch:** `main`.
- **Pushed:** the user pushes (M3's commit `9a1e80d` was pushed by them). Run `git status -sb` to see what isn't pushed; M4's commit isn't, unless that says otherwise.
- **Working tree:** clean after each commit, apart from ignored local files (`.env`, other `*.env` files, `node_modules/`, `dist/`).
- **Milestones:** M0, M1 and M2 are done and verified, each including a check against Atlas. M3 and M4 are done and verified on an in-memory replica set only, by choice: nothing was written to Atlas for them. M5 hasn't started; begin it only when the user asks.

## Environment (already set up)

- The user's `.env` holds `MONGODB_URI`, `JWT_SECRET` and the four required `SEED_*` variables. The API needs `JWT_SECRET` to start. Only variable names were ever inspected; never print the values.
- **Atlas holds** 2 users (the seeded admin and member) and the 8 demo resources, with the unique and compound indexes for both collections (checked in M1 and M2). M3 changed none of that, so the first real edit through the Manage resources page will be the first write to Atlas through those endpoints.
- **M4 adds two collections, `bookings` and `slot_reservations`, and four indexes** (PLAN.md §5). The API builds them at startup, before it starts listening. The user's `tsx watch` dev API restarted on the M4 code during the session and answered `/api/health` with `db: connected` afterwards, so the collections and indexes were almost certainly created in Atlas then. That is inferred; nobody looked at Atlas. **No demo bookings are in Atlas** until the user runs `npm run seed` (it now creates 4, dated from the day it runs).
- **The user's own dev servers may be running** on ports 4000 (`tsx watch` API, against Atlas) and 5173 (Vite). They were at the start of M2 and M3, and they restart on source edits, so they also build indexes in Atlas at startup (this is how the empty `resources` collection appeared in Atlas before the M2 seed). Never stop them. Check the ports before starting servers.
- **Running verification servers without touching those:**
  - Use an in-memory replica set for the database (`mongodb-memory-server`, started from a short script), and run the built API with `PORT=4100`, a throwaway `JWT_SECRET` and `MONGODB_URI` in the process environment only.
  - Vite's proxy target is fixed at `http://localhost:4000` in `client/vite.config.ts`. For another port, use a temporary untracked config that merges the base config with `server.port` and `server.proxy` changed (`vite --config <file>`), and delete it afterwards. Don't commit it.

## What M0 implements

**Root:** npm workspaces `client/` and `server/`; `.env.example` (placeholders only); `.gitignore` ignores every `*.env` file except `.env.example`.

**Server (`server/`)**
- `src/config.ts` loads the repo-root `.env` with `process.loadEnvFile` (variables already in the environment win) and validates with Zod. Error messages name variables, never their values.
- `src/db.ts`: `connectDatabase()` connects, checks with `hello` for a replica set or `mongos`, runs a read-only test transaction, then calls `createIndexes()` for every registered model. Every failure throws `DatabaseStartupError` with credentials redacted.
- `src/index.ts` starts in the order config → database → listen. Any failure prints `SlotBook API failed to start: …` and exits with code 1. SIGINT and SIGTERM shut it down cleanly.
- `GET /api/health` returns 200 `{"status":"ok","db":"connected"}`, or 503 when the database is disconnected.

**Client (`client/`):** Vite 6 + React 19 + React Router 7; Tailwind v4 with the DESIGN.md tokens in `src/index.css` (`@theme`, with Tailwind's default colors and shadows cleared); the Vite dev server forwards `/api` to `localhost:4000`.

## What M1 implements

**Server**
- `config.ts` adds a required `JWT_SECRET` (at least 32 characters) to `readConfig()`. `readDatabaseConfig()` is the database-only subset for scripts, and `parseEnv()` is the shared validator.
- `createApp({ jwtSecret, secureCookies })` takes required session options. `index.ts` passes `secureCookies: NODE_ENV === 'production'`; tests use `TEST_SESSION` from `test/helpers.ts`.
- `lib/errors.ts` holds `AppError` and one helper per error code, all producing the PLAN §6 envelope. `middleware/error-handler.ts` has `apiNotFound` and `errorHandler`. Body-parser 4xx errors become 400 `VALIDATION_ERROR`, and unexpected errors become 500 `INTERNAL_ERROR` with the details logged (redacted) and never sent.
- `middleware/validate.ts`: `validateBody(schema)` replaces `req.body` with the parsed result (unknown keys are dropped, which is how a `role` sent to register never reaches the service). `parseQuery(schema, req.query)` does the same job for query strings; Express 5 makes `req.query` read-only, so it returns the parsed value.
- `models/User.ts` (unique email index; `passwordHash` is `select: false`), `schemas/auth.ts`, `lib/session.ts`, `middleware/auth.ts` (`createRequireAuth(options)` reloads the user on every request, and `requireAdmin`), `services/auth.ts` (`createUser`, `registerMember`, `authenticate`), `routes/auth.ts`.
- Passwords: 8–72 characters and at most 72 bytes, because bcryptjs silently truncates beyond 72 bytes. Login compares against a dummy hash when the email is unknown.
- `seed.ts` and `scripts/seed.ts` (`npm run seed`): see M2 for the resources half. An account that exists keeps its name and password, and only its role is corrected.

**Client**
- `lib/api.ts`: `apiFetch<T>(path, { method, body })` and `ApiError`; every failure, including a failed body read, rejects with an `ApiError`. A 401 `UNAUTHENTICATED` calls the handler that `AuthProvider` registers. `lib/auth.tsx`: `AuthProvider`, `useAuth()`, `useSignedInUser()`. `lib/validation.ts`: form checks that follow the server's messages.
- Components: `Button` (and `buttonClasses()` for links styled as buttons), `TextField`, `Message`, `Lozenge`, `Spinner` and `LoadingNote`, `PageHeader`, `FullPageMessage`, `AuthCard`, `icons`, `RouteGuards`, `RootLayout` (auth state, and focus moves to the `h1` after route changes), `AppShell`.
- Pages: `LoginPage`, `RegisterPage`, `ForbiddenPage`, `NotFoundPage`, and `PlaceholderPage` (title and note) for `/bookings` and `/admin/resources`.

## What M2 implements

**Server**
- `models/Resource.ts`: the PLAN §5 fields; the unique name index with a case-insensitive collation (`NAME_COLLATION`) and the `{ isActive, type }` index. `RESOURCE_TYPES` lists room first, and that order is the catalog order. Rooms need a whole-number capacity of 1 or more, equipment is forced to null, tags are 1–30 characters and at most 10. **Those rules live in a `validate` hook, which `updateOne` and `findOneAndUpdate` skip.**
- `GET /api/resources` (`?status=active|all`; `all` only means something to admins) and `GET /api/resources/:id` in `routes/resources.ts` and `services/resources.ts`. The list is sorted by name in the database, then by type in code. A member asking for an inactive resource gets the same 404 as for an unknown id; a malformed id is a 404 too. `lib/object-id.ts` holds the shared id check.
- `demo-resources.ts` (the 8 demo resources) and `seedResources()` in `seed.ts`. It skips resources that exist (names matched ignoring case), treats a duplicate-key error from a concurrent run as "already existed", and never overwrites an admin's edits. `npm run seed` runs both seeds.
- **Tests:** 90 in 6 files. `resources.test.ts` has 33: 401s, member vs admin lists, `?status` handling, ordering, 404s, model rules, indexes, the demo catalog, seeding and the seed race. `test/helpers.ts` also exports `sessionCookie()`.

**Client**
- `lib/useApiData.ts` (`useApiData(path)` → `{ state, reload }`), `lib/useRetryFocus.ts` (focus after "Try again"), `lib/resources.ts` (types, `filterResources`, labels).
- Components: `Dialog` (native `<dialog>`; bottom sheet below 640 px, or below 768 px with `sheetBelow="md"`; content mounted only while open; a drag that starts inside and ends on the backdrop doesn't close it), `IconButton`, `EmptyState`, `Tag` and `CountBadge`, `SkeletonBlock`, `SearchField`, `ResourceFilters`, `ResourceCard`. `PageHeader` has a new `badge` slot.
- Pages: `ResourcesPage` (discovery, `/resources`) and `ResourceDetailPage` (`/resources/:id`, details only, with an honest "Booking isn't available yet" note until M5). UI decisions are recorded in DESIGN.md §5.3 and §5.4.

## What M3 implements

**Server**
- `POST /api/resources` and `PATCH /api/resources/:id` in `routes/resources.ts`, behind `requireAuth` and then `requireAdmin`, then `validateBody`. A member gets 403 whatever the body or the id; only then are the body (400) and the resource (404) checked. The contract is in PLAN.md §6.
- `schemas/resources.ts`: `createResourceBody` and `updateResourceBody` (Zod; unknown keys dropped, so `isActive` can't be set on create and `id` or timestamps never reach the model; PATCH needs at least one field). Tag problems are all reported on the single `tags` key, never `tags.2`, because the form has one Tags field. The limits come from constants exported by the model.
- `services/resources.ts`: `createResource` and `updateResource`. **`updateResource` loads the document, sets only `EDITABLE_FIELDS` and calls `save()`**, so the model's validate hook (room capacity) runs; that closes the M2 carryover. `saveResource` turns a duplicate-key error into 409 `NAME_TAKEN` and a Mongoose `ValidationError` into 400 with one message per field. Never use `updateOne` or `findOneAndUpdate` on resources. Setting `tags` makes Mongoose check `__v`, so `updateResource` reloads and re-applies the change when a save loses a race (a `VersionError`, up to 10 times); without that, two simultaneous tag edits gave a 500.
- `models/Resource.ts` now exports the field limits (`MAX_NAME_LENGTH` 80, `MAX_LOCATION_LENGTH` 120, new, `MAX_DESCRIPTION_LENGTH`, `MAX_TAGS`, `MAX_TAG_LENGTH`). `lib/errors.ts` adds `nameTaken()`.
- **Tests:** 190 in 7 files. `test/resources-admin.test.ts` has 100: 401 and 403 for every kind of change, 403 before 400 and before 404, creating and editing, every invalid field with its exact message, the capacity rules on update, duplicate names (including two requests racing), deactivation and reactivation as seen by members, and mass-assignment attempts. `resources.test.ts` also checks the new location limit.

**Client**
- `pages/ManageResourcesPage.tsx` (`/admin/resources`): loads `GET /api/resources?status=all`, then applies each confirmed change locally with `useApiData`'s new `mutate` and `upsertResource` (which sorts like the server). Status views are `?status=active|inactive` links (`ViewSwitch`); search, type, dialogs and the success or failure message are page state.
- `components/ManageResourceList` (table from 768 px, cards below, both in the page and shown by CSS), `ResourceFormDialog` (Add and Edit), `DeactivateDialog`. `lib/resourceForm.ts` holds the form's values, checks (same limits and messages as the server), `toRequestBody`, `changedFields` (Edit sends only what changed, so it can't undo another admin's edit of a different field) and `errorsFromServer`. `lib/useOnOpen.ts` resets a mounted dialog's state each time it opens.
- Shared components extended: `Dialog` (`size="form"` is 640 px and a full-screen sheet below its breakpoint, `busy` blocks Close, Esc and the backdrop and puts the dialog back if a browser closes it anyway, `initialFocus="title"`), `Message` (`onDismiss`), `Button` (`size="compact"`), `SearchField` (`label`, `caption`). New: `SelectField`, `TextAreaField`, `ViewSwitch`. UI decisions are in DESIGN.md §5.8.

## What M4 implements (server only; nothing in `client/` changed)

**Time**
- `lib/clock.ts`: `now()` is the only place that reads the current time. Tests pin it with `setClock(iso | function)` and restore it with `resetClock()`. No other code in `src` calls `new Date()` or `Date.now()` (Mongoose's own `createdAt` and `updatedAt` stamps are audit data, not business rules).
- `lib/time.ts`: IST helpers with a constant 330-minute offset and no date library. `istDateOf`, `istDayStart`, `isIstDate` (strict: rejects 2026-02-30 and years below 1000), `addDays`, `lastBookableDate`, `slotStartsOn` (the 24 slots), `slotEnd`, `istTimeLabel`, `slotStartAt(date, 'HH:mm')`, `isOnSlotGrid`, `parseUtcInstant` (ISO UTC ending in Z only), and the constants (`MAX_SLOTS_PER_BOOKING` 8, `MAX_DAYS_AHEAD` 30). The tests also pass with the process timezone switched to Los Angeles and Auckland.

**Models.** `models/Booking.ts` and `models/SlotReservation.ts` follow PLAN.md §5. The collection is named `slot_reservations` explicitly. **The unique `{ resource, start }` index is the double-booking guard**: with it dropped, ten simultaneous bookings of one slot all succeeded in a throwaway database, because the transaction alone doesn't conflict on inserts of different documents. Never drop or loosen it. Index definitions are built at startup; changing one that has already been built in Atlas (same keys, different options) stops the API from starting until the old index is dropped.

**Services and routes**
- `services/bookings.ts`: `createBooking(user, { resourceId, slotStarts })`, `cancelBooking(user, id)`, `listBookings({ view, userId? })`, `LIST_LIMIT`. The check order is PLAN.md §6 and §8. A booking is one `session.withTransaction` (snapshot read concern, majority writes) that inserts the parent and then all slot records with `insertMany`. A duplicate key (error code 11000, which `insertMany` surfaces as is) aborts it; the taken slots are then looked up and returned as 409. If none can be found because the holder cancelled in between, the whole transaction is tried again, up to 3 times. A write conflict with a concurrent booking is retried by the driver, and the retry then finds the duplicate. Cancellation conditionally updates the parent (still confirmed, and its start still after the clock, read again inside the transaction) and deletes its slot records in one transaction; if nothing matched, it throws inside the callback, which aborts the transaction and is not retried, and the message says whether it was already cancelled or has just started.
- `middleware/error-handler.ts` now maps a `URIError` to 404. Express throws one when a path parameter can't be decoded (an id such as `%E0%A4%A`) and then skips every handler, `requireAdmin` included, so such a path is a 404 for any signed-in caller, a member's `PATCH` too. Before M4 that was a 500 on every route with an `:id`, including M2's detail route.
- `services/availability.ts`: `getAvailability(resourceId, date, user)`. `past` wins over `unavailable`.
- `routes/bookings.ts`: `POST /`, `GET /mine` (registered before `/:id/...`), `GET /` (admin) and `POST /:id/cancel`. The availability route is in `routes/resources.ts`. `schemas/bookings.ts` checks the shape (`resourceId`, 1–8 distinct ISO UTC starts on the grid and on one IST date; the result is sorted); the date window and "already started" are checked by the service against the clock.
- `middleware/auth.ts` gains `currentUser(req)`. `lib/errors.ts` gains `SLOT_UNAVAILABLE` (with `details.slots`) and `BOOKING_NOT_CANCELLABLE`.
- Booking responses always carry the resource summary and the member (`{ id, name, email }`). A member removed from the database by hand shows as "Deleted account" in lists instead of breaking them.

**Seed.** `demo-bookings.ts` lists 4 demo bookings (2 for the member, 2 for the admin, from tomorrow to 3 days ahead). `seedBookings(accounts)` in `seed.ts` creates them through `createBooking`. It creates nothing while either demo account has a confirmed booking that hasn't ended, so a second run changes nothing, and a run after they are over creates a fresh set. It skips a booking whose resource is missing or inactive or whose slots are taken. `npm run seed` prints "Seeded demo bookings: N created, M skipped".

**Tests: 346 in 14 files (190 before M4).** New: `time` 18 (unit tests of the §10 examples and edge cases), `availability` 19, `bookings-create` 53 (V1, V1b, V2, V5, the all-or-nothing and concurrency tests), `bookings-cancel` 18 (V3, V3b), `bookings-lists` 21, `bookings-access` 17 (V4, and the malformed-escape ids) and `seed-bookings` 10. `health` and `db-guard` now use the cleanup-safe helpers. `test/helpers.ts` gains `ist(date, 'HH:mm')` (an independent IST-to-UTC conversion), `createTestUser(role, name)` (a cookie without bcrypt), and `expectBookingInvariant()` (V6), which every booking test file runs after each test.

**Conventions to reuse in M5 onward**
- Client: send back the `start` strings the availability response gave you; never build instants. Booking, cancel and list responses share one shape (PLAN.md §6). A 409 `SLOT_UNAVAILABLE` carries `details.slots: [{ start, reason }]`; `BOOKING_NOT_CANCELLABLE` has no details, only a message that says which case it is. "In progress" is derived on the client from `start <= now < end`; the upcoming list still contains it.
- Client: call the API only through `apiFetch` (or `useApiData` for reads); render exactly one `PageHeader` per page, kept mounted through loading and error states so focus on the `h1` survives; show results with `Message` and move focus to it after the user's own actions (`useRetryFocus` covers "Try again"); use `buttonClasses()` when a `<Link>` should look like a button; keep placeholders honest (DESIGN.md §9).
- Dialogs: keep the component mounted and toggle `open` (removing an open `<dialog>` loses the focus return); pass `busy` while a request runs; pass `initialFocus` (a field's ref, or `"title"` for text-only confirmations). Dialogs that hold state reset it with `useOnOpen`. After a successful dialog action, the page's own effect focuses the result message, which runs after the dialog's effect has returned focus to its trigger.
- Server: throw the `AppError` helpers; guard routes with `requireAuth` (and `requireAdmin`) passed into route factories; put `requireAdmin` before `validateBody`; validate bodies with `validateBody` and queries with `parseQuery`; save through a loaded document when a model hook holds a rule.
- A `<Link>` that changes only the query string re-renders the page without moving focus to the `h1` (`RootLayout` reacts to the pathname only), which is what view switches want.

**Not built yet:** every booking screen (the slot grid and booking flow, My bookings, the admin All members view), ESLint and CI. The booking API behind them is complete.

## Checks that passed

PLAN.md §12 has the full log with details. In short:

| Check | Result |
|---|---|
| `npm run typecheck`, `npm test` (346/346), `npm run build` | Pass (2026-11-15, after M4) |
| M4: V1–V5 (and V6 after every booking test) on an in-memory replica set, with the time pinned | Pass. Ten members booking one slot at once: one 201, nine 409 |
| M4: the built API over real HTTP and the real `npm run seed`, in-memory replica set (29/29) | Pass (2026-11-15). Startup built the unique slot index before the first request |
| M4: ten simultaneous bookings with the unique index dropped in a throwaway database | All ten succeeded, every round; with the index exactly one. The index is the guarantee |
| M4: test-process cleanup after success, a failed setup and a hard kill (worker and vitest) | Clean after fixes; a killed run's directory is removed by the next run |
| Mutation checks on the new tests (M1: 3, M2: 6) | Each deliberate break turned tests red; reverted, byte-compared and re-run green. Not run for M3 or M4, at the user's request (M4 had the one index check above, on a throwaway database) |
| M3 browser acceptance (105/105, headless Edge, in-memory replica set), and the M2 script re-run on the changed shared components (68/68) | Pass (2026-11-15). Nothing for M3 was run against Atlas |
| M1 browser acceptance (49/49) and mid-session expiry (6/6) | Pass (2026-11-13) |
| M2 browser acceptance (68/68, headless Edge, in-memory replica set) | Pass (2026-11-15) |
| Atlas, M1: `users` collection and sign-in through the real app | 2 users, bcrypt hashes, unique index; login and `me` 200 for both |
| Atlas, M2: seed, then the real app against Atlas | 8 created, then 0 on a second run; 401 signed out; 8 resources in order for both roles; 400, 404 paths correct |
| Discovery in a browser on the user's own dev stack (Vite 5173, API 4000, Atlas) | 8 cards in order, detail opens, cookie hidden from scripts |
| Credential scan of the staged diffs | Clean |

## Atlas connection

- The M0 re-check on 2026-11-13 connected 7 times out of 7 in fresh processes through the API's own `connectDatabase`, and every later Atlas check connected too.
- **The earlier diagnosis is a hypothesis.** The first failure was a TLS handshake abort (SSL alert 80) while DNS and TCP worked, and it went away after the user changed the Network Access list. Most likely cause: this network sends traffic from more than one public address and the list covered one. Never observed: which address the port-27017 traffic used, and what the list contains.
- It still isn't known which entry the user added: an address range or allow-all. If `0.0.0.0/0` is in place, the user should replace it with their network's range.
- If SSL alert 80 returns (for example on a different network), compare the access list with the current public IPs first.

## Commands

Run from the repo root. The syntax is Git Bash; in PowerShell use `$env:PORT=4001; npm start`.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run seed              # needs the SEED_* variables in .env; creates accounts and demo resources; safe to run again

# Development: two separate terminals; each keeps running until Ctrl+C
npm run dev:server        # API -> http://localhost:4000 (needs JWT_SECRET in .env)
npm run dev:client        # app -> http://localhost:5173 (forwards /api to :4000)

# Verify while both are running
curl -s http://localhost:4000/api/health   # {"status":"ok","db":"connected"}
curl -s http://localhost:5173/api/health   # same response, through the proxy

# Built API
PORT=4001 npm start
curl -s http://localhost:4001/api/health

# Failure path: must print "Could not connect to MongoDB ..." and exit 1
JWT_SECRET=0123456789abcdef0123456789abcdef MONGODB_URI='mongodb://127.0.0.1:9/?directConnection=true' node server/dist/index.js; echo "exit $?"

# Before committing: does the staged diff contain any .env value? Prints only the verdict.
git diff --staged | node -e "const{parseEnv}=require('node:util');const e=parseEnv(require('node:fs').readFileSync('.env','utf8'));let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(Object.values(e).some(v=>v&&v.length>=3&&d.includes(v))?'STAGED DIFF CONTAINS .env VALUES - do not commit':'clean'))"
```

## Rules and decisions not recorded elsewhere

- **Commits:** never include `Co-Authored-By` trailers, AI attribution or assistant signatures. This is the user's explicit rule and it overrides any tool reminder. Use the repo-local git identity that is already configured (`git config --local`); don't change it or the global config.
- **History:** never amend or rewrite pushed commits. `f228a41` and `09350ca` show the author "unknown", and `09350ca` also carries a co-author trailer. Both are pushed and stay as they are.
- **Pushing and pacing:** the user does the pushing. Don't push, or start the next milestone, unless asked.
- **Secrets:**
  - Before running anything that loads `.env`, confirm it is ignored and untracked: `git check-ignore -v .env` shows a rule, and `git ls-files .env` prints nothing.
  - Inspect variable names only, never values.
  - Other `*.env` files exist locally (`atlas-credentials.env`). Never open or stage them.
  - Never write real `JWT_SECRET` or `SEED_*` values yourself. For a local check, pass throwaway values through the process environment, and point `MONGODB_URI` at an in-memory replica set so nothing is written to Atlas.
  - When a check must use the real accounts against Atlas (as the M1 and M2 Atlas checks did), read the values from `.env` inside the script, never print them, and print only counts and statuses.
- **Writes to Atlas:** the seed is the one sanctioned write, because it is idempotent and demo-only. Everything else against Atlas stays read-only.
- **Background servers on Windows:**
  - Stopping a background `npm run dev:*` task or its shell wrapper can leave the real `node` process running and holding the port. Stop leftovers only after checking each process's command line, for example with `Get-NetTCPConnection -LocalPort 5173` and `Get-CimInstance Win32_Process`, and match your own processes by command line, not by port, because the user's servers may be on the usual ports.
  - `tsx watch` keeps running even when the API fails to start. Watch for the `SlotBook API failed to start` line instead of waiting for the process to exit.
- **Browser checks without a new dependency:** headless Edge works with its DevTools protocol, and Node 22 has a built-in `WebSocket`, so a short script can navigate, type, click, read `document.cookie` and focus, and take screenshots.
  - Start `msedge.exe --headless=new --remote-debugging-port=<port> --user-data-dir=<temp dir>`, then `Runtime.evaluate` and `Input.insertText` over the socket.
  - `Emulation.setDeviceMetricsOverride` gives a true 375 px viewport. The plain `--screenshot` flag clamps windows narrower than about 500 px.
  - A JS `element.click()` doesn't move focus the way a real press does, so call `focus()` first when a check depends on focus. After Esc closes a dialog, wait until React has unmounted its content too, not just until `dialog.open` is false.
  - These scripts weren't added to the repo, because end-to-end tests are deferred (PLAN.md §3). In dev, Vite serves modules by URL, so `import('/src/lib/api.ts')` from the page reaches the app's own module instance.
  - **Keep headless Edge visible to itself.** Launch it with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`, and send `Emulation.setFocusEmulationEnabled` and `Page.bringToFront`. Without them, after a few minutes the page reported `document.visibilityState` "hidden" and stopped producing animation frames; Chromium queues a `<dialog>`'s `close` event for the next frame, so Esc then left the dialog closed but React's state unchanged. That was the test browser, not an app bug. Give every CDP call a timeout, because a screenshot of a hidden page waits forever.
  - **Esc and user activation.** A page-dispatched or scripted click isn't a user activation. Esc's `cancel` event is cancelable only after a real one (a CDP mouse press or key press counts), and Chrome closes a dialog whose Esc was refused once if Esc comes again without a fresh activation. `Dialog` handles that by reopening itself while `busy`.
  - **Clean up after every run (this filled the C: drive during M3; reviewed and tightened in M4).**
    - **Tests clean up after themselves now.** Every in-memory MongoDB the tests start gets its own data directory, `slotbook-test-db-<pid>-…` in TEMP (helpers in `test/helpers.ts`: `startTestDatabase`, `startMemoryReplSet`, `startMemoryStandalone`). `stop()` removes it, and so does a failed startup. Before M4, a setup that failed after the database had started leaked a `mongodb-memory-server` helper process and the directory; `startTestDatabase` now stops what it started before rethrowing.
    - **A killed run** (a crash, a timeout, Task Manager) can't clean up. Hard-killing a test worker, and vitest itself, showed that `mongodb-memory-server`'s helper still ends the `mongod` process, but the directory (about 200 MB) stays. The next test run deletes directories with this prefix whose pid no longer exists (`removeAbandonedDataDirs`); nothing else is ever touched.
    - **`mongod` isn't called `mongod`.** The cached binary is `mongod-x64-win32-<version>.exe`, so a match on the exact name finds nothing. Match on the prefix and on the command line (`mongo-mem-`, `slotbook-test-db-`).
    - **Ad-hoc scripts** (a browser run, a smoke test): run one in-memory MongoDB at a time with `instanceOpts: [{ dbPath }]` named the same way, stop it in `finally` and on SIGINT and SIGTERM, delete its directory, and run the whole script under a tracker that records every process it starts, including orphans whose parent has died, and removes only those and only the directories created during the run. Never kill by name alone. The M4 tracker, smoke test and race check were scratchpad files, not in the repo. Delete a browser run's Edge profile (`slotbook-edge-*`, hundreds of MB) the same way.
    - MongoDB itself refuses writes when the drive has under 500 MB free, so check `Get-PSDrive C` before starting, and if a seed fails with "available disk space".
- **Writing scripts from Git Bash:** `python` here is the Windows launcher and hangs, so use `node`. A `\\r` inside a heredoc script can arrive as a real carriage return; build such strings with `String.fromCharCode`.
- **Never put backticks in a double-quoted shell string.** Bash runs what is between them. During M4 a README edit passed as `node -e "…"` with `npm run seed` in Markdown backticks made bash execute the real seed against the real `.env`; it failed at the connection step, before it read or wrote anything, so nothing reached Atlas. Edit docs with the Edit tool, put scripts in files, or use single-quoted heredocs.
- **Windows line endings:** `core.autocrlf` is true, so git prints "LF will be replaced by CRLF" warnings. The files in the repo are LF; ignore the warnings.
- **README:** current through M3. Its final pass belongs to M7 (PLAN.md §11).
- **Test scope for a milestone:** use an isolated database for anything that changes data, and don't re-run Atlas connectivity checks, mutation checks or Atlas writes just to repeat coverage the isolated tests already give. The user asked for this at the start of M3.

## Next milestone: M5, slot grid and booking flow

Don't start it unless the user asks. The checklist and acceptance are in PLAN.md §11 (M5), the screens in DESIGN.md §5.4 to §5.6 and §6 to §7. M5 is the first milestone since M3 that changes `client/`, so browser checks apply again: desktop and mobile sizes, the loading, fully booked, error, success and conflict states, a two-browser conflict run and keyboard-only use. The API it needs is built and tested; things M5 will meet:

- **Use the contract as built** (PLAN.md §6): availability gives `start`, `end`, `label`, `status` and `mine` for each of the 24 slots, and the client sends the `start` strings back untouched. `past` wins over `unavailable`, so a booked slot that has started arrives as `past`; "Just taken" (DESIGN.md §5.6) is client-only.
- **Conflicts:** 409 `SLOT_UNAVAILABLE` lists only the slots that are taken or have started (`details.slots`, each with `reason` `booked` or `past`). It books nothing, not even the free slots; DESIGN.md §5.6 says what to do with the rest of the selection. A booking for a date earlier than today, or beyond 30 days, is a 400 on `slotStarts`, a slot earlier today is a 409.
- **The date control:** availability accepts today's date up to today + 30 (IST) and, for the picker's sake, an earlier date shows every slot as past. "Today" must be computed in IST on the client (PLAN.md §10); the API takes `YYYY-MM-DD`.
- **Booking success** returns the booking with its resource name and location, which is what the "Booking confirmed · Room A · …" message needs, so no second request is needed for it.
- An admin can look at an inactive resource's availability, but booking it is 404 for everyone. The grid should say so, or not offer the button, rather than let an admin discover it by failing.
- Deactivating a resource doesn't cancel its bookings (PLAN.md D9, §14); the Deactivate dialog's text already says so.
- The booking lists (`/api/bookings/mine`, `/api/bookings`) are for M6; they are built and tested but have no screen.
