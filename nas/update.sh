#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then echo '기존 프로젝트 폴더에 업데이트 파일을 넣으세요. .env를 찾을 수 없습니다.'; exit 1; fi
if command -v docker >/dev/null 2>&1; then task_docker=$(command -v docker); else task_docker=/usr/local/bin/docker; fi
"$task_docker" compose exec -T database python -c 'import sqlite3,datetime,pathlib; root=pathlib.Path("/data"); folder=root/"backups"; folder.mkdir(exist_ok=True); src=sqlite3.connect(root/"production.sqlite3"); dst=sqlite3.connect(folder/("before-auth-"+datetime.datetime.now().strftime("%Y%m%d-%H%M%S")+".sqlite3")); src.backup(dst); dst.close(); src.close(); print("업데이트 전 DB 백업 완료")'
"$task_docker" compose up -d --build
