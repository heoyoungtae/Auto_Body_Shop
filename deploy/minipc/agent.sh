#!/usr/bin/env bash
# 1분마다 돈다(remote.sh·install.sh 가 /etc/cron.d/auto-body-shop-agent 에 등록, root).
# 앱 설정 › 서버 화면에 이 PC 상태를 알리고, 대표가 '지금 새 버전 올리기'를 눌렀으면 받아서 update.sh 를 돌린다.
# 앱 쪽 주소: /api/server-agent (JOBS_TOKEN). 앱이 도커 안에서 서버를 직접 건드리지 않게 하려는 구조다.
set -uo pipefail
# 새 버전을 올리는 동안 update.sh 가 이 파일도 새것으로 바꾼다. bash 는 스크립트를 읽어 가며 돌리므로,
# 바뀐 파일의 엉뚱한 자리를 읽지 않게 전체를 main 함수로 감싸 처음에 다 읽어 둔다(2026-11-20 결과·이력이 늦게 뜨던 원인).
main() {
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$DEPLOY")"
cd "$DEPLOY"
set -a; . ./.env; set +a
exec 9>/run/auto-body-shop-agent.lock
flock -n 9 || return 0   # 앞 차례가 아직 새 버전을 올리는 중
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

# 1분마다: GitHub 에 새 버전이 생겼는지 맨 끝 번호만 본다(내려받기 없음, 1초 안). 생겼으면 아래 느린 확인을 바로 다시 한다.
# 서버가 몇 대든 GitHub 설정을 건드릴 필요가 없다(대표 2026-11-20 "서버가 많아지면?")
if [ -f "$STATE/slow" ]; then
  tip=$(timeout 20 sudo -u "$OWNER" git -C "$REPO" ls-remote origin "refs/heads/$(g rev-parse --abbrev-ref HEAD)" 2>/dev/null | cut -c1-7)
  [ -n "$tip" ] && [ "$tip" != "$(sed -n 's/^latest=//p' "$STATE/slow")" ] && rm -f "$STATE/slow"
fi

# 10분에 한 번만: GitHub 최신 버전·공인 IP(느린 일)
if [ ! -f "$STATE/slow" ] || [ -n "$(find "$STATE/slow" -mmin +9 2>/dev/null)" ]; then
  branch=$(g rev-parse --abbrev-ref HEAD)
  latest=""; behind=0
  if g fetch -q origin "$branch" 2>/dev/null; then
    latest=$(g rev-parse --short=7 FETCH_HEAD)
    behind=$(g rev-list --count HEAD..FETCH_HEAD 2>/dev/null || echo 0)
  fi
  pub=$(curl -4 -fsS -m 10 https://1.1.1.1/cdn-cgi/trace 2>/dev/null | sed -n 's/^ip=//p')
  # SSD 건강(남은 수명·온도·자체 진단). smartctl 이 없으면 한 번만 설치해 본다
  command -v smartctl >/dev/null || [ -f "$STATE/smart_tried" ] || { touch "$STATE/smart_tried"; DEBIAN_FRONTEND=noninteractive timeout 300 apt-get install -y -qq smartmontools >/dev/null 2>&1; }
  ssdlife=-1; ssdtemp=-1; ssdok=true
  dev=$(lsblk -rnso NAME,TYPE "$(findmnt -no SOURCE /)" 2>/dev/null | awk '$2=="disk"{print "/dev/"$1; exit}')
  if command -v smartctl >/dev/null && [ -n "$dev" ]; then
    smart=$(timeout 20 smartctl -j -H -A "$dev" 2>/dev/null)
    ssdlife=$(jq -r '(.nvme_smart_health_information_log.percentage_used // null) as $u | if $u == null then -1 else ([100 - $u, 0] | max) end' <<<"$smart" 2>/dev/null || echo -1)
    ssdtemp=$(jq -r '.temperature.current // -1' <<<"$smart" 2>/dev/null || echo -1)
    ssdok=$(jq -r 'if .smart_status.passed == false then false else true end' <<<"$smart" 2>/dev/null || echo true)
  fi
  printf 'latest=%s\nbehind=%s\npub=%s\nssdlife=%s\nssdtemp=%s\nssdok=%s\n' "$latest" "$behind" "$pub" "${ssdlife:--1}" "${ssdtemp:--1}" "${ssdok:-true}" > "$STATE/slow"
  # 아직 안 올라간 변경(병합 제목) 미리 보기
  if [ "${behind:-0}" -gt 0 ]; then changes HEAD FETCH_HEAD > "$STATE/pending.json"; else echo '[]' > "$STATE/pending.json"; fi
fi
latest=$(sed -n 's/^latest=//p' "$STATE/slow"); behind=$(sed -n 's/^behind=//p' "$STATE/slow"); pub=$(sed -n 's/^pub=//p' "$STATE/slow")
num() { [[ "$1" =~ ^-?[0-9]+$ ]] && echo "$1" || echo -1; }
ssdlife=$(num "$(sed -n 's/^ssdlife=//p' "$STATE/slow")"); ssdtemp=$(num "$(sed -n 's/^ssdtemp=//p' "$STATE/slow")")
ssdok=$(sed -n 's/^ssdok=//p' "$STATE/slow"); [ "$ssdok" = false ] || ssdok=true

# 서버 상태 숫자(대표 2026-11-20): CPU 사용률(1초 재기)·CPU 온도·메모리·디스크 %, 보안 업데이트 뒤 다시 켤 필요, 마지막으로 켠 때
cpu1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat); sleep 1
cpu2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6}' /proc/stat)
cpupct=$(awk -v a="$cpu1" -v b="$cpu2" 'BEGIN{split(a,x," ");split(b,y," ");t=y[1]-x[1];i=y[2]-x[2];print (t>0)?int((t-i)*100/t+0.5):-1}')
cputemp=$(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1); cputemp=$(num "$([ -n "$cputemp" ] && echo $((cputemp / 1000)))")
mempct=$(num "$(free | awk '/^Mem:/{printf "%d", ($2-$7)*100/$2}')")
diskpct=$(num "$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc 0-9)")
reboot=false; [ -f /var/run/reboot-required ] && reboot=true
bootat=$(uptime -s 2>/dev/null)

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
  --argjson cpuPct "$cpupct" --argjson cpuTemp "$cputemp" --argjson memPct "$mempct" --argjson diskPct "$diskpct" \
  --argjson ssdLife "$ssdlife" --argjson ssdTemp "$ssdtemp" --argjson ssdOk "$ssdok" --argjson rebootNeeded "$reboot" --arg bootAt "$bootat" \
  '{cpuPct:$cpuPct,cpuTemp:$cpuTemp,memPct:$memPct,diskPct:$diskPct,ssdLife:$ssdLife,ssdTemp:$ssdTemp,ssdOk:$ssdOk,rebootNeeded:$rebootNeeded,bootAt:$bootAt,host:$host,place:$place,mode:$mode,version:$version,latest:$latest,behind:$behind,lastUpdate:$lastUpdate,lastBackup:$lastBackup,disk:$disk,backupDisk:$backupDisk,memory:$memory,uptime:$uptime,lanIp:$lanIp,publicIp:$publicIp,services:$services,ups:$ups}')

