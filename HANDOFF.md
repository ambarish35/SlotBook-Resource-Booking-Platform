# SlotBook — Session handoff (2026-11-13)

Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md) and [DESIGN.md](DESIGN.md) first. This file only adds session context; if it ever disagrees with PLAN.md, PLAN.md wins.

## State

- **Branch:** `main`.
- **Latest commit before this handoff:** `e6bf180` ("docs: mark M0 verified against Atlas"), the same as `origin/main` (pushed). The commit adding this handoff sits on top of it and has **not** been pushed.
- **Working tree:** clean, apart from ignored local files (`.env`, other `*.env` files, `node_modules/`, `dist/`).
- **Milestones:** M0 is done and verified. M1 hasn't started; begin it only when the user asks.

## What M0 implements

**Root**
- npm workspaces `client/` and `server/`, with scripts listed under Commands below.
- `.env.example` (placeholders only); `.gitignore` ignores every `*.env` file except `.env.example`.

**Server (`server/`)**
- `src/config.ts`
  - Loads the repo-root `.env` with `process.loadEnvFile`; variables already in the environment win.
  - Validates with Zod: `MONGODB_URI` is required and still-unfilled `<placeholders>` are rejected; `MONGODB_DB_NAME` defaults to `slotbook`; `PORT` defaults to 4000; `NODE_ENV` is also read.
  - Error messages name variables, never their values.
- `src/db.ts`: `connectDatabase()` runs these steps in order, and every failure throws `DatabaseStartupError` (codes `DB_UNREACHABLE`, `DB_NOT_REPLICA_SET`, `DB_TRANSACTIONS_UNSUPPORTED`) with credentials redacted:
  1. Connect.
  2. Check with `hello` that the deployment is a replica set or `mongos`.
  3. Run a read-only test transaction.
  4. Call `createIndexes()` for every registered model (there are none yet).
- `src/app.ts`: `createApp()` builds the app without listening. It adds `express.json()` and `GET /api/health`, which returns 200 `{"status":"ok","db":"connected"}` or 503 `{"status":"error","db":"disconnected"}`.
- `src/index.ts`:
  - Starts up in the order config → database → listen.
  - Any failure prints `SlotBook API failed to start: …` and exits with code 1.
  - SIGINT and SIGTERM shut it down cleanly.
- `test/`: 9 Vitest tests in 3 files, all run with `mongodb-memory-server`:
  - health: 200, and 503 after the database disconnects;
  - startup guard: a standalone MongoDB is refused and an unreachable one fails clearly;
  - config validation and credential redaction.

**Client (`client/`)**
- Vite 6 + React 19 + React Router 7.
- Tailwind v4 with the DESIGN.md tokens defined in `src/index.css` (`@theme`); Tailwind's default colors and shadows are cleared.
- `AppShell` (skip link, header wordmark, `main`) and `PlaceholderPage`, which states that no booking features exist yet.
- The Vite dev server forwards `/api` to `localhost:4000`.

**Not built yet:** models, auth, the error envelope and middleware, the seed script, all product screens, ESLint, CI.

## Checks that passed (2026-11-13)

| Check | How it was run | Result |
|---|---|---|
| Install | `npm install` | 270 packages, 0 vulnerabilities, no engine warnings |
| Typecheck | `npm run typecheck` | Client and server pass |
| Tests | `npm test` | 9/9 |
| Build | `npm run build` | `client/dist` and `server/dist` |
| Dev API and proxy against Atlas | Both dev servers started, then `curl` on `:4000/api/health` and `:5173/api/health` | 200 `{"status":"ok","db":"connected"}` on both |
| Built API against Atlas | `PORT=4001 npm start`, then `curl :4001/api/health` | 200 |
| Same three, with an in-memory replica set standing in for Atlas | `MONGODB_URI` set to a `mongodb-memory-server` replica set | 200 |
| Failure paths | Built API run with an unreachable URI, then with the `.env.example` placeholder URI | Exit code 1 with a clear message; an environment variable overrides `.env` |
| UI | Headless Edge screenshots at 1280 px, and of the app inside a 375 px iframe | Header, canvas and card render, with no overflow |
| Secrets | Every log and every staged diff compared against the `.env` values | Clean |
| Atlas re-check while writing this handoff | DNS/TCP/TLS probe plus a driver connect | TLS OK on all 3 servers; driver connects |

## Atlas connection (the M0 blocker, now resolved)

**Observations**
- At first the API failed with `MongooseServerSelectionError`.
- DNS SRV resolved 3 servers on port 27017, and TCP connected to all of them.
- All 3 aborted the TLS handshake with "tlsv1 alert internal error" (SSL alert 80).
- No proxy was configured (environment, Windows or WinHTTP), and there was no IPv6 route.
- Public-IP lookups returned two different addresses in the same range: one for HTTPS requests and another for a DNS-based lookup. Ten HTTPS samples all matched.
- The user said their IP had been added in Atlas during setup.
- After the user changed the Atlas Network Access list, the API connected (replica set and transaction verified) and health returned 200. A later re-check also passed.

