# SlotBook — Session handoff (after M2)

Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md) and [DESIGN.md](DESIGN.md) first. This file only adds session context; if it ever disagrees with PLAN.md, PLAN.md wins.

## State

- **Branch:** `main`.
- **Pushed:** `8fbebc3` ("docs: add session handoff") was the last pushed commit at the last local check. Later commits (`git log`) aren't pushed; the user does the pushing.
- **Working tree:** clean after each commit, apart from ignored local files (`.env`, other `*.env` files, `node_modules/`, `dist/`).
- **Milestones:** M0, M1 and M2 are done and verified, each including a check against Atlas. M3 hasn't started; begin it only when the user asks.

## Environment (already set up)

- The user's `.env` holds `MONGODB_URI`, `JWT_SECRET` and the four required `SEED_*` variables. The API needs `JWT_SECRET` to start. Only variable names were ever inspected; never print the values.
- **Atlas now holds** 2 users (the seeded admin and member) and the 8 demo resources, with the unique and compound indexes for both collections.
- **The user's own dev servers may be running** on ports 4000 (`tsx watch` API, against Atlas) and 5173 (Vite). They were during M2, and they restart on source edits, so they also build indexes in Atlas at startup (this is how the empty `resources` collection appeared in Atlas before the M2 seed). Never stop them. Check the ports before starting servers.
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

**Conventions to reuse in M3 onward**
- Client: call the API only through `apiFetch` (or `useApiData` for reads); render exactly one `PageHeader` per page, kept mounted through loading and error states so focus on the `h1` survives; show results with `Message` and move focus to it after the user's own actions (`useRetryFocus` covers "Try again"); use `buttonClasses()` when a `<Link>` should look like a button; use `Dialog` with `initialFocus` for modals; keep placeholders honest (DESIGN.md §9).
- Server: throw the `AppError` helpers; guard routes with `requireAuth` (and `requireAdmin`) passed into route factories; validate bodies with `validateBody` and queries with `parseQuery`.
- **For M3's PATCH:** load the resource, change it and `save()`, so the model's capacity rules run. A plain `updateOne` would bypass them. The Manage page needs inactive resources too, so it should call `GET /api/resources?status=all`.

**Not built yet:** bookings, availability and slots, the admin pages, ESLint, CI.

## Checks that passed

PLAN.md §12 has the full log with details. In short:

| Check | Result |
|---|---|
| `npm run typecheck`, `npm test` (90/90), `npm run build` | Pass (2026-11-15) |
| Mutation checks on the new tests (M1: 3, M2: 6) | Each deliberate break turned tests red; reverted, byte-compared and re-run green |
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
- **Writing scripts from Git Bash:** `python` here is the Windows launcher and hangs, so use `node`. A `\\r` inside a heredoc script can arrive as a real carriage return; build such strings with `String.fromCharCode`.
- **Windows line endings:** `core.autocrlf` is true, so git prints "LF will be replaced by CRLF" warnings. The files in the repo are LF; ignore the warnings.
- **README:** current through M2. Its final pass belongs to M7 (PLAN.md §11).

## Next milestone: M3, admin resource management

The full checklist is in PLAN.md §11. It adds `POST /api/resources` and `PATCH /api/resources/:id` with validation (rooms need a capacity, names are unique), the Manage resources page (a table on desktop, cards on mobile, a status filter, an Add/Edit dialog, Deactivate and Reactivate with confirmation), and API tests (member → 403, invalid body → 400, deactivated resource → 404 for members). Read the "For M3's PATCH" note above before writing the update path.
