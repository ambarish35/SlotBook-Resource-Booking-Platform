# Deploying SlotBook

**Status: prepared and verified locally in production mode; not deployed.** Nothing here has been run against a hosting account or against Atlas. [PLAN.md](PLAN.md) (M8) has the verification record; this file is what a person needs to go live, and the decisions only the owner can make.

## The arrangement

```
browser ──HTTPS──▶ host's proxy ──HTTP──▶ one Node process (npm start)
                   (TLS ends here)         ├─ /api/*   the JSON API
                                           └─ everything else: client/dist (the built React app,
                                              with index.html for deep links)
                                                      │
                                                      ▼
                                              MongoDB Atlas (a replica set)
```

- **One origin.** The page and the API are served from the same address, so the session cookie just works, and there is no CORS (none is enabled, and none is needed).
- **One process, one instance.** The sign-in rate limit is kept in memory (PLAN.md §14), so run a single instance.
- **Proposed host: Render**, one free web service, as `render.yaml` describes. Any host that runs one Node process, ends HTTPS in a proxy and lets you set environment variables fits: change `TRUST_PROXY` to the number of proxies that host puts in front.

## Decisions for the owner

Nothing below has been decided for you. The defaults are what `render.yaml` assumes.

| Decision | Assumed | What it means |
|---|---|---|
| **Host and plan** | Render, free plan | As Render documents it (not observed for this app), a free web service sleeps after a period without traffic and takes about a minute to wake, and the in-memory rate-limit counters reset when it does. A paid plan stays awake and costs money: not chosen for you |
| **Region** | Render's default | Pick the region nearest your Atlas cluster, to keep each database round trip short |
| **Atlas cluster** | A new free (M0) cluster for production | Reusing your development cluster is possible, but then give production its own database name (`MONGODB_DB_NAME`), so demo and test data don't mix. `render.yaml` says `slotbook`, which is also the development database's name: change it if you share a cluster |
| **Atlas user** | A new user with the `readWrite` role on the production database only | The API creates its collections and indexes at start-up, which `readWrite` allows. Don't reuse your admin user |
| **Atlas Network Access** | Allow `0.0.0.0/0` | **A trade-off.** A free host has no fixed outbound address to list, so the only entry that works is "anywhere". The database is then protected by TLS and its user's password alone. A host with a fixed outbound address (or Atlas's private networking, on paid tiers) lets you list just that one |
| **Demo data in production** | `npm run seed`: 2 accounts, 8 resources, 4 bookings | Right for a public demo. There is no switch to seed only the admin, and no screen to create or remove an admin: roles change through the seed or the database |
| **Seeded passwords** | Yours to choose | **There is no "change password" feature.** The seeded admin's password stays until someone edits the database, so give it the strength of any admin password, and don't publish it. If a public demo needs a published login, publish the *member's* only |
| **Custom domain** | None (the host's `*.onrender.com` address, with HTTPS) | Optional. If you add one, check that no other app shares its registrable domain: the cross-site write check refuses same-site pages from other origins, but a shared domain widens what `SameSite` treats as one site |

## Values only you can supply

| Value | Where it goes | Notes |
|---|---|---|
| `MONGODB_URI` | The host's dashboard (Render asks for it when the Blueprint is created; `render.yaml` leaves it out) | Atlas → Connect → Drivers. Never into a chat, a file in the repository, a screenshot or an issue |
| The four `SEED_*` values | Your own terminal, for one command (below), and nowhere else | Admin and member email and password. Not in `render.yaml`, not in the dashboard |
| `JWT_SECRET` | **Nothing for you to do:** `render.yaml` has Render generate it | Changing it later signs everyone out. If you use another host, generate 32 or more random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

## Configuration reference

| Variable | Required | Value in production | Checked at start-up |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | Only `development`, `test` or `production` are accepted. `production` serves the built client, sets the cookie `Secure`, sends HSTS on HTTPS requests, and makes the next two mandatory |
| `TRUST_PROXY` | **yes, in production** | `1` on Render; `0` if clients reach the API directly | A whole number from 0 to 10, or the API refuses to start. See PLAN.md §9 for why it has no default |
| `MONGODB_URI` | yes | An Atlas `mongodb+srv://…` string for a replica set | Must start with `mongodb://` or `mongodb+srv://`; the unfilled example is refused. The API also refuses a standalone server |
| `JWT_SECRET` | yes | 32 or more random characters | At least 32 characters; the unfilled example is refused |
| `MONGODB_DB_NAME` | no | `slotbook` | |
| `PORT` | no | Set by the host | Whole number 1 to 65535; default 4000 |
| Build output | yes | `client/dist` and `server/dist` from `npm run build` | `NODE_ENV=production` refuses to start without `client/dist/index.html` |

Error messages name the variable and never print a value.

Commands (the ones `render.yaml` uses): build `npm ci --include=dev && npm run build` (`--include=dev` because `NODE_ENV=production` would otherwise skip TypeScript and Vite, which the build needs); start `npm start`; liveness `GET /api/health`; readiness `GET /api/ready`.

## Runbook

Do not start until the decisions above are made. You push the repository yourself; nothing here pushes, publishes or creates a resource.

1. **Atlas.** Create the cluster (or choose the existing one), a database user with `readWrite` on the production database, and the Network Access entry you decided on. Copy the connection string somewhere private.
2. **Render.** New → Blueprint → choose the repository (it must be on GitHub or GitLab: you push it) → review `render.yaml` → when asked, paste `MONGODB_URI` → apply. Confirm the service is on the plan you chose before applying.
3. **First deploy.** Watch the logs for `MongoDB connected: database "…", replica set and transactions verified`, then `SlotBook API listening` and `Production mode: secure cookies, serving the built client, 1 trusted proxy`. A start-up failure prints `SlotBook API failed to start:` and says which setting is wrong.
4. **Seed the demo data**, from your computer, once. **Read this first:** the seed also reads a `.env` in the repository root if you have one (your development one). A variable set in the terminal wins over `.env` *per variable*, so a variable you forget is taken from `.env`, and `MONGODB_URI` forgotten means **you seed your development database**. Set all five in the same terminal session, check them, run, then clear them:

   ```powershell
   $env:MONGODB_URI = '<the production connection string>'
   $env:MONGODB_DB_NAME = 'slotbook'          # the same value as on the host
   $env:SEED_ADMIN_EMAIL = '<admin email>'
   $env:SEED_ADMIN_PASSWORD = '<a strong password>'
   $env:SEED_MEMBER_EMAIL = '<member email>'
   $env:SEED_MEMBER_PASSWORD = '<another password>'
   npm run seed        # first prints the database NAME it is writing to (check it is the production one), then counts only
   Remove-Item Env:MONGODB_URI, Env:MONGODB_DB_NAME, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD, Env:SEED_MEMBER_EMAIL, Env:SEED_MEMBER_PASSWORD
   ```

   It is safe to run again (it never changes an existing account's password). The seed does not run when the app starts.
5. **Smoke test** (about five minutes, in a private window, on the public address):
   - `/api/health` answers `{"status":"ok"}` and `/api/ready` answers `{"status":"ready","db":"connected"}`.
   - Sign in as the member; the 8 demo resources show; search for one; book two slots tomorrow; My bookings lists it; cancel it; its slots are available again; sign out.
   - Reload the browser on `/bookings` and on a resource's page (a deep link): both load and keep you signed in.
   - `/api/nothing-here` answers JSON (`{"error":{"code":"NOT_FOUND",…}}`), not a web page.
   - In the browser's developer tools: the session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`; the page's response has `Content-Security-Policy` and `Strict-Transport-Security`; the console has no errors apart from a 401 for `/api/auth/me` on the very first signed-out load.
   - Sign in as the admin: Manage resources and All members work.
6. **Afterwards.** `autoDeploy` is off: a new version goes out when you press Deploy. To roll back, redeploy an earlier commit from the dashboard. Rotating `JWT_SECRET` signs everyone out.

## What this does and doesn't protect

- **Does:** the production settings are validated before anything listens; the cookie is `HttpOnly`, `SameSite=Lax` and `Secure`; a request that changes data and claims to come from another site is refused; wrong passwords and registrations are limited per client address; the page may load only its own files (a strict `Content-Security-Policy`); HTTPS is pinned with HSTS; nothing is cached that shouldn't be; no secret is in the build, the logs or the repository.
- **Doesn't:** there is no password change or reset, no email verification, no revoking of a session before its seven days end, no account lockout, no access log, no monitoring or alerting, no response compression, no CI, and no backup beyond what Atlas does for your tier (PLAN.md §14).
- **Not yet checked by anyone:** a real run on Render and against Atlas, with real HTTPS and a real proxy; and a screen reader (PLAN.md §12 has the script).
