#!/usr/bin/env bash
# Install the official Ubuntu/Debian package without taking over ports yet.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.'; exit 1; }
if command -v caddy >/dev/null; then
  caddy version
  exit 0
fi
systemctl mask --runtime caddy.service
trap 'systemctl unmask --runtime caddy.service' EXIT
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /tmp/taraz-caddy-signing-key.asc
gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/taraz-caddy-signing-key.asc
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
rm /tmp/taraz-caddy-signing-key.asc
caddy version
echo 'Package installed. Configure /etc/caddy/Caddyfile before starting the service.'
