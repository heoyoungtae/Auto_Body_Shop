#!/usr/bin/env bash
# '국내 직접 접속'일 때 5분마다 돈다(direct.sh on 이 /etc/cron.d 에 등록). 인터넷 회사가 정비소 주소(공인 IP)를 바꾸면
# 클라우드플레어 DNS 의 앱 주소를 새 주소로 고친다. 고정 IP 가 없어도 주소가 따라간다.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
[ "${DIRECT:-}" = 1 ] || exit 0
. ./minipc/cf.sh
log() { echo "$(TZ=Asia/Seoul date '+%F %R') $*"; }
ip=$(public_ip) || { log "공인 IP 확인 실패(인터넷?)"; exit 1; }
[ -n "$ip" ] || exit 1
ZONE_ID=$(cf_zone_id) || { log "클라우드플레어 연결 실패"; exit 1; }
rec=$(cf_record)
[ -n "$rec" ] || { log "DNS 기록 없음: $SITE_HOST"; exit 1; }
cur=$(jq -r .content <<<"$rec"); type=$(jq -r .type <<<"$rec")
[ "$type" = A ] && [ "$cur" = "$ip" ] && exit 0
[ "$type" = A ] || { log "DNS 기록이 A 가 아님($type): 직접 접속이 꺼진 것으로 보고 손대지 않음"; exit 0; }
id=$(jq -r .id <<<"$rec")
cf PATCH "/zones/$ZONE_ID/dns_records/$id" "$(jq -nc --arg ip "$ip" '{content:$ip}')" >/dev/null \
  && log "정비소 주소 바뀜: $cur → $ip (DNS 고침)" || log "DNS 고치기 실패"
