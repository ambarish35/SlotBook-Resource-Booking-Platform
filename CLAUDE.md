# CLAUDE.md

SlotBook is a MERN app for booking meeting rooms and shared equipment within one organization. **Status: plan approved on 2026-11-13; implementation starts with M0. No application code exists yet.**

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

_Not established yet._ During M0, record the exact install, dev, build, typecheck, test and seed commands here, each only after it has run successfully.

## Environment

- Node.js 22 LTS, npm workspaces (`client/`, `server/`).
- MongoDB must be a replica set because bookings use transactions. Use an Atlas cluster for development; tests use the replica set from `mongodb-memory-server`.
- Business times are IST and storage is UTC (PLAN.md §10).
- Secrets live in `.env`, which git ignores. Keep `.env.example` up to date.
