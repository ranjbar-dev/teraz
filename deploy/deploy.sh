#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
release="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root=/opt/taraz
tag="${1:?Pass the image commit SHA}"
[[ "$tag" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full commit SHA'; exit 1; }
[[ "$release" == "$root/releases/$tag" ]] || { echo 'Unexpected release directory'; exit 1; }
test -s "$root/.env"
mkdir -p "$root/backups"
exec 9>"$root/deploy.lock"
flock -w 600 9
export IMAGE_TAG="$tag"
compose=(docker compose --env-file "$root/.env" -f "$release/compose.yaml")
"${compose[@]}" config --quiet
command -v caddy >/dev/null || { echo 'Run deploy/install-host-caddy.sh on the server first.'; exit 1; }
domain="$(sed -n 's/^DOMAIN=//p' "$root/.env" | tr -d '\r')"
domain="${domain:-ranjbar.dev}"
[[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'Invalid DOMAIN'; exit 1; }
DOMAIN="$domain" caddy validate --config "$release/deploy/Caddyfile" --adapter caddyfile
previous="$(readlink -f "$root/current" || true)"
docker load -i "$release/images.tar.gz"
rm -- "$release/images.tar.gz"
"${compose[@]}" pull db
"${compose[@]}" up -d --wait db

# Take a consistent database dump before migrations. Never delete data volumes.
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp /etc/caddy/Caddyfile "$root/backups/$stamp-Caddyfile"
"${compose[@]}" exec -T db pg_dump -U taraz -d taraz -Fc > "$root/backups/$stamp.dump"
test -s "$root/backups/$stamp.dump"
if docker volume inspect taraz_uploads >/dev/null 2>&1; then
  docker run --rm -v taraz_uploads:/source:ro -v "$root/backups:/backup" alpine:3.23 tar -czf "/backup/$stamp-uploads.tar.gz" -C /source .
fi

rollback() {
  status=$?
  trap - ERR
  echo "Deployment failed; showing service status (database is preserved)."
  "${compose[@]}" ps -a || true
  if [[ -n "$previous" && "$previous" != "$release" && -f "$previous/compose.yaml" ]]; then
    echo 'Restoring previous application images. Database migrations are not reversed.'
    # Keep the host networking even when restoring pre-migration app images.
    IMAGE_TAG="$(basename "$previous")" docker compose --env-file "$root/.env" -f "$release/compose.yaml" up -d --no-deps --wait backend frontend || true
  fi
  install -m 644 "$root/backups/$stamp-Caddyfile" /etc/caddy/Caddyfile
  systemctl reload caddy || true
  exit "$status"
}
trap rollback ERR
# Stop the old API while changing the schema, after builds and backups succeed.
"${compose[@]}" stop backend
"${compose[@]}" run --rm --no-deps migrate
# Migration has just completed above; prevent Compose from repeating it.
"${compose[@]}" up -d --no-deps --wait --wait-timeout 180 backend frontend
bash "$release/deploy/apply-host-caddy.sh" "$release/deploy/Caddyfile" "$domain"
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 10 "https://$domain/api/health" >/dev/null &&
     curl --fail --silent --show-error --max-time 10 "https://$domain/login" >/dev/null; then
    ln -sfn "$release" "$root/current"
    printf '%s\n' "$tag" > "$root/deployed-sha"
    echo "Deployed $tag successfully to https://$domain"
    # Keep this and the previous release's images; avoid filling a small server.
    previous_tag="$(basename "${previous:-none}")"
    while IFS= read -r image; do
      repository="${image%:*}"
      image_tag="${image##*:}"
      case "$repository" in taraz-frontend|taraz-backend|taraz-migrate) ;; *) continue ;; esac
      if [[ "$image_tag" =~ ^[a-f0-9]{40}$ && "$image_tag" != "$tag" && "$image_tag" != "$previous_tag" ]]; then
        docker image rm "$image" || true
      fi
    done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')
    # Only deployment-generated dated backups expire; keep the Nginx archive.
    find "$root/backups" -maxdepth 1 -type f \( -name '20??????T??????Z.dump' -o -name '20??????T??????Z-uploads.tar.gz' -o -name '20??????T??????Z-Caddyfile' \) -mtime +14 -delete
    exit 0
  fi
  sleep 5
done
echo 'Public HTTPS health checks failed.'
false
