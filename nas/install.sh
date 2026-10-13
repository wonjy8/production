#!/bin/sh
# First installation only. Run with: sh install.sh --origin ... --admin-email ... --admin-name ...
set -eu
cd "$(dirname "$0")"
task_folder=$(pwd -P)
if [ -e .env ] || [ -L .env ]; then echo '.env가 이미 있습니다. 기존 설치에는 update.sh를 사용하세요.' >&2; exit 1; fi
if command -v docker >/dev/null 2>&1; then task_docker=$(command -v docker); else task_docker=/usr/local/bin/docker; fi
"$task_docker" compose version >/dev/null
# When run through sudo, use the invoking NAS user's numeric identity.
task_owner_uid=${SUDO_UID:-$(id -u)}
task_owner_gid=${SUDO_GID:-$(id -g)}
task_uid=$task_owner_uid
task_gid=$task_owner_gid
if [ "$task_uid" -eq 0 ]; then task_uid=10001; fi
if [ "$task_gid" -eq 0 ]; then task_gid=10001; fi
"$task_docker" run --rm --network none --user 0:0 \
  --mount "type=bind,src=$task_folder,dst=/setup" --workdir /setup \
  python:3.12-slim python configure.py --uid "$task_uid" --gid "$task_gid" \
  --owner-uid "$task_owner_uid" --owner-gid "$task_owner_gid" "$@"
"$task_docker" compose config --quiet
"$task_docker" compose up -d --build --wait --wait-timeout 180
echo 'NAS 서버를 시작했습니다. README의 HTTPS 역방향 프록시와 첫 관리자 가입 절차를 진행하세요.'
