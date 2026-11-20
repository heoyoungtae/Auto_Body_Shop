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

# a..b 사이에 병합된 변경: [{pr, title}] (병합 커밋 본문 첫 줄 = PR 제목). 40개까지
changes() {
  g log --merges --format='%s%x1f%b%x1e' "$1..$2" 2>/dev/null | jq -Rsc '
    split("\u001e") | map(sub("^\\s+"; "")) | map(select(length > 0) | split("\u001f")) |
    map({pr: ((.[0] | capture("#(?<n>[0-9]+)") | .n | tonumber)? // null),
         title: (((.[1] // "") | split("\n") | map(select(length > 0)) | .[0]) // .[0])}) | .[:40]' 2>/dev/null || echo '[]'
}

# 업데이트 이력: update.log 의 새 줄에서 올림·실패를 찾고, 터미널에서 올린 것(기록 없이 버전이 바뀜)도 잡는다.
# 처음 한 번은 update.log 전체를 읽어 그동안의 이력도 보낸다. 앱에 잘 보낸 뒤에만 읽은 자리를 옮긴다.
history_events() {
  local log="$HOME/update.log" off=0 size now_v last_v
  [ -f "$STATE/log_off" ] && off=$(cat "$STATE/log_off")
  size=$(stat -c %s "$log" 2>/dev/null || echo 0)
  [ "$size" -lt "$off" ] && off=0
  now_v=$(g rev-parse --short=7 HEAD)
  last_v=$(cat "$STATE/last_version" 2>/dev/null || echo "")
  local tsv
  tsv=$(tail -c +$((off + 1)) "$log" 2>/dev/null | awk '
    /앱 설정에서 새 버전 올리기 요청/ { btn = 1; next }
    /^[0-9-]+ [0-9:]+ 새 버전 올림 / { split($0, a, " "); print $1" "$2 "\037" (btn ? "button" : "nightly") "\037ok\037" a[6] "\037" a[8] "\037"; btn = 0; next }
    /^[0-9-]+ [0-9:]+ .*(실패|열리지 않음|건너뜀)/ { m = $0; sub(/^[0-9-]+ [0-9:]+ /, "", m); print $1" "$2 "\037" (btn ? "button" : "nightly") "\037fail\037\037\037" m; btn = 0; next }
    /^[0-9-]+ [0-9:]+ 이미 최신/ { btn = 0 }')
  local out="[]" at how kind from to msg ch
  while IFS=$'\037' read -r at how kind from to msg; do
    [ -z "$at" ] && continue
    ch='[]'; [ "$kind" = ok ] && [ -n "$from" ] && ch=$(changes "$from" "$to")
    out=$(jq -c --arg at "$at" --arg how "$how" --argjson ok "$([ "$kind" = ok ] && echo true || echo false)" --arg from "$from" --arg to "$to" --arg msg "$msg" --argjson ch "${ch:-[]}" \
      '. + [{at:$at,how:$how,ok:$ok,from:$from,to:$to,message:$msg,changes:$ch}]' <<<"$out")
  done <<<"$tsv"
  # 기록 없이 버전이 바뀜 = 미니 PC 터미널에서 올림
  if [ -n "$last_v" ] && [ "$last_v" != "$now_v" ] && ! jq -e --arg v "$now_v" 'any(.[]; .to == $v)' <<<"$out" >/dev/null; then
    out=$(jq -c --arg at "$(TZ=Asia/Seoul date '+%F %R')" --arg from "$last_v" --arg to "$now_v" --argjson ch "$(changes "$last_v" "$now_v")" \
      '. + [{at:$at,how:"terminal",ok:true,from:$from,to:$to,message:"",changes:$ch}]' <<<"$out")
  fi
  echo "$out"
  echo "$size" > "$STATE/log_off.next"
  echo "$now_v" > "$STATE/last_version.next"
}

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
  # 아직 안 올라간 변경(병합 제목) 미리 보기
  if [ "${behind:-0}" -gt 0 ]; then changes HEAD FETCH_HEAD > "$STATE/pending.json"; else echo '[]' > "$STATE/pending.json"; fi
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

status=$(jq -c --argjson p "$(cat "$STATE/pending.json" 2>/dev/null || echo '[]')" '. + {pending: $p}' <<<"$status")
post() { curl -fsS -m 30 -X POST -H "Authorization: Bearer $JOBS_TOKEN" -H 'Content-Type: application/json' -d "$1" "$URL" 2>/dev/null; }
events=$(history_events)
res=$(post "$(jq -nc --argjson s "$status" --argjson e "${events:-[]}" '{status:$s} + (if ($e | length) > 0 then {events:$e} else {} end)')") || exit 0
mv -f "$STATE/log_off.next" "$STATE/log_off" 2>/dev/null; mv -f "$STATE/last_version.next" "$STATE/last_version" 2>/dev/null
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
