#!/usr/bin/env bash
# /usr/local/bin/lidar-auth-users
# Az admin CLI futtatása a service env fájljával, a service user nevében:
#   sudo -u admin /usr/local/bin/lidar-auth-users add --email ... --name ... --password-stdin
set -euo pipefail

ENV_FILE="${LIDAR_AUTH_ENV:-/etc/lidar-auth.env}"
SERVER_DIR="${LIDAR_AUTH_SERVER_DIR:-/home/admin/lidar-robot/lidar-robot/server}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read $ENV_FILE - run as the 'admin' user (the file is 0640 root:admin)." >&2
  exit 1
fi

if [[ ! -f "$SERVER_DIR/bin/users.js" ]]; then
  echo "Cannot find $SERVER_DIR/bin/users.js - set LIDAR_AUTH_SERVER_DIR." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec /usr/bin/node --disable-warning=ExperimentalWarning "$SERVER_DIR/bin/users.js" "$@"
