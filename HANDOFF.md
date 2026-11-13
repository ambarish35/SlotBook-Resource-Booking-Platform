# SlotBook — Session handoff (2026-11-13, after M1)

Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md) and [DESIGN.md](DESIGN.md) first. This file only adds session context; if it ever disagrees with PLAN.md, PLAN.md wins.

## State

- **Branch:** `main`.
- **Pushed:** `8fbebc3` ("docs: add session handoff"); `origin/main` pointed there at the last local check. The M1 commit sits on top of it (`git log -1`) and has **not** been pushed. The user does the pushing.
- **Working tree:** clean after the M1 commit, apart from ignored local files (`.env`, other `*.env` files, `node_modules/`, `dist/`).
- **Milestones:**
  - M0 is done and verified.
  - M1 is built and verified on an in-memory replica set. One checklist item is still open: the accounts aren't seeded in Atlas yet, because that needs values only the user can supply (below).
  - M2 hasn't started. Begin it only when the user asks, and once M1's Atlas step is confirmed.

## What the user needs to do next

1. Add these to the repo-root `.env`. Never paste the values into chat, commits or commands:
   - `JWT_SECRET`: generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_EMAIL`, `SEED_MEMBER_PASSWORD` (passwords 8–72 characters). Optional: `SEED_ADMIN_NAME`, `SEED_MEMBER_NAME`.
2. Run `npm run seed`. Expect `Seeded users: admin created, member created`. It is safe to run again.
3. Run `npm run dev:server` and `npm run dev:client`, then sign in as each account. Then tick the last M1 item in PLAN.md §11 and log the run in §12.

Until `JWT_SECRET` is set, `npm run dev:server` and `npm start` exit with `JWT_SECRET is required`. That is intended.

Side effect to know about: booting the M1 API against Atlas builds the `users` indexes, so the Atlas `slotbook` database now holds an empty `users` collection with a unique email index. No user was created there.

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
- `createApp({ jwtSecret, secureCookies })` now takes required session options. `index.ts` passes `secureCookies: NODE_ENV === 'production'`; tests use `TEST_SESSION` from `test/helpers.ts`.
- `lib/errors.ts` holds `AppError` and one helper per error code, all producing the PLAN §6 envelope. `middleware/error-handler.ts` has `apiNotFound` and `errorHandler`. Body-parser 4xx errors become 400 `VALIDATION_ERROR`, and unexpected errors become 500 `INTERNAL_ERROR` with the details logged (redacted) and never sent.
- `middleware/validate.ts`: `validateBody(schema)` replaces `req.body` with the parsed result. Unknown keys are dropped, which is how a `role` sent to register never reaches the service.
- `models/User.ts` (unique email index; `passwordHash` is `select: false`), `schemas/auth.ts` (field rules shared by register and the seed), `lib/session.ts` (JWT and cookie helpers), `middleware/auth.ts` (`createRequireAuth(options)` reloads the user on every request, and `requireAdmin`), `services/auth.ts` (`createUser`, `registerMember`, `authenticate`), `routes/auth.ts`.
- Passwords: 8–72 characters and at most 72 bytes, because bcryptjs silently truncates beyond 72 bytes. Login compares against a dummy hash when the email is unknown, so timing doesn't reveal which accounts exist.
- `seed.ts` and `scripts/seed.ts` (`npm run seed`): creates a missing account; for an existing one, keeps its name and password and corrects only its role.
- **Tests:** 57 in 5 files (`auth`, `seed`, `config`, `health`, `db-guard`), all on an in-memory replica set.

**Client**
- `lib/api.ts`: `apiFetch<T>(path, { method, body })` and `ApiError`. A 401 `UNAUTHENTICATED` calls the handler that `AuthProvider` registers. `lib/auth.tsx`: `AuthProvider`, `useAuth()`, `useSignedInUser()`. `lib/validation.ts`: form checks that mirror the server's messages.
- Components: `Button` (and `buttonClasses()` for links styled as buttons), `TextField`, `Message`, `Lozenge`, `Spinner` and `LoadingNote`, `PageHeader`, `FullPageMessage`, `AuthCard`, `icons`, `RouteGuards` (`RequireAuth`, `RedirectIfSignedIn`, `RequireAdmin`), `RootLayout` (provides auth state and moves focus to the `h1` after route changes), `AppShell` (nav, mobile menu, sign out).
- Pages: `LoginPage`, `RegisterPage`, `ForbiddenPage`, `NotFoundPage`, and `PlaceholderPage` (title and note) for `/resources`, `/bookings` and `/admin/resources`, which are honest "not built yet" pages until their milestones.

**Conventions to reuse in M2 onward**
- Client: call the API only through `apiFetch`; render exactly one `PageHeader` per page; show results with `Message` and move focus to it after the user's own actions; use `buttonClasses()` when a `<Link>` should look like a button; keep placeholders honest (DESIGN.md §9).
- Server: throw the `AppError` helpers; guard routes with `requireAuth` (and `requireAdmin`) passed into route factories as `createAuthRouter` does; validate bodies with `validateBody`.

**Not built yet:** resources, bookings, availability, all other product screens, ESLint, CI.

## Checks that passed (2026-11-13)

PLAN.md §12 has the full log with details. In short:

| Check | Result |
|---|---|
| `npm install` of the three auth packages and two `@types/*` | 0 vulnerabilities; Vite still a single version |
| `npm run typecheck`, `npm test` (57/57), `npm run build` | Pass |
| Mutation checks on the new tests | Each deliberate break turned tests red; reverted and re-run green |
| `npm run seed` (in-memory replica set) | Created, then unchanged on a second run; clear failure with no `SEED_*` |
| Browser acceptance script (headless Edge, in-memory replica set) | 49/49 on the final build |
| Mid-session expiry in the browser | 6/6 |
| Built API booted against Atlas | Replica set and transactions verified; health 200; `me` 401 |
| Credential scan of the diff | Clean |
| Seeded accounts in Atlas, signing in against Atlas | **Not run** (needs the user's `.env` values) |

## Atlas connection

- At the start of this session, 7 fresh-process connections through the API's own `connectDatabase` all succeeded, and the M1 API later booted against Atlas.
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
npm run seed              # needs the SEED_* variables in .env; safe to run again

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
- **Background servers on Windows:**
  - Stopping a background `npm run dev:*` task or its shell wrapper can leave the real `node` process running and holding the port. Afterwards, confirm ports 4000, 4001 and 5173 are free. Stop leftovers only after checking each process's command line, for example with `Get-NetTCPConnection -LocalPort 5173` and `Get-CimInstance Win32_Process`.
  - `tsx watch` keeps running even when the API fails to start. Watch for the `SlotBook API failed to start` line instead of waiting for the process to exit.
- **Browser checks without a new dependency:** headless Edge works with its DevTools protocol, and Node 22 has a built-in `WebSocket`, so a short script can navigate, type, click, read `document.cookie` and focus, and take screenshots.
  - Start `msedge.exe --headless=new --remote-debugging-port=<port> --user-data-dir=<temp dir>`, then `Runtime.evaluate` and `Input.insertText` over the socket.
  - `Emulation.setDeviceMetricsOverride` gives a true 375 px viewport. The plain `--screenshot` flag clamps windows narrower than about 500 px.
  - These scripts weren't added to the repo, because end-to-end tests are deferred (PLAN.md §3). In dev, Vite serves modules by URL, so `import('/src/lib/api.ts')` from the page reaches the app's own module instance.
- **Windows line endings:** `core.autocrlf` is true, so git prints "LF will be replaced by CRLF" warnings. The files in the repo are LF; ignore the warnings.
- **README is stale:** it still says "Planning — implementation has not started". Its rewrite belongs to M7 (PLAN.md §11), so it was left alone.

## Next milestone: M2, resource catalog and discovery

The full checklist is in PLAN.md §11. Start it only when asked, after M1's Atlas seed is confirmed. It adds the Resource model and indexes, about 8 demo resources in the seed, `GET /api/resources` and `GET /api/resources/:id`, the discovery page with search and filters, the resource detail header, and API tests. It is the first milestone where pages call the API after sign-in, so the mid-session 401 handling will run for real.