**Suspected cause (inferred, not proven)**
- The network sends traffic out through several public NAT addresses. The single "current IP" saved at setup didn't match the address that MongoDB traffic leaves from, and Atlas rejects unlisted addresses during the TLS handshake.
- Never observed directly: which public address the port-27017 traffic actually used.

**Unknown and follow-up**
- It isn't known which access-list entry the user added: an address range, or allow-all. If `0.0.0.0/0` is still in place, the user should replace it with their network's range.
- If SSL alert 80 returns (for example on a different network), check the access list against the current public IPs before anything else.

## Commands

Run from the repo root. The syntax is Git Bash; in PowerShell use `$env:PORT=4001; npm start`.

```bash
npm install
npm run typecheck
npm test
npm run build

# Development: two separate terminals; each keeps running until Ctrl+C
npm run dev:server        # API -> http://localhost:4000
npm run dev:client        # app -> http://localhost:5173 (forwards /api to :4000)

# Verify while both are running
curl -s http://localhost:4000/api/health   # {"status":"ok","db":"connected"}
curl -s http://localhost:5173/api/health   # same response, through the proxy

# Built API
PORT=4001 npm start
curl -s http://localhost:4001/api/health

# Failure path: must print "Could not connect to MongoDB ..." and exit 1
MONGODB_URI='mongodb://127.0.0.1:9/?directConnection=true' node server/dist/index.js; echo "exit $?"

# Before committing: does the staged diff contain any .env value? Prints only the verdict.
git diff --staged | node -e "const{parseEnv}=require('node:util');const e=parseEnv(require('node:fs').readFileSync('.env','utf8'));let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(Object.values(e).some(v=>v&&v.length>=3&&d.includes(v))?'STAGED DIFF CONTAINS .env VALUES - do not commit':'clean'))"
```

## Next milestone: M1, accounts and roles

The full checklist is in PLAN.md §11. These acceptance criteria are copied from it, and PLAN.md remains the authority:
- A new visitor registers and lands on `/resources` as a member. Reloading keeps the session. Signing out returns to `/login`, after which `/api/auth/me` returns 401.
- A wrong password shows "Email or password is incorrect."
- Registering with `"role": "admin"` in the body creates a member (test).
- The seeded admin sees "Manage resources" in the nav. A member doesn't, and opening `/admin/resources` shows the 403 page.
- `document.cookie` in the browser console doesn't include the session cookie.

Before starting M1:
- **New environment variables:** `JWT_SECRET`, plus `SEED_*` variables for the admin and member accounts (their names are still to be chosen).
  - Add placeholders for them to `.env.example`.
  - Ask the user to put the real values in `.env`; never write, print or commit them yourself.
  - The user can generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **New dependencies:** from the allowlist, `bcryptjs`, `jsonwebtoken` and `cookie-parser`, plus their `@types/*` packages where needed.
  - Check each package's Node engine range against Node 22.11 before installing (D13).
  - Afterwards, run `npm ls vite` and confirm Vite is still a single version.

## Rules and decisions not recorded elsewhere

- **Commits:** never include `Co-Authored-By` trailers, AI attribution or assistant signatures. This is the user's explicit rule and it overrides any tool reminder. Use the repo-local git identity that is already configured (`git config --local`); don't change it or the global config.
- **History:** never amend or rewrite pushed commits. `f228a41` and `09350ca` show the author "unknown", and `09350ca` also carries a co-author trailer. Both are pushed and stay as they are.
- **Pushing and pacing:** the user does the pushing. Don't push, commit or start the next milestone unless asked.
- **Secrets:**
  - Before running anything that loads `.env`, confirm it is ignored and untracked: `git check-ignore -v .env` shows a rule, and `git ls-files .env` prints nothing.
  - Inspect variable names only, never values.
  - Other `*.env` files exist locally. Never open or stage them.
- **Background servers on Windows:**
  - Stopping a background `npm run dev:*` task or its shell wrapper can leave the real `node` process running and holding the port. Afterwards, confirm ports 4000, 4001 and 5173 are free. Stop leftovers only after checking each process's command line, for example with `Get-NetTCPConnection -LocalPort 5173` and `Get-CimInstance Win32_Process`.
  - `tsx watch` keeps running even when the API fails to start. Watch for the `SlotBook API failed to start` line instead of waiting for the process to exit.
- **Visual checks:** headless Edge (`msedge --headless=new --screenshot=…`) takes screenshots without any new dependency. Windows narrower than about 500 px get clamped, though, so for 375 px take the screenshot of a page that embeds the app in a 375 px-wide iframe.
