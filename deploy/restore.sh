#!/usr/bin/env bash
# 백업 파일로 DB 를 되살린다(복구 훈련·장애 복구, 앱 설계서 9.5). 기존 DB 내용은 지워진다.
# 사용: bash deploy/restore.sh ~/backups/db-20261108-0300.sql.gz.enc
set -euo pipefail
cd "$(dirname "$0")"
file="${1:?백업 파일 경로가 필요함}"
set -a; . ./.env; set +a
read -r -p "현재 DB 를 지우고 $file 로 되살립니다. 계속하려면 yes: " answer
[ "$answer" = "yes" ] || exit 1
sudo docker compose stop app jobs
sudo docker compose exec -T db psql -U shop -d postgres -c "DROP DATABASE IF EXISTS shop WITH (FORCE);" -c "CREATE DATABASE shop OWNER shop;"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$file" | gunzip | sudo docker compose exec -T db psql -q -U shop -d shop
sudo docker compose start app jobs
echo "복구 완료"
