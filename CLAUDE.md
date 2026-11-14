# CLAUDE.md

SlotBook is a MERN app for booking meeting rooms and shared equipment within one organization. **Status: M0 (foundation), M1 (accounts and roles) and M2 (resource catalog and discovery) are done and verified. M3 (admin resource management) is next.**

## Before implementing

- Read [PLAN.md](PLAN.md) (scope, data model, API, milestones, verification) and [DESIGN.md](DESIGN.md) (tokens, components, screens, states) first. They are the source of truth; when a decision changes, update them in the same change.

## Working rules

- Implement **one milestone at a time**, in PLAN.md order. Meet and verify its acceptance criteria before starting the next.
- Keep the PLAN.md checklist current. Tick an item only after it is built and verified, update the milestone status, and log real verification results in PLAN.md §12.
- Stay in scope. Don't add dependencies beyond the PLAN.md allowlist or build features from the Deferred list without explicit approval; ask first.
- Use only the DESIGN.md tokens and components. Don't add colors, fonts or UI libraries.
- Verify the relevant behavior (tests and acceptance checks) before committing. Keep commits small, with conventional messages.
- Never claim a check passed unless it actually ran and succeeded. Report failures, skipped checks and anything not run, with the output.
- Never ship sample data in real screens (DESIGN.md §9).
- Don't push, add remotes, or change git identity or credentials unless asked.

## Commands

Run these from the repo root. Each one ran successfully (M0 to M2, 2026-11-13 to 2026-11-15), and `npm run seed` has run against both an in-memory replica set and Atlas.

| Command | What it does |
|---|---|
| `npm install` | Installs both workspaces (`client/`, `server/`) |
| `npm run dev:server` | API with reload on http://localhost:4000; reads the repo-root `.env` |
| `npm run dev:client` | Client on http://localhost:5173; forwards `/api` to port 4000 |
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | Server tests (Vitest + Supertest on an in-memory MongoDB replica set) |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built API from `server/dist` |
| `npm run seed` | Creates the admin and member accounts from the `SEED_*` variables, plus the 8 demo resources; safe to run again (see PLAN.md §11, M1 and M2 notes) |

Development needs two terminals, one for `npm run dev:server` and one for `npm run dev:client`. The API won't start until `JWT_SECRET` is set in `.env`. The user may already have both running (ports 4000 and 5173): check before starting servers, never stop them, and run verification servers on other ports (see HANDOFF.md).

## Environment

- Node.js 22.11 on the dev machine. Dependencies are pinned to majors that support it (PLAN.md D13).
- `.env` lives at the repo root. The API reads `MONGODB_URI` (credentials inside) and `JWT_SECRET` (required, at least 32 characters), plus optional `MONGODB_DB_NAME` (default `slotbook`) and `PORT` (default 4000). `npm run seed` reads `MONGODB_URI` and the `SEED_*` variables listed in `.env.example`, but not `JWT_SECRET`. Real environment variables override `.env`.
- MongoDB must be a replica set because bookings use transactions; the API refuses to start otherwise. Atlas only accepts IP addresses on the project's Network Access list. If the connection fails with a TLS "SSL alert 80" while DNS and TCP work, suspect that list first: this network uses more than one public IP (suspected cause of the earlier failure, not proven), so a single "current IP" entry may not be enough. Tests use the replica set from `mongodb-memory-server`.
- Never write real secret values (`JWT_SECRET`, `SEED_*` passwords, the connection string) into files or commands yourself; the user puts them in `.env`. For a local check, pass throwaway values through the process environment only.
- Business times are IST and storage is UTC (PLAN.md §10).
- Secrets live in `.env` and other `*.env` files, which git ignores. Keep `.env.example` current, with placeholders only.
