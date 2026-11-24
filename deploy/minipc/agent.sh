#!/usr/bin/env bash
# 1분마다 돈다(remote.sh·install.sh 가 /etc/cron.d/auto-body-shop-agent 에 등록, root). 그 사이 5초마다 올리기 요청을 묻는다.
# 앱 설정 › 서버 화면에 이 PC 상태를 알리고, 대표가 '지금 새 버전 올리기'를 눌렀으면 받아서 update.sh 를 돌린다.
# 앱 쪽 주소: /api/server-agent (JOBS_TOKEN). 앱이 도커 안에서 서버를 직접 건드리지 않게 하려는 구조다.
set -uo pipefail
# 새 버전을 올리는 동안 update.sh 가 이 파일도 새것으로 바꾼다. bash 는 스크립트를 읽어 가며 돌리므로,
# 바뀐 파일의 엉뚱한 자리를 읽지 않게 전체를 main 함수로 감싸 처음에 다 읽어 둔다(2026-11-20 결과·이력이 늦게 뜨던 원인).
main() {
# 우분투를 한국어로 설치하면 free·uptime 같은 명령이 '메모리:'처럼 한국어로 나와 값을 못 읽는다(2026-11-20 메모리 칸 빈 원인). 영어로 고정
export LC_ALL=C.UTF-8 LANG=C.UTF-8
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

# a..b 사이에 병합된 변경: [{pr, title, label}] (병합 커밋 본문 첫 줄 = PR 제목, label = 날짜 버전). 40개까지
changes() {
  local labels
  labels=$(sudo -u "$OWNER" env TZ=Asia/Seoul git -C "$REPO" log --first-parent --format='%H %cd' --date=format-local:%y.%m.%d -300 "$2" 2>/dev/null |
    tac | awk '{c[$2]++; print $1" "$2"-"c[$2]}' | jq -Rsc 'split("\n") | map(select(length > 0) | split(" ") | {(.[0]): .[1]}) | add // {}' 2>/dev/null)
  [ -n "$labels" ] || labels='{}'
  # 기본 브랜치에 들어온 병합만(--first-parent). 작업 가지 안의 병합·커밋 꼬리말(Co-Authored-By 등)은 변경 이름이 아니다
  # 병합 커밋(본문 첫 줄 = PR 제목)과 스쿼시 병합(커밋 제목 = PR 제목, 부모 1개) 둘 다 변경으로 읽는다(2026-11-24 PR #111 이력이 비던 일)
  g log --first-parent --format='%H%x1f%P%x1f%s%x1f%b%x1e' "$1..$2" 2>/dev/null | jq -Rsc --argjson lb "$labels" '
    split("\u001e") | map(sub("^\\s+"; "")) | map(select(length > 0) | split("\u001f")) |
    map(select((.[1] | contains(" ")) or ((.[2] // "") | test("#[0-9]+\\)?\\s*$")))) |
    map({pr: ((.[2] | capture("#(?<n>[0-9]+)") | .n | tonumber)? // null),
         title: (if (.[1] | contains(" ")) then (((.[3] // "") | split("\n") | map(select(length > 0 and (test("^(#|[A-Za-z][A-Za-z-]*-By:|Claude-Session:)"; "i") | not))) | .[0]) // .[2]) else (.[2] | sub("\\s*\\(#[0-9]+\\)\\s*$"; "")) end),
         label: ($lb[.[0]] // "")}) | .[:40]' 2>/dev/null || echo '[]'
}

# 날짜 버전(대표 2026-11-20): 26.11.20-7 = 2026-11-20(서울)에 병합된 7번째 변경. 기본 브랜치의 병합 순서로 매긴다
verlabel() {
  [ -n "${1:-}" ] || return 0
  local days d
  days=$(sudo -u "$OWNER" env TZ=Asia/Seoul git -C "$REPO" log --first-parent --format=%cd --date=format-local:%y.%m.%d -300 "$1" 2>/dev/null) || return 0
  d=$(head -n 1 <<<"$days"); [ -n "$d" ] || return 0
  echo "$d-$(grep -cx "$d" <<<"$days")"
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
      --arg fromLabel "$(verlabel "$from")" --arg toLabel "$(verlabel "$to")" \
      '. + [{at:$at,how:$how,ok:$ok,from:$from,to:$to,fromLabel:$fromLabel,toLabel:$toLabel,message:$msg,changes:$ch}]' <<<"$out")
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
  # 도메인(대표 2026-11-21): 앱 주소가 가리키는 IP 와 보안 접속 인증서가 끝나는 날(국내 직접 접속일 때)
  dnsip=""; certuntil=""
  if [ "${DIRECT:-}" = 1 ] && [ -n "${SITE_HOST:-}" ]; then
    dnsip=$(timeout 10 getent ahostsv4 "$SITE_HOST" 2>/dev/null | awk 'NR == 1 { print $1 }')
    certend=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$SITE_HOST" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p')
    [ -n "$certend" ] && certuntil=$(date -u -d "$certend" +%Y-%m-%dT%H:%MZ 2>/dev/null)
  fi
  # http:// 넘기기(대표 2026-11-22): 공유기 80번이 이 PC 로 열려 있으면 Caddy 가 https:// 로 넘긴다. 바깥 주소로 다시 들어와 확인
  http80=""
  if [ "${DIRECT:-}" = 1 ] && [ -n "${SITE_HOST:-}" ] && [ -n "$pub" ]; then
    loc=$(curl -s -o /dev/null -m 8 -w '%{redirect_url}' --resolve "$SITE_HOST:80:$pub" "http://$SITE_HOST/login" 2>/dev/null)
    case "$loc" in "https://$SITE_HOST"*) http80=ok;; *) http80=closed;; esac
  fi
  printf 'dnsip=%s\ncertuntil=%s\nhttp80=%s\n' "$dnsip" "$certuntil" "$http80" > "$STATE/slow.domain"
  latestlabel=""; [ -n "$latest" ] && latestlabel=$(verlabel FETCH_HEAD)
  printf 'latestlabel=%s\n' "$latestlabel" > "$STATE/slow.label"
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
# 메모리는 말(언어)에 상관없는 /proc/meminfo 에서 읽는다(kB)
memtotal=$(awk '/^MemTotal:/{print $2}' /proc/meminfo); memavail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
mempct=$(num "$([ -n "$memtotal" ] && [ "$memtotal" -gt 0 ] && echo $(( (memtotal - memavail) * 100 / memtotal )))")
memory=$(awk -v t="$memtotal" -v a="$memavail" 'BEGIN{if(t>0)printf "%.1fG 사용 / %.1fG", (t-a)/1048576, t/1048576}')
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

# 응답 속도·접속량·데이터 양(대표 2026-11-20)
# 1) 앱 응답: 이 PC 안에서 로그인 화면을 열어 걸린 시간(ms)
appms=$(curl -o /dev/null -s -m 10 -w '%{http_code} %{time_total}' "${APP_INTERNAL_URL:-http://127.0.0.1:3000}/login" 2>/dev/null | awk '$1 >= 200 && $1 < 500 { printf "%d", $2 * 1000; ok = 1 } END { if (!ok) print -1 }')
# 2) 데이터 양: 인터넷 쪽 네트워크 장치가 지난 알림 뒤 주고받은 바이트
rxb=-1; txb=-1; netsec=0
iface=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* dev \([^ ]*\).*/\1/p')
if [ -n "$iface" ] && [ -r "/sys/class/net/$iface/statistics/rx_bytes" ]; then
  rx=$(cat "/sys/class/net/$iface/statistics/rx_bytes"); tx=$(cat "/sys/class/net/$iface/statistics/tx_bytes"); nowt=$(date +%s)
  pt=""; prx=0; ptx=0
  [ -f "$STATE/net" ] && read -r pt prx ptx < "$STATE/net"
  if [[ "${pt:-}" =~ ^[0-9]+$ ]] && [ "$rx" -ge "${prx:-0}" ] && [ "$tx" -ge "${ptx:-0}" ] && [ $((nowt - pt)) -gt 0 ] && [ $((nowt - pt)) -le 600 ]; then
    rxb=$((rx - prx)); txb=$((tx - ptx)); netsec=$((nowt - pt))
  fi
  echo "$nowt $rx $tx" > "$STATE/net"
fi
# 3) 실제 접속(국내 직접 접속일 때): Caddy 접속 기록(/data/access.log)의 최근 1분. 그림·스크립트 파일은 속도 계산에서 뺀다
web='{"reqs":-1,"errors":-1,"avgMs":-1,"p95Ms":-1}'
hot='[]'   # 공격 대책(대표 2026-11-21): 1분에 요청이 많거나 취약점 찾기를 한 주소. 앱이 기준을 넘으면 막는다
if [ "$mode" = direct ]; then
  cid=$(docker compose ps -q caddy 2>/dev/null | head -n 1)
  src=""; [ -n "$cid" ] && src=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$cid" 2>/dev/null)
  if [ -n "$src" ] && [ -f "$src/access.log" ]; then
    w=$(tail -n 20000 "$src/access.log" | jq -nRc --argjson since $(( $(date +%s) - 60 )) '
      [inputs | fromjson? | select(type == "object" and (.ts // 0) >= $since)] as $a |
      ($a | map(select((.request.uri // "") | test("^/_next/|^/favicon|\\.(png|jpe?g|webp|gif|svg|ico|css|js|map|woff2?)(\\?|$)"; "i") | not) | (.duration // 0) * 1000) | sort) as $p |
      {reqs: ($a | length), errors: ($a | map(select((.status // 0) >= 500)) | length),
       avgMs: (if ($p | length) > 0 then (($p | add) / ($p | length) | round) else -1 end),
       p95Ms: (if ($p | length) > 0 then ($p[([($p | length) * 0.95 | floor, ($p | length) - 1] | min)] | round) else -1 end),
       hot: ($a | group_by(.request.client_ip // .request.remote_ip // "") | map({ip: (.[0].request.client_ip // .[0].request.remote_ip // ""),
         reqs: length, scan: (map(select((.request.uri // "") | test("wp-|\\.php|\\.env|/\\.git|phpmyadmin|/cgi-bin|/actuator|/vendor/|\\.aspx?(\\?|$)|/boaform|/HNAP|/\\.aws|/server-status"; "i"))) | length)})
         | map(select(.ip != "" and (.reqs >= 120 or .scan >= 5))) | sort_by(-.reqs) | .[:50])}' 2>/dev/null)
    if jq -e 'type == "object" and (.reqs | type) == "number"' <<<"$w" >/dev/null 2>&1; then
      hot=$(jq -c '.hot // []' <<<"$w"); web=$(jq -c 'del(.hot)' <<<"$w")
    fi
  fi
fi

status=$(jq -nc \
  --arg host "$(hostname)" --arg place "$place" --arg mode "$mode" \
  --arg version "$(g rev-parse --short=7 HEAD)" --arg versionLabel "$(verlabel HEAD)" --arg latest "$latest" --arg latestLabel "$(sed -n 's/^latestlabel=//p' "$STATE/slow.label" 2>/dev/null)" --argjson behind "${behind:-0}" \
  --arg lastUpdate "$(tail -n 1 "$HOME/update.log" 2>/dev/null)" --arg lastBackup "$(grep -v '^\s*$' "$HOME/backups.log" 2>/dev/null | tail -n 1)" \
  --arg disk "$(dfh /)" --arg backupDisk "$backup_disk" \
  --arg memory "$memory" --arg uptime "$(awk '{s=int($1); d=int(s/86400); h=int(s%86400/3600); m=int(s%3600/60); printf "%s%s%d분", (d?d"일 ":""), (d||h?h"시간 ":""), m}' /proc/uptime)" \
  --arg lanIp "$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')" --arg publicIp "$pub" \
  --arg services "$services" --arg ups "$ups" \
  --argjson cpuPct "$cpupct" --argjson cpuTemp "$cputemp" --argjson memPct "$mempct" --argjson diskPct "$diskpct" \
  --argjson ssdLife "$ssdlife" --argjson ssdTemp "$ssdtemp" --argjson ssdOk "$ssdok" --argjson rebootNeeded "$reboot" --arg bootAt "$bootat" \
  '{cpuPct:$cpuPct,cpuTemp:$cpuTemp,memPct:$memPct,diskPct:$diskPct,ssdLife:$ssdLife,ssdTemp:$ssdTemp,ssdOk:$ssdOk,rebootNeeded:$rebootNeeded,bootAt:$bootAt,host:$host,place:$place,mode:$mode,version:$version,versionLabel:$versionLabel,latest:$latest,latestLabel:$latestLabel,behind:$behind,lastUpdate:$lastUpdate,lastBackup:$lastBackup,disk:$disk,backupDisk:$backupDisk,memory:$memory,uptime:$uptime,lanIp:$lanIp,publicIp:$publicIp,services:$services,ups:$ups}')

status=$(jq -c --argjson p "$(cat "$STATE/pending.json" 2>/dev/null || echo '[]')" --argjson w "$web" \
  --argjson appMs "$(num "$appms")" --argjson rxBytes "$(num "$rxb")" --argjson txBytes "$(num "$txb")" --argjson netSec "$(num "$netsec")" \
  --arg siteHost "${SITE_HOST:-}" --arg dnsIp "$(sed -n 's/^dnsip=//p' "$STATE/slow.domain" 2>/dev/null)" --arg certUntil "$(sed -n 's/^certuntil=//p' "$STATE/slow.domain" 2>/dev/null)" \
  --arg http80 "$(sed -n 's/^http80=//p' "$STATE/slow.domain" 2>/dev/null)" \
  --argjson tunnelReady "$([ -n "${TUNNEL_TOKEN:-}" ] && echo true || echo false)" --argjson cfReady "$([ -n "${CF_API_TOKEN:-}" ] && echo true || echo false)" \
  '. + {pending: $p} + $w + {appMs: $appMs, rxBytes: $rxBytes, txBytes: $txBytes, netSec: $netSec, siteHost: $siteHost, dnsIp: $dnsIp, certUntil: $certUntil, http80: $http80, tunnelReady: $tunnelReady, cfReady: $cfReady}' <<<"$status")
post() { curl -fsS -m 30 -X POST -H "Authorization: Bearer $JOBS_TOKEN" -H 'Content-Type: application/json' -d "$1" "$URL" 2>/dev/null; }
events=$(history_events)
# 오류 줄 모으기(대표 2026-11-20 '오류 기록'): 지난번 뒤로 새로 생긴 줄 중 오류만 골라 50줄까지 보낸다.
# 앱 화면·저장 오류는 앱이 직접 남기므로, 앱 출력에서는 프로그램 자체 문제(멈춤·메모리·연결)만 고른다
until_s=$(date +%s)
since=$(cat "$STATE/err_since" 2>/dev/null); [[ "$since" =~ ^[0-9]+$ ]] || since=$((until_s - 120))
[ $((until_s - since)) -gt 3600 ] && since=$((until_s - 3600))
raw=$({
  for svc in app db caddy; do
    docker compose logs --no-color --no-log-prefix --timestamps --since "$since" --until "$until_s" "$svc" 2>/dev/null |
      awk -v svc="$svc" '{ t = $1; $1 = ""; m = substr($0, 2)
        if (svc == "app" && m ~ /(FATAL|[Uu]ncaught|[Uu]nhandled|out of memory|heap limit|ECONNREFUSED|EADDRINUSE)/) print "server\t" t "\t" m
        else if (svc == "db" && m ~ /(ERROR|FATAL|PANIC): /) print "db\t" t "\t" m
        else if (svc == "caddy" && m ~ /"level":"error"/) print "caddy\t" t "\t" m }'
  done
  journalctl -q --no-pager --since "@$since" --until "@$until_s" -o short-iso 2>/dev/null |
    grep -Ei 'out of memory|oom-kill|killed process|I/O error|EXT4-fs error|nvme.*(timeout|reset|error)|hardware error|critical temperature' |
    awk '{ t = $1; $1 = ""; print "system\t" t "\t" substr($0, 2) }' | sed -E 's/^(system\t[0-9T:-]+)([+-][0-9]{2})([0-9]{2})\t/\1\2:\3\t/'
} | head -n 50)
errs=$(printf '%s\n' "$raw" | jq -Rsc 'split("\n") | map(select(length > 0) | split("\t") | {kind: .[0], at: .[1], message: (.[2:] | join("\t"))}
  | if .kind == "db" then .message |= sub("^[0-9-]+ [0-9:.]+ [A-Z]+ \\[[0-9]+\\] "; "") else . end
  | if .kind == "caddy" then ((.message | fromjson?) // null) as $j | if $j then .message = ((($j.logger // "") + " " + ($j.msg // "") + (if $j.error then ": " + ($j.error | tostring) else "" end)) | ltrimstr(" ")) else . end else . end)' 2>/dev/null)
[ -n "$errs" ] || errs='[]'
# 앱 주소 자동 고치기(DDNS) 기록의 새 줄(대표 2026-11-21: 주소가 바뀌거나 고치기에 실패하면 알림). 처음에는 옛 기록을 건너뛴다
dlog="$HOME/ddns.log"; dsize=$(stat -c %s "$dlog" 2>/dev/null || echo 0)
doff=$(cat "$STATE/ddns_off" 2>/dev/null); [[ "$doff" =~ ^[0-9]+$ ]] || { doff=$dsize; echo "$dsize" > "$STATE/ddns_off"; }
[ "$dsize" -lt "$doff" ] && doff=0
ddns=$(tail -c +$((doff + 1)) "$dlog" 2>/dev/null | tail -n 50 | jq -Rsc 'split("\n") | map(select(length > 0) | {line: .})' 2>/dev/null); [ -n "$ddns" ] || ddns='[]'
res=$(post "$(jq -nc --argjson s "$status" --argjson e "${events:-[]}" --argjson x "$errs" --argjson h "${hot:-[]}" --argjson d "$ddns" '{status:$s} + (if ($e | length) > 0 then {events:$e} else {} end) + (if ($x | length) > 0 then {serverErrors:$x} else {} end) + (if ($h | length) > 0 then {hot:$h} else {} end) + (if ($d | length) > 0 then {ddns:$d} else {} end)')") || res=""
if [ -n "$res" ]; then mv -f "$STATE/log_off.next" "$STATE/log_off" 2>/dev/null; mv -f "$STATE/last_version.next" "$STATE/last_version" 2>/dev/null; echo "$until_s" > "$STATE/err_since"; echo "$dsize" > "$STATE/ddns_off"; fi

# 공격 대책(대표 2026-11-21): 앱이 막은 주소를 방화벽에서도 버린다(국내 직접 접속일 때). 앱과 연결될 때만 고친다(연결 안 되면 그대로 둠)
if [ -n "$res" ] && [ "${DIRECT:-}" = 1 ] && command -v iptables >/dev/null && iptables -n -L DOCKER-USER >/dev/null 2>&1; then
  blocked=$(jq -r '.blocked // [] | .[]' <<<"$res" 2>/dev/null | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$' | grep -vE '^(10|127|0)\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' | sort -u | head -n 500)
  fwh=$(printf '%s' "$blocked" | md5sum | cut -c1-32)
  if [ "$fwh" != "$(cat "$STATE/fw_hash" 2>/dev/null)" ] || ! iptables -C DOCKER-USER -j ABS-BLOCK 2>/dev/null; then
    iptables -N ABS-BLOCK 2>/dev/null; iptables -F ABS-BLOCK
    while read -r bip; do [ -n "$bip" ] && iptables -A ABS-BLOCK -s "$bip" -j DROP; done <<<"$blocked"
    iptables -C DOCKER-USER -j ABS-BLOCK 2>/dev/null || iptables -I DOCKER-USER 1 -j ABS-BLOCK
    echo "$fwh" > "$STATE/fw_hash"
  fi
fi
# 설정 › 도메인(대표 2026-11-21) ①: 대표가 앱에서 넣은 새 클라우드플레어 토큰을 확인해 .env 에 저장한다(틀리면 이전 토큰 그대로)
newtok=$(jq -r '.cfTokenNew // empty' <<<"${res:-null}" 2>/dev/null)
if [[ "$newtok" =~ ^[A-Za-z0-9_-]{30,200}$ ]]; then
  tok_ok=false
  vr=$(curl -fsS -m 30 -H "Authorization: Bearer $newtok" https://api.cloudflare.com/client/v4/user/tokens/verify 2>/dev/null)
  if [ "$(jq -r '.result.status // empty' <<<"$vr" 2>/dev/null)" = active ]; then
    if [ -z "${SITE_HOST:-}" ] || ( . ./minipc/cf.sh; CF_API_TOKEN="$newtok"; ZONE_ID=$(cf_zone_id); [ -n "$ZONE_ID" ] && cf GET "/zones/$ZONE_ID/dns_records?name=$SITE_HOST" >/dev/null 2>&1 ); then
      printf 'CF_API_TOKEN=%s\n' "$newtok" | bash ./set-env.sh >/dev/null 2>&1 && { tok_ok=true; tok_msg="확인하고 서버에 저장함"; CF_API_TOKEN=$newtok; }
    else tok_msg="토큰은 맞지만 ${SITE_HOST} 의 DNS 를 고칠 권한이 없습니다(Edit zone DNS, 이 도메인으로 다시 만드세요)"; fi
  else tok_msg="클라우드플레어가 이 토큰을 받지 않았습니다(틀렸거나 지워졌거나 만료됨)"; fi
  post "$(jq -nc --argjson ok "$tok_ok" --arg m "${tok_msg:-저장 실패}" --arg l "${newtok: -4}" '{cfTokenResult:{ok:$ok,message:$m,last4:$l}}')" >/dev/null
  rm -f "$STATE/domain_day"
fi
unset newtok
# ②: 하루 한 번 도메인 만료일(공개 등록 정보 RDAP)·네임서버·토큰 상태·앱 주소의 DNS 기록
if [ -n "${SITE_HOST:-}" ] && [ "$(cat "$STATE/domain_day" 2>/dev/null)" != "$(TZ=Asia/Seoul date +%F)" ]; then
  apex=$(awk -F. '{ n = NF; two = ($NF == "kr" && $(NF-1) ~ /^(co|or|go|ne|re|ac|pe)$/); if (two && n >= 3) print $(n-2) "." $(n-1) "." $n; else print $(n-1) "." $n }' <<<"$SITE_HOST")
  rdap=$(curl -fsS -m 20 https://data.iana.org/rdap/dns.json 2>/dev/null | jq -r --arg t "${apex##*.}" '.services[] | select(.[0] | index($t)) | .[1][0]' 2>/dev/null | head -n 1)
  dexp=""; [ -n "$rdap" ] && dexp=$(curl -fsS -m 20 -H 'Accept: application/rdap+json' "${rdap%/}/domain/$apex" 2>/dev/null | jq -r '[.events[]? | select(.eventAction == "expiration") | .eventDate][0] // empty' 2>/dev/null)
  dns_ns=$(curl -fsS -m 15 -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=$apex&type=NS" 2>/dev/null | jq -c '[.Answer[]? | select(.type == 2) | .data]' 2>/dev/null); [ -n "$dns_ns" ] || dns_ns='[]'
  dtok=null; drec=null
  if [ -n "${CF_API_TOKEN:-}" ]; then
    # 오류 응답(401 등)도 본문을 받는다. 인터넷이 안 되어 본문이 없을 때는 토큰을 '틀림'으로 보지 않는다
    vr=$(curl -sS -m 20 -H "Authorization: Bearer $CF_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify 2>/dev/null)
    if jq -e 'type == "object"' <<<"$vr" >/dev/null 2>&1; then
      dtok=$(jq -c --arg l "${CF_API_TOKEN: -4}" '(.result.status // "invalid") as $st | {ok: ($st == "active"), status: $st, expiresOn: (.result.expires_on // ""), last4: $l}' <<<"$vr")
    fi
    rec=$( ( . ./minipc/cf.sh; ZONE_ID=$(cf_zone_id); [ -n "$ZONE_ID" ] && cf_record ) 2>/dev/null)
    [ -n "$rec" ] && drec=$(jq -c '{type, content, proxied}' <<<"$rec" 2>/dev/null)
  fi
  dinfo=$(jq -nc --arg apex "$apex" --arg exp "$dexp" --argjson ns "$dns_ns" --argjson tok "${dtok:-null}" --argjson rec "${drec:-null}" '{apex: $apex, expiry: $exp, ns: $ns, token: $tok, record: $rec}')
  post "$(jq -nc --argjson d "$dinfo" '{domainInfo: $d}')" >/dev/null && TZ=Asia/Seoul date +%F > "$STATE/domain_day"
fi
# 외국 접속 막기용 국내 주소 목록: 앱이 달라고 하면(없거나 8일 지남) APNIC 공개 배정표에서 KR IPv4 만 뽑아 보낸다. 실패하면 1시간 뒤 다시
if [ "$(jq -r '.needKr // false' <<<"${res:-null}" 2>/dev/null)" = true ] && [ -z "$(find "$STATE/kr_tried" -mmin -60 2>/dev/null)" ]; then
  touch "$STATE/kr_tried"
  kr=$(curl -4 -fsS -m 120 https://ftp.apnic.net/stats/apnic/delegated-apnic-latest 2>/dev/null | awk -F'|' '$2 == "KR" && $3 == "ipv4" { print $4 " " $5 }' |
    jq -Rsc 'split("\n") | map(select(length > 0) | split(" ") | [.[0], (.[1] | tonumber)])' 2>/dev/null)
  [ "$(jq 'length' <<<"${kr:-[]}" 2>/dev/null || echo 0)" -gt 100 ] && post "$(jq -nc --argjson k "$kr" '{krRanges:$k}')" >/dev/null
fi
# 예전 이력에 날짜 버전을 채워 달라는 기록 번호가 있으면 계산해 보낸다
need=$(jq -r '.labelsFor // [] | .[]' <<<"${res:-null}" 2>/dev/null | grep -E '^[0-9a-f]{7,12}$' | head -50)
if [ -n "$need" ]; then
  labels='{}'
  while read -r sha; do labels=$(jq -c --arg k "$sha" --arg v "$(verlabel "$sha")" '. + {($k): $v}' <<<"$labels"); done <<<"$need"
  post "$(jq -nc --argjson l "$labels" '{labels:$l}')" >/dev/null
fi

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

# 올리기 요청은 1분을 기다리지 않게(대표 2026-11-20): 할 일이 없으면 이 차례가 끝나기 전(시작 50초까지) 5초마다 요청만 묻는다.
# 같은 PC 안에서 오가는 짧은 확인이고, 요청이 없으면 앱은 아무것도 저장하지 않는다. 다음 차례와 겹치지 않게 50초에서 멈춘다
while [ -z "$want" ] && [ "$(jq -r '.update // false' <<<"${res:-null}" 2>/dev/null)" != true ] && [ -z "$(jq -r '.modeTo // empty' <<<"${res:-null}" 2>/dev/null)" ] && [ "$SECONDS" -lt 50 ]; do
  sleep 5
  res=$(post '{"poll":true}') || res=""
done

# 접속 방식 바꾸기(대표 2026-11-22): 앱 설정 › 서버의 단추. direct.sh 를 묻지 않고(AUTO=1) 돌린다.
# 안 되면 direct.sh 가 스스로 원래 방식으로 되돌린다. 이 PC 안 주소(127.0.0.1)로 결과를 알리므로 바꾸는 중에도 알릴 수 있다
mode_to=$(jq -r '.modeTo // empty' <<<"${res:-null}" 2>/dev/null)
if [ "$mode_to" = direct ] || [ "$mode_to" = tunnel ]; then
  mlog="$HOME/mode.log"
  echo "$(TZ=Asia/Seoul date '+%F %R') 앱에서 접속 방식 바꾸기 요청: $mode_to" >> "$mlog"
  if [ "$mode_to" = direct ]; then AUTO=1 timeout 900 bash "$DEPLOY/minipc/direct.sh" < /dev/null >> "$mlog" 2>&1; rc=$?
  else AUTO=1 timeout 600 bash "$DEPLOY/minipc/direct.sh" off < /dev/null >> "$mlog" 2>&1; rc=$?; fi
  lines=$(tail -n 60 "$mlog" | sed 's/\x1b\[[0-9;]*m//g')
  if [ "$rc" = 0 ]; then mok=true; mmsg=$(grep '✔' <<<"$lines" | tail -n 1)
  else mok=false; mmsg=$(grep '✘' <<<"$lines" | tail -n 1); [ "$rc" = 124 ] && mmsg="시간이 너무 오래 걸려 멈췄습니다"; fi
  mmsg=$(sed 's/^ *[✔✘] *//' <<<"${mmsg:-끝남(코드 $rc)}")
  echo "$(TZ=Asia/Seoul date '+%F %R') 결과: $mok $mmsg" >> "$mlog"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    post "$(jq -nc --argjson ok $mok --arg to "$mode_to" --arg m "$mmsg" '{modeResult:{ok:$ok,to:$to,message:$m}}')" >/dev/null && break
    sleep 10
  done
  return 0
fi

if [ "$(jq -r '.update // false' <<<"${res:-null}" 2>/dev/null)" = true ]; then
  # 대표가 '지금 새 버전 올리기'를 눌렀다
  echo "$(TZ=Asia/Seoul date '+%F %R') 앱 설정에서 새 버전 올리기 요청" >> "$HOME/update.log"
  # 예약 자동 올리기(예전 고정 21:30 포함)가 돌고 있으면 끝날 때까지 기다린 뒤 한 번 더 확인한다(새 버전이 없으면 '이미 최신')
  for i in $(seq 1 180); do pgrep -f 'minipc/update\.sh' >/dev/null || break; sleep 10; done
  # 진행 바(대표 2026-11-20): update.sh 를 뒤에서 돌리고, 지금 도는 프로그램으로 단계를 알아내 앱에 알린다.
  # 0 새 버전 받기 · 1 올리기 전 백업 · 2 새 버전 만들기 · 3 바꿔 끼우기 · 4 열리는지 확인 · 5 정리
  bash "$DEPLOY/minipc/update.sh" >> "$HOME/update.log" 2>&1 &
  upid=$!
  stage=0; sent=-1; last=0
  while kill -0 "$upid" 2>/dev/null; do
    now_s=$(date +%s); d=-1
    if pgrep -f 'image prune|builder prune' >/dev/null; then d=5
    elif pgrep -P "$upid" -x sleep >/dev/null && [ "$stage" -ge 3 ]; then d=4
    elif pgrep -f 'compose (up|restart)' >/dev/null; then d=3
    elif pgrep -f 'compose build' >/dev/null; then d=2
    elif pgrep -x pg_dump >/dev/null || pgrep -f 'pg_dump' >/dev/null; then d=1
    fi
    [ "$d" -gt "$stage" ] && stage=$d
    if [ "$stage" != "$sent" ] || [ $((now_s - last)) -ge 20 ]; then
      post "$(jq -nc --argjson st "$stage" '{progress:{stage:$st}}')" >/dev/null && { sent=$stage; last=$now_s; }
    fi
    sleep 3
  done
  if wait "$upid"; then ok=true; else ok=false; fi
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
