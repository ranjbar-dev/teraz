# Production deployment

Production URL: https://ranjbar.dev. Repository: `ranjbar-dev/teraz`, branch `main`.

Push frontend, backend, dependency, migration, test, Docker, or workflow changes to
`main` to deploy automatically. Documentation-only changes are ignored. Pull
requests run checks and Docker smoke tests without deploying. The Actions page
also provides a manual **Run workflow** button. Saving a local file is not enough:
commit and push it to GitHub.

## Services and storage

`compose.yaml` runs Next.js, NestJS, and PostgreSQL 18. Caddy is installed from
the official Debian/Ubuntu package and runs as the host `caddy.service`, outside
Docker. A separate migration
image applies Prisma migrations and idempotently creates plans and the platform
owner. Host Caddy listens on 80 and 443 TCP and 443 UDP. Docker exposes the
frontend on `127.0.0.1:3000` and backend on `127.0.0.1:4000`; these ports are not
publicly bound. PostgreSQL has no published port. Caddy sends `/api/*` directly
to the local backend and other requests to the local frontend.
Cookies are secure and local laboratory features are disabled in production.
Only official Cloudflare proxy ranges are trusted for client IP headers, so API
rate limiting sees individual visitors rather than a shared Cloudflare address.
Review those ranges against https://www.cloudflare.com/ips/ when changing proxies.

Named volumes `taraz_postgres_data` and `taraz_uploads` survive updates and server
restarts. Host Caddy stores certificates and ACME accounts under
`/var/lib/caddy/.local/share/caddy`. The original `taraz_caddy_data` and
`taraz_caddy_config` volumes were retained as migration backups and are no longer
used by a container. Never use `down -v` on
production. The database URL password must be URL-safe; use random hex strings.

GitHub builds and smoke-tests images before transferring them over SSH. Builds
are cached in GitHub, keeping compilation off the small production server.
Deployment uses commit SHA image tags and serializes execution with a server lock.
The API pauses briefly during migrations and replacement; this is not a zero
downtime deployment. Deployments back up PostgreSQL and uploads before migrations.
They validate the host Caddyfile, back up its current configuration, install the
new configuration at `/etc/caddy/Caddyfile`, and gracefully reload `caddy.service`.
The service runs as the `caddy` user and is enabled at boot. CI smoke-tests an
actual host Caddy process against the loopback-published Docker services.
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
- `/etc/caddy/Caddyfile`: active host reverse-proxy configuration.
- `/var/lib/caddy/.local/share/caddy`: persistent certificates and ACME state.

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
docker compose --env-file /opt/taraz/.env logs --tail=100 backend frontend
systemctl status caddy
journalctl -u caddy --no-pager -n 100
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

To roll back application images, choose a retained previous release and use its
SHA as `IMAGE_TAG`. Review migration compatibility first, then run:

```bash
docker compose --env-file /opt/taraz/.env -f /opt/taraz/current/compose.yaml up -d --no-deps --wait backend frontend
```

Keep the current Compose file when restoring older images so the host-only port
bindings remain. Do not run historical Compose files that recreate Docker Caddy.
If proxy configuration also needs rollback, restore a validated dated Caddyfile
from `/opt/taraz/backups` and reload the service.

Do not automatically restore an old database over live data. Restore a dump to a
separate database with `pg_restore`, verify it, and plan a controlled cutover if
database recovery is needed. Upload backups must match the restored database.

For another Ubuntu/Debian host, copy `.env.example` to `.env`, replace every
placeholder, point DNS to the host, and run:

```bash
sudo bash deploy/install-host-caddy.sh
docker compose up -d --build --wait
sudo bash deploy/apply-host-caddy.sh deploy/Caddyfile ranjbar.dev
```

The installer suppresses package auto-start until the proxy is configured. For
future Caddy updates use the official apt repository (`apt-get update` and
`apt-get install --only-upgrade caddy`). Back up the host certificate directory
securely alongside the database and encryption key.
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
