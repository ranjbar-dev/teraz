# Taraz project agent guide

This repository is a Persian, RTL, multi-tenant accounting application. The
frontend is Next.js 16 and React 19. The operational backend is NestJS with
PostgreSQL and Prisma. Treat accounting correctness, tenant isolation, audit
history, and Persian-language usability as product requirements.

## Before changing code

- Read `README.md` and the relevant file in `docs/` before editing a subsystem.
- This repository uses a Next.js version with breaking changes. Before writing
  Next.js code, read the relevant guide under `node_modules/next/dist/docs/`.
- When `graphify-out/graph.json` exists, query it before broad architecture
  searches. Use the source files as the final authority.
- Preserve unrelated working-tree changes and generated review artifacts.

## Architecture boundaries

- `src/app/` contains routes, layouts, global styles, and the frontend API proxy.
- `src/components/` contains the RTL product UI and shared interaction patterns.
- `src/lib/` contains frontend domain metadata, state, search, and server access.
- `backend/src/` contains the NestJS API and accounting domain services.
- `backend/prisma/` owns the database schema and ordered migrations.
- `tests/` and `backend/tests/` contain frontend/domain and backend checks.
- `scripts/`, `deploy/`, `compose.yaml`, and the Dockerfiles own local operations
  and production packaging.

Do not move accounting invariants into presentation code. Enforce permissions,
company scope, immutable posted entries, and financial invariants in the backend
and database as appropriate. Never weaken production safeguards to make a test
pass.

## Documentation is part of every change

Update documentation in the same change whenever behavior, commands,
configuration, architecture, constraints, or verified status changes:

- `README.md`: developer entry point, supported capabilities, and common commands.
- `docs/BACKEND-OPERATIONS.md`: backend architecture, API, security, providers,
  data rules, backup, and operations.
- `docs/LOCAL-TESTING.md`: local setup and test procedures.
- `docs/PRODUCTION.md`: deployment, infrastructure, and production operations.
- `docs/ONBOARDING.md`: guided-tour behavior and onboarding coverage.
- `docs/IMPLEMENTATION-STATUS.md`: delivered and remaining operational work.
- `docs/FRONTEND-COVERAGE.md`: frontend route/interaction coverage and evidence.
- `docs/GRAPHIFY.md`: knowledge-graph setup, refresh workflow, and hook behavior.

Do not claim a capability, compliance level, test result, or production readiness
that was not actually verified. If no prose document needs a change, say why in
the final handoff. After code changes, refresh Graphify so
`graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, and the visualization
reflect the current codebase.

## Verification

Run the smallest relevant checks first, then expand in proportion to risk:

- Frontend types: `npm run typecheck`
- Frontend domain tests: `npm test`
- Frontend production build: `npm run build`
- Backend build: `npm run backend:build`
- Backend integration tests: `npm run test:backend`
- Full isolated browser suite: `npm run test:full`

Database, authentication, accounting, deployment, or cross-service changes need
backend-focused verification. UI changes need responsive RTL verification and,
when material, updated review evidence. Report commands that were not run and the
reason.

## Safety and repository hygiene

- Never commit secrets, `.env` files, runtime credentials, uploads, local data,
  or database backups.
- Add Prisma migrations; do not rewrite migrations that may already be deployed.
- Keep lockfiles synchronized with dependency changes.
- Do not hand-edit generated Graphify outputs. Regenerate them.
- Do not commit build output such as `.next/`, `backend/dist/`, or runtime data.
