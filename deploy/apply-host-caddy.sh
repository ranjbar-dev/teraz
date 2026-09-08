#!/usr/bin/env bash
set -Eeuo pipefail
source_config="${1:?Pass the source Caddyfile}"
domain="${2:-ranjbar.dev}"
[[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || { echo 'Invalid domain'; exit 1; }
command -v caddy >/dev/null || { echo 'Install host Caddy first.'; exit 1; }
candidate="$(mktemp /etc/caddy/Caddyfile.XXXXXX)"
trap 'rm -f "$candidate"' EXIT
sed "s/{\$DOMAIN:ranjbar.dev}/$domain/g" "$source_config" > "$candidate"
chmod 644 "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
install -o root -g root -m 644 "$candidate" /etc/caddy/Caddyfile
systemctl enable caddy
if systemctl is-active --quiet caddy; then
  systemctl reload caddy
else
  systemctl start caddy
fi
systemctl is-active --quiet caddy
