#!/usr/bin/env bash
# Installs Docker and starts InkCalc on an Ubuntu Oracle Cloud VM.
# Run as: bash scripts/oracle-install-inkcalc.sh
# Before running, copy deploy/oracle/.env.example to deploy/oracle/.env and set the values.

set -Eeuo pipefail

REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/mohamednizam5/inkcalc.git}"
REPOSITORY_REF="${REPOSITORY_REF:-master}"
INSTALL_DIR="${INSTALL_DIR:-/opt/inkcalc}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash scripts/oracle-install-inkcalc.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-v2
systemctl enable --now docker

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  git clone --branch "${REPOSITORY_REF}" "${REPOSITORY_URL}" "${INSTALL_DIR}"
else
  git -C "${INSTALL_DIR}" fetch origin "${REPOSITORY_REF}"
  git -C "${INSTALL_DIR}" checkout "${REPOSITORY_REF}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${REPOSITORY_REF}"
fi

cd "${INSTALL_DIR}"

if [[ ! -f deploy/oracle/.env ]]; then
  cp deploy/oracle/.env.example deploy/oracle/.env
  echo
  echo "Created deploy/oracle/.env. Edit it with the production DATABASE_URL and JWT_SECRET, then rerun this script."
  exit 0
fi

if grep -q "REPLACE_WITH_A_RANDOM" deploy/oracle/.env || grep -q "INKCALC_USER:STRONG_PASSWORD" deploy/oracle/.env; then
  echo "deploy/oracle/.env still contains placeholder secrets. Set DATABASE_URL and JWT_SECRET, then rerun this script."
  exit 1
fi

# Restrict inbound network access to HTTP, HTTPS, and SSH.
# Do not enable UFW if the VM is accessed through a custom management path.
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml up --build --detach --remove-orphans
docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml ps

echo
printf 'InkCalc deployment started. Run this for diagnostics:\n  cd %s && docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml logs --tail=100\n' "${INSTALL_DIR}"
