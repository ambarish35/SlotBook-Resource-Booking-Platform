# CLAUDE.md

SlotBook is a MERN app for booking meeting rooms and shared equipment within one organization. **Status: M0 (foundation) is done and verified. M1 (accounts and roles) is next.**

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

Run these from the repo root. Each one ran successfully during M0 (2026-11-13).

| Command | What it does |
|---|---|
| `npm install` | Installs both workspaces (`client/`, `server/`) |
| `npm run dev:server` | API with reload on http://localhost:4000; reads the repo-root `.env` |
| `npm run dev:client` | Client on http://localhost:5173; forwards `/api` to port 4000 |
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | Server tests (Vitest + Supertest on an in-memory MongoDB replica set) |
| `npm run build` | Builds `client/dist` and `server/dist` |
| `npm start` | Runs the built API from `server/dist` |

Development needs two terminals, one for `npm run dev:server` and one for `npm run dev:client`. A seed command arrives in M1.

## Environment

- Node.js 22.11 on the dev machine. Dependencies are pinned to majors that support it (PLAN.md D13).
- `.env` lives at the repo root. The API reads `MONGODB_URI` (credentials inside), plus optional `MONGODB_DB_NAME` (default `slotbook`) and `PORT` (default 4000). Real environment variables override `.env`.
- MongoDB must be a replica set because bookings use transactions; the API refuses to start otherwise. Atlas only accepts IP addresses on the project's Network Access list. The development network uses several public IPs, so the list needs the network's address range, not a single IP. Tests use the replica set from `mongodb-memory-server`.
- Business times are IST and storage is UTC (PLAN.md §10).
- Secrets live in `.env` and other `*.env` files, which git ignores. Keep `.env.example` current, with placeholders only.
