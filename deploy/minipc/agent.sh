#!/usr/bin/env bash
# 1분마다 돈다(remote.sh·install.sh 가 /etc/cron.d/auto-body-shop-agent 에 등록, root).
# 앱 설정 › 서버 화면에 이 PC 상태를 알리고, 대표가 '지금 새 버전 올리기'를 눌렀으면 받아서 update.sh 를 돌린다.
# 앱 쪽 주소: /api/server-agent (JOBS_TOKEN). 앱이 도커 안에서 서버를 직접 건드리지 않게 하려는 구조다.
set -uo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$DEPLOY")"
cd "$DEPLOY"
set -a; . ./.env; set +a
exec 9>/run/auto-body-shop-agent.lock
flock -n 9 || exit 0   # 앞 차례가 아직 새 버전을 올리는 중
OWNER="$(stat -c %U "$REPO")"
g() { sudo -u "$OWNER" git -C "$REPO" "$@"; }
URL="${APP_INTERNAL_URL:-http://127.0.0.1:3000}/api/server-agent"
STATE="$HOME/.server-agent"
mkdir -p "$STATE"

# 10분에 한 번만: GitHub 최신 버전·공인 IP(느린 일)
if [ ! -f "$STATE/slow" ] || [ -n "$(find "$STATE/slow" -mmin +9 2>/dev/null)" ]; then
  branch=$(g rev-parse --abbrev-ref HEAD)
  latest=""; behind=0
  if g fetch -q origin "$branch" 2>/dev/null; then
    latest=$(g rev-parse --short=7 FETCH_HEAD)
    behind=$(g rev-list --count HEAD..FETCH_HEAD 2>/dev/null || echo 0)
  fi
  pub=$(curl -4 -fsS -m 10 https://1.1.1.1/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p')
  printf 'latest=%s\nbehind=%s\npub=%s\n' "$latest" "$behind" "$pub" > "$STATE/slow"
fi
latest=$(sed -n 's/^latest=//p' "$STATE/slow"); behind=$(sed -n 's/^behind=//p' "$STATE/slow"); pub=$(sed -n 's/^pub=//p' "$STATE/slow")

dfh() { df -h --output=avail,size,pcent "$1" 2>/dev/null | tail -1 | awk '{print $1" 남음 / "$2" (사용 "$3")"}'; }
backup_disk=""
if [ -n "${BACKUP_COPY_DIR:-}" ] && mountpoint -q "$(dirname "$BACKUP_COPY_DIR")" 2>/dev/null; then backup_disk=$(dfh "$BACKUP_COPY_DIR"); fi
ups=""
command -v apcaccess >/dev/null && ups=$(apcaccess -u 2>/dev/null | awk -F': ' '/^STATUS/{s=$2}/^BCHARGE/{c=$2}END{if(s!="")printf "%s, 배터리 %s%%", s, c}' | sed 's/  */ /g')
services=$(docker compose ps --format json 2>/dev/null | jq -rs 'flatten | map(.Service + " " + .State + (if (.Health // "") != "" then "(" + .Health + ")" else "" end)) | join(", ")' 2>/dev/null)
place=home; [ "${SERVER_ON_SITE:-}" = 1 ] && place=shop
mode=tunnel; [ "${DIRECT:-}" = 1 ] && mode=direct

status=$(jq -nc \
  --arg host "$(hostname)" --arg place "$place" --arg mode "$mode" \
  --arg version "$(g rev-parse --short=7 HEAD)" --arg latest "$latest" --argjson behind "${behind:-0}" \
  --arg lastUpdate "$(tail -n 1 "$HOME/update.log" 2>/dev/null)" --arg lastBackup "$(grep -v '^\s*$' "$HOME/backups.log" 2>/dev/null | tail -n 1)" \
  --arg disk "$(dfh /)" --arg backupDisk "$backup_disk" \
  --arg memory "$(free -h | awk '/^Mem:/{print $3" 사용 / "$2}')" --arg uptime "$(uptime -p | sed 's/^up //')" \
  --arg lanIp "$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')" --arg publicIp "$pub" \
  --arg services "$services" --arg ups "$ups" \
  '{host:$host,place:$place,mode:$mode,version:$version,latest:$latest,behind:$behind,lastUpdate:$lastUpdate,lastBackup:$lastBackup,disk:$disk,backupDisk:$backupDisk,memory:$memory,uptime:$uptime,lanIp:$lanIp,publicIp:$publicIp,services:$services,ups:$ups}')

post() { curl -fsS -m 30 -X POST -H "Authorization: Bearer $JOBS_TOKEN" -H 'Content-Type: application/json' -d "$1" "$URL" 2>/dev/null; }
res=$(post "{\"status\":$status}") || exit 0
[ "$(jq -r '.update // false' <<<"$res" 2>/dev/null)" = true ] || exit 0

# 대표가 '지금 새 버전 올리기'를 눌렀다
echo "$(TZ=Asia/Seoul date '+%F %R') 앱 설정에서 새 버전 올리기 요청" >> "$HOME/update.log"
# 밤 21:30 자동 올리기가 돌고 있으면 끝날 때까지 기다린 뒤 한 번 더 확인한다(새 버전이 없으면 '이미 최신')
for i in $(seq 1 180); do pgrep -f 'minipc/update\.sh' >/dev/null || break; sleep 10; done
if bash "$DEPLOY/minipc/update.sh" >> "$HOME/update.log" 2>&1; then ok=true; else ok=false; fi
msg=$(tail -n 1 "$HOME/update.log")
rm -f "$STATE/slow"   # 버전 정보를 바로 새로
for i in 1 2 3 4 5 6; do
  post "$(jq -nc --argjson ok $ok --arg m "$msg" '{result:{ok:$ok,message:$m}}')" >/dev/null && break
  sleep 10
done
