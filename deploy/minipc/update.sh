#!/usr/bin/env bash
# 미니 PC 앱을 새 버전으로 올린다. 매일 21:30 저절로 돈다(install.sh 가 /etc/cron.d 에 등록).
# 새 버전이 없으면 아무것도 하지 않는다. 지금 바로 올리려면 미니 PC 터미널에서:
#   sudo bash ~/auto-body-shop/deploy/minipc/update.sh
# 순서: 새 코드 확인 → 올리기 전 DB 백업 → 앱 새로 만들기(그동안 기존 앱은 계속 돎) → 바꿔 끼우기(몇 초) → 열리는지 확인
set -uo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$DEPLOY")"
OWNER="$(stat -c %U "$REPO")"
g() { sudo -u "$OWNER" git -C "$REPO" "$@"; }
log() { echo "$(TZ=Asia/Seoul date '+%F %R') $*"; }
[ "$(id -u)" -eq 0 ] || { echo "sudo 를 붙여 실행하세요: sudo bash $0"; exit 1; }
cd "$DEPLOY"
set -a; . ./.env; set +a

branch=$(g rev-parse --abbrev-ref HEAD)
g fetch -q origin "$branch" || { log "새 버전 확인 실패(인터넷 연결 확인)"; exit 1; }
cur=$(g rev-parse HEAD)
new=$(g rev-parse FETCH_HEAD)
if [ "$cur" = "$new" ] && docker image inspect auto-body-shop-app:latest >/dev/null 2>&1 && [ "${1:-}" != "force" ]; then
  log "이미 최신 ${cur:0:7}"
  exit 0
fi

# 올리기 전 DB 백업(새 버전이 DB 모양을 바꾸므로)
dir="$HOME/backups"; mkdir -p "$dir"; chmod 700 "$dir"
stamp=$(TZ=Asia/Seoul date +%Y%m%d-%H%M)
if docker compose ps --status running --services | grep -qx db; then
  if ! docker compose exec -T db pg_dump -U shop -d shop --no-owner | gzip | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE > "$dir/db-before-update-$stamp.sql.gz.enc" || [ ! -s "$dir/db-before-update-$stamp.sql.gz.enc" ]; then
    log "올리기 전 백업 실패: 새 버전을 올리지 않음"
    exit 1
  fi
fi

g reset -q --hard "$new"
if ! docker compose build -q app; then
  log "새 버전 만들기 실패: 이전 버전(${cur:0:7})을 그대로 씀"
  g reset -q --hard "$cur"
  exit 1
fi
docker compose up -d --remove-orphans db app jobs
if [ "${DIRECT:-}" = 1 ]; then docker compose up -d caddy; elif grep -q '^TUNNEL_TOKEN=.\+' .env; then docker compose up -d tunnel; fi
# jobs.sh 는 시작할 때 한 번 읽히므로 다시 띄운다
docker compose restart jobs >/dev/null
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)
  [ "$code" = 200 ] && break
  sleep 5
done
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
find "$dir" -name 'db-before-update-*.enc' -mtime +30 -delete
if [ "$code" = 200 ]; then
  log "새 버전 올림 ${cur:0:7} → ${new:0:7}"
else
  log "새 버전 ${new:0:7} 을 올렸지만 앱이 열리지 않음(docker compose logs app 확인). 되돌릴 백업: $dir/db-before-update-$stamp.sql.gz.enc"
  exit 1
fi
