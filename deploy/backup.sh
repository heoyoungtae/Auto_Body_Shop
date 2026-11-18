#!/usr/bin/env bash
# 매일 03:00 서버 cron 이 돌린다(server-setup.sh 가 등록). 앱 설계서 3.7·9.5.
# 1) DB 전체(pg_dump)를 암호화해 ~/backups 에 둔다(최근 14일). 사진·PDF 폴더 묶음(암호화)은 최근 3개만 둔다(사진이 쌓여도 디스크를 채우지 않게).
# 2) BACKUP_PAR_URL(Oracle Object Storage 사전 인증 요청 주소, 끝이 /o/)이 있으면 DB 는 매일, 사진 묶음은 일요일에만 올린다(무료 20GB 안에서).
# 3) BACKUP_COPY_DIR(미니 PC 의 백업 디스크)이 있으면 DB 는 그곳에 60일치, 사진은 files/ 에 바뀐 것만 더한다(지운 사진도 남김).
# 4) 결과를 앱에 알린다. 실패하면 대표에게 알림이 간다.
set -uo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
dir="$HOME/backups"; mkdir -p "$dir"; chmod 700 "$dir"
stamp=$(TZ=Asia/Seoul date +%Y%m%d-%H%M)
ok=1; msg=""

enc() { openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE; }

if sudo docker compose exec -T db pg_dump -U shop -d shop --no-owner | gzip | enc > "$dir/db-$stamp.sql.gz.enc" && [ -s "$dir/db-$stamp.sql.gz.enc" ]; then
  msg="DB $(du -h "$dir/db-$stamp.sql.gz.enc" | cut -f1)"
else
  ok=0; msg="DB 백업 실패"
fi
vol=$(sudo docker volume ls -q | grep -E '_files$' | head -1)
if [ -n "$vol" ]; then
  if sudo tar -C "$(sudo docker volume inspect -f '{{.Mountpoint}}' "$vol")" -czf - . | enc > "$dir/files-$stamp.tar.gz.enc"; then
    msg="$msg, 파일 $(du -h "$dir/files-$stamp.tar.gz.enc" | cut -f1)"
  else
    ok=0; msg="$msg, 파일 백업 실패"
  fi
fi

if [ "$ok" = 1 ] && [ -n "${BACKUP_PAR_URL:-}" ]; then
  up=("$dir/db-$stamp.sql.gz.enc")
  [ "$(TZ=Asia/Seoul date +%u)" = 7 ] && up+=("$dir/files-$stamp.tar.gz.enc")
  for f in "${up[@]}"; do
    [ -f "$f" ] || continue
    curl -fsS -T "$f" "${BACKUP_PAR_URL}$(basename "$f")" -o /dev/null || { ok=0; msg="$msg, Object Storage 업로드 실패"; }
  done
  [ "$ok" = 1 ] && msg="$msg, Object Storage 업로드"
fi

if [ "$ok" = 1 ] && [ -n "${BACKUP_COPY_DIR:-}" ]; then
  if [ -d "$BACKUP_COPY_DIR" ] && [ -w "$BACKUP_COPY_DIR" ]; then
    if cp "$dir/db-$stamp.sql.gz.enc" "$BACKUP_COPY_DIR"/ \
      && { [ -z "$vol" ] || sudo rsync -a "$(sudo docker volume inspect -f '{{.Mountpoint}}' "$vol")/" "$BACKUP_COPY_DIR/files/"; }; then
      msg="$msg, 백업 디스크 복사(남은 공간 $(df -h --output=avail "$BACKUP_COPY_DIR" | tail -1 | tr -d ' '))"
    else
      ok=0; msg="$msg, 백업 디스크 복사 실패"
    fi
    find "$BACKUP_COPY_DIR" -maxdepth 1 -name '*.enc' -mtime +60 -delete
  else
    ok=0; msg="$msg, 백업 디스크 없음($BACKUP_COPY_DIR)"
  fi
fi

find "$dir" -name 'db-*.enc' -mtime +14 -delete
ls -1t "$dir"/files-*.tar.gz.enc 2>/dev/null | tail -n +4 | xargs -r rm -f
echo "$(date '+%F %R') ok=$ok $msg"
body=$(printf '{"ok":%s,"message":"%s"}' "$([ "$ok" = 1 ] && echo true || echo false)" "$msg")
curl -fsS -m 30 -X POST -H "Authorization: Bearer $JOBS_TOKEN" -H 'Content-Type: application/json' -d "$body" "${APP_INTERNAL_URL:-https://$SITE_HOST}/api/backup-report" -o /dev/null || true
[ "$ok" = 1 ]
