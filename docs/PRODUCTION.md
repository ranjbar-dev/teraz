# Production deployment

Production URL: https://ranjbar.dev. Repository: `ranjbar-dev/teraz`, branch `main`.

Push frontend, backend, dependency, migration, test, Docker, or workflow changes to
`main` to deploy automatically. Documentation-only changes are ignored. Pull
requests run checks and Docker smoke tests without deploying. The Actions page
also provides a manual **Run workflow** button. Saving a local file is not enough:
commit and push it to GitHub.

## Services and storage

`compose.yaml` runs Next.js, NestJS, PostgreSQL 18, and Caddy. A separate migration
image applies Prisma migrations and idempotently creates plans and the platform
owner. Only Caddy publishes ports (80 and 443 TCP, 443 UDP). Database and API ports
are private. Caddy sends `/api/*` directly to NestJS and other requests to Next.js.
Cookies are secure and local laboratory features are disabled in production.
Only official Cloudflare proxy ranges are trusted for client IP headers, so API
rate limiting sees individual visitors rather than a shared Cloudflare address.
Review those ranges against https://www.cloudflare.com/ips/ when changing proxies.

Named volumes `taraz_postgres_data`, `taraz_uploads`, `taraz_caddy_data`, and
`taraz_caddy_config` survive updates and server restarts. Never use `down -v` on
production. The database URL password must be URL-safe; use random hex strings.

GitHub builds and smoke-tests images before transferring them over SSH. Builds
are cached in GitHub, keeping compilation off the small production server.
Deployment uses commit SHA image tags and serializes execution with a server lock.
The API pauses briefly during migrations and replacement; this is not a zero
downtime deployment. Deployments back up PostgreSQL and uploads before migrations.
Application images revert on a failed update when a previous release exists.
The current and previous releases' images are retained. Deployment-generated
database and upload backups expire after 14 days on a successful deployment;
the initial Nginx/configuration backups are retained.
Database migrations are never automatically reversed. Use backward-compatible
migrations so the previous application can continue to use the upgraded schema.

## Server layout and credentials

- `/opt/taraz/.env`: private production credentials (root-only).
- `/opt/taraz/releases/<commit-sha>`: deployment configuration per release.
- `/opt/taraz/current`: last verified release.
- `/opt/taraz/deployed-sha`: deployed commit.
- `/opt/taraz/backups`: database/upload backups and pre-migration Nginx settings.

Initial administrator: `owner@ranjbar.dev`. Retrieve `SUPER_ADMIN_PASSWORD` from
`/opt/taraz/.env` through your own SSH session. Credentials are not committed or
included in Docker images. Back up `.env` securely; its encryption key is required
to read encrypted integration credentials. Deployment backups are on the same
server; copy them and the encryption key to a separate secure backup destination.

GitHub Actions secrets: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. The dedicated SSH key uses OpenSSH
`restrict` to disable PTY and forwarding, but allows root deployment commands.
The host key is pinned. If the server is replaced, independently verify its new
host key before updating `DEPLOY_KNOWN_HOSTS`. Production secrets stay on the server.

## Operations

Run through SSH:

```bash
cd /opt/taraz/current
export IMAGE_TAG=$(cat /opt/taraz/deployed-sha)
docker compose --env-file /opt/taraz/.env ps
docker compose --env-file /opt/taraz/.env logs --tail=100 backend frontend caddy
```

To roll back application images, choose a retained previous release and use its
SHA as `IMAGE_TAG`. Review migration compatibility first, then run:

```bash
docker compose --env-file /opt/taraz/.env -f /opt/taraz/releases/$IMAGE_TAG/compose.yaml up -d --no-deps --wait backend frontend caddy
```

Do not automatically restore an old database over live data. Restore a dump to a
separate database with `pg_restore`, verify it, and plan a controlled cutover if
database recovery is needed. Upload backups must match the restored database.

For another Docker host, copy `.env.example` to `.env`, replace every placeholder,
point DNS to the host, and run `docker compose up -d --build --wait`.
When using Cloudflare, use **Full (strict)** SSL, not Flexible. Caddy needs inbound
80/443 and working public DNS for certificate issuance. Cloudflare forwards the
ACME HTTP challenge to Caddy; no Cloudflare API key is required.

## Existing application limitations

Docker deployment does not add production provider integrations. The application
currently returns `MAIL_PROVIDER_REQUIRED` for email invitations, verification,
and password reset because a production mail sender is not implemented. Payment
code currently targets Zarinpal's sandbox. Tax/SMS integrations and payroll rules
retain the limitations documented in `BACKEND-OPERATIONS.md`. Login and accounting
remain available; configure/implement the required providers before relying on
those external services.

Reference behavior: [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
and [GitHub workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
