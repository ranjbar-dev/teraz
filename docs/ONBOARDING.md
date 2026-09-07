# Interactive onboarding

The workspace header contains **راهنمای این صفحه**. The Help page contains a
searchable catalog and **اجرای دوبارهٔ شروع سریع**. Links with `?tour=page` open
the destination's guide. Lists, create/edit forms, details, reports and organization
services have contextual instructions. Admin-only catalog entries follow the
existing navigation role rules; viewer guides omit write actions.

The initial six-step guide opens after an authenticated workspace is ready.
Finishing, skipping or closing records `Membership.tourSeenAt` through authenticated
`PATCH /api/onboarding`; subsequent sessions and devices use `GET /api/onboarding`.
Each member has independent state in each organization. Accounts without an
organization use `User.tourSeenAt`. Request-body user/organization identifiers
are never trusted. Existing memberships have no historical onboarding state and
receive the guide once after this release. Closing the browser mid-tour does not
mark it seen. Failed persistence displays a retry action and leaves the app usable.

Tours do not submit forms or perform financial operations. They are nonmodal,
support Escape, move focus to the instructions and restore it on close. Missing,
loading or offscreen targets do not block navigation. The instructions remain
available, and matching elements are highlighted when page data arrives.

Validation: `npm test`, `npm run build`, `npm run build --prefix backend`, and
`npm run test:full` (isolated PostgreSQL + real Chrome). The browser suite exercises
first use, error/retry, server persistence in a clean browser context, replay,
page/form instructions, keyboard dismissal and mobile layout.