status=$(jq -c --argjson p "$(cat "$STATE/pending.json" 2>/dev/null || echo '[]')" '. + {pending: $p}' <<<"$status")
post() { curl -fsS -m 30 -X POST -H "Authorization: Bearer $JOBS_TOKEN" -H 'Content-Type: application/json' -d "$1" "$URL" 2>/dev/null; }
events=$(history_events)
res=$(post "$(jq -nc --argjson s "$status" --argjson e "${events:-[]}" '{status:$s} + (if ($e | length) > 0 then {events:$e} else {} end)')") || res=""
if [ -n "$res" ]; then mv -f "$STATE/log_off.next" "$STATE/log_off" 2>/dev/null; mv -f "$STATE/last_version.next" "$STATE/last_version" 2>/dev/null; fi

# 자동 올리기 설정(앱 설정 › 서버의 켜기·시각, 대표 2026-11-20). 받은 값을 저장해 두고 앱이 안 열릴 때도 마지막 값으로 돈다.
auto=$(jq -c '.auto // empty' <<<"${res:-null}" 2>/dev/null)
if [ -n "$auto" ]; then
  echo "$auto" > "$STATE/auto.json"
  # 이제 앱 설정이 시각을 정하므로, 설치 때 넣은 고정 21:30 예약은 뺀다
  grep -q 'minipc/update\.sh' /etc/cron.d/auto-body-shop 2>/dev/null && sed -i '/minipc\/update\.sh/d' /etc/cron.d/auto-body-shop
fi
want=""
today=$(TZ=Asia/Seoul date +%F)
if [ -f "$STATE/auto.json" ] && [ "$(jq -r '.on' "$STATE/auto.json" 2>/dev/null)" = true ]; then
  t=$(jq -r '.time' "$STATE/auto.json"); n=$(TZ=Asia/Seoul date +%H:%M)
  if [[ "$t" =~ ^[0-2][0-9]:[0-5][0-9]$ ]]; then
    nm=$((10#${n%:*} * 60 + 10#${n#*:})); tm=$((10#${t%:*} * 60 + 10#${t#*:}))
    # 정한 시각부터 1시간 안에, 오늘 아직 안 했으면 한 번(앞 차례가 길어 그 분을 놓쳐도 이어서 한다)
    [ "$nm" -ge "$tm" ] && [ $((nm - tm)) -lt 60 ] && [ "$(cat "$STATE/auto_day" 2>/dev/null)" != "$today" ] && want=1
  fi
fi

if [ "$(jq -r '.update // false' <<<"${res:-null}" 2>/dev/null)" = true ]; then
  # 대표가 '지금 새 버전 올리기'를 눌렀다
  echo "$(TZ=Asia/Seoul date '+%F %R') 앱 설정에서 새 버전 올리기 요청" >> "$HOME/update.log"
  # 예약 자동 올리기(예전 고정 21:30 포함)가 돌고 있으면 끝날 때까지 기다린 뒤 한 번 더 확인한다(새 버전이 없으면 '이미 최신')
  for i in $(seq 1 180); do pgrep -f 'minipc/update\.sh' >/dev/null || break; sleep 10; done
  if bash "$DEPLOY/minipc/update.sh" >> "$HOME/update.log" 2>&1; then ok=true; else ok=false; fi
  msg=$(tail -n 1 "$HOME/update.log")
  result=$(jq -nc --argjson ok $ok --arg m "$msg" '{result:{ok:$ok,message:$m}}')
elif [ -n "$want" ]; then
  # 예약 자동 올리기(새 버전이 없으면 update.sh 가 '이미 최신'만 남긴다)
  echo "$today" > "$STATE/auto_day"
  bash "$DEPLOY/minipc/update.sh" >> "$HOME/update.log" 2>&1
  result='{}'
else
  return 0
fi
rm -f "$STATE/slow"   # 버전 정보를 바로 새로
# 결과와 이력을 한 번에 보낸다(화면이 결과를 받는 그때 이력도 바로 보이게)
events=$(history_events)
for i in 1 2 3 4 5 6; do
  if post "$(jq -nc --argjson r "$result" --argjson e "${events:-[]}" '$r + (if ($e | length) > 0 then {events:$e} else {} end)')" >/dev/null; then
    mv -f "$STATE/log_off.next" "$STATE/log_off" 2>/dev/null; mv -f "$STATE/last_version.next" "$STATE/last_version" 2>/dev/null
    break
  fi
  sleep 10
done
}
main "$@"; exit $?
