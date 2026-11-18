#!/usr/bin/env bash
# 9단계: '국내 직접 접속' 켜기/끄기. 클라우드플레어 무료 요금제는 한국 접속을 미국(PDX·LAX 등)으로 돌려 메뉴마다 0.3~0.5초 늦다.
# 켜면: 공유기 443 → 이 PC, Caddy 가 HTTPS 인증서를 받고, 클라우드플레어 DNS 의 앱 주소를 정비소 공인 IP 로 바꾼다(회색 구름).
#       주소가 바뀌면 ddns.sh 가 5분마다 고친다. 안 되면 저절로 터널로 되돌린다.
# 사용(관리자 abs 계정 터미널):
#   bash ~/auto-body-shop/deploy/minipc/direct.sh        켜기
#   bash ~/auto-body-shop/deploy/minipc/direct.sh off    끄기(터널로 되돌리기)
set -uo pipefail
cd "$(dirname "$0")/.."
DEPLOY="$PWD"
set -a; . ./.env; set +a
say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
bad() { printf '\033[1;31m  ✘ %s\033[0m\n' "$*"; }
setenv() { printf '%s\n' "$@" | bash ./set-env.sh >/dev/null; set -a; . ./.env; set +a; }
[ "${SITE_HOST:-localhost}" != localhost ] || { echo "먼저 3단계(connect.sh)로 앱 주소를 넣으세요"; exit 1; }
command -v jq >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq jq >/dev/null
. ./minipc/cf.sh
BEFORE="$DEPLOY/.dns-before-direct.json"

back_to_tunnel() {
  say "터널로 되돌리기"
  ZONE_ID=$(cf_zone_id)
  rec=$(cf_record)
  [ -n "$rec" ] && cf DELETE "/zones/$ZONE_ID/dns_records/$(jq -r .id <<<"$rec")" >/dev/null
  if [ -f "$BEFORE" ]; then
    cf POST "/zones/$ZONE_ID/dns_records" "$(jq -c '{type,name,content,proxied,ttl}' "$BEFORE")" >/dev/null && ok "DNS 를 터널로 되돌림"
  else
    tid=$(cut -d. -f1 <<<"$TUNNEL_TOKEN" | base64 -d 2>/dev/null | jq -r '.t // empty' 2>/dev/null)
    [ -z "$tid" ] && tid=$(base64 -d <<<"$TUNNEL_TOKEN" 2>/dev/null | jq -r '.t // empty')
    cf POST "/zones/$ZONE_ID/dns_records" "$(jq -nc --arg n "$SITE_HOST" --arg c "$tid.cfargotunnel.com" '{type:"CNAME",name:$n,content:$c,proxied:true,ttl:1}')" >/dev/null && ok "DNS 를 터널로 되돌림"
  fi
  setenv DIRECT=0 TRUST_CF_IP=1 COMPOSE_PROFILES=off
  sudo docker compose stop caddy >/dev/null 2>&1 || true
  sudo docker compose rm -f caddy >/dev/null 2>&1 || true
  sudo docker compose up -d app tunnel >/dev/null
  sudo rm -f /etc/cron.d/auto-body-shop-ddns
  ok "터널로 돌아왔습니다. 1~2분 뒤 https://$SITE_HOST 를 열어 보세요."
}

if [ "${1:-}" = off ]; then
  [ -n "${CF_API_TOKEN:-}" ] || { echo "API 토큰이 없습니다"; exit 1; }
  back_to_tunnel; exit 0
fi

say "1/6 클라우드플레어 API 토큰"
if [ -z "${CF_API_TOKEN:-}" ]; then
  read -r -s -p "  설명서 9-2에서 만든 API 토큰을 붙여 넣고 Enter(화면에 안 보임): " t; echo
  CF_API_TOKEN="${t//[[:space:]]/}"
fi
cf GET /user/tokens/verify >/dev/null 2>&1 || { bad "토큰이 맞지 않습니다. 다시 만들어 붙여 넣으세요"; exit 1; }
ZONE_ID=$(cf_zone_id)
[ -n "$ZONE_ID" ] || { bad "토큰이 $SITE_HOST 의 영역을 볼 수 없습니다. 토큰을 만들 때 Zone Resources 에 도메인을 골랐는지 확인하세요"; exit 1; }
setenv "CF_API_TOKEN=$CF_API_TOKEN"
ok "토큰 확인"

say "2/6 이 PC 주소 확인"
pub=$(public_ip)
lan=$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
dev=$(ip -4 route get 1.1.1.1 | sed -n 's/.* dev \([^ ]*\).*/\1/p')
cidr=$(ip -4 -o addr show dev "$dev" | awk '{print $4}' | head -1)
net=$(python3 -c "import ipaddress,sys;print(ipaddress.ip_interface(sys.argv[1]).network)" "$cidr")
[ -n "$pub" ] && [ -n "$lan" ] || { bad "주소를 알아내지 못했습니다(인터넷 연결 확인)"; exit 1; }
case "$lan" in 10.*|172.1[6-9].*|172.2?.*|172.3[01].*|192.168.*) ;; *)
  bad "이 PC 가 공유기를 거치지 않고 인터넷에 바로 꽂혀 있습니다(주소 $lan). 랜선을 KT 기가 와이파이 공유기의 노란 LAN 포트로 옮기고 다시 실행하세요(설명서 9-1)."; exit 1;; esac
ok "정비소 공인 IP $pub, 이 PC 내부 주소 $lan (내부망 $net)"
# 이 PC 의 DNS 를 클라우드플레어·구글로 고정(공유기 DNS 가 멈춰도 인증서·주소 갱신이 되게). 내부 주소는 공유기 'DHCP 고정 할당'으로 고정한다(9-1)
con=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: -v d="$dev" '$2==d{print $1; exit}')
if [ -n "$con" ]; then
  sudo nmcli connection modify "$con" ipv4.dns "1.1.1.1 8.8.8.8" ipv4.ignore-auto-dns yes \
    && sudo nmcli connection up "$con" >/dev/null 2>&1 && ok "이 PC DNS 고정: 1.1.1.1, 8.8.8.8"
fi
case "$pub" in 10.*|100.6[4-9].*|100.[7-9]?.*|100.1[01]?.*|100.12[0-7].*|172.1[6-9].*|172.2?.*|172.3[01].*|192.168.*)
  bad "공인 IP 가 사설 주소입니다. 인터넷 회사 쪽에서 막혀 직접 접속을 쓸 수 없습니다(터널을 계속 쓰세요)"; exit 1;; esac
echo
echo "  공유기(KT 기가 와이파이)에서 아래처럼 포트 포워딩을 해 두었나요? (설명서 9-1)"
echo "     외부 포트 443 → 내부 IP $lan, 내부 포트 443, TCP"
read -r -p "  해 두었으면 yes: " a
[ "$a" = yes ] || { echo "  공유기 설정을 먼저 하고 다시 실행하세요."; exit 1; }

say "3/6 클라우드플레어 DNS 를 정비소 주소로 바꾸기"
rec=$(cf_record)
if [ -n "$rec" ] && [ "$(jq -r .type <<<"$rec")" != A ]; then printf '%s\n' "$rec" > "$BEFORE"; fi
[ -n "$rec" ] && cf DELETE "/zones/$ZONE_ID/dns_records/$(jq -r .id <<<"$rec")" >/dev/null
cf POST "/zones/$ZONE_ID/dns_records" "$(jq -nc --arg n "$SITE_HOST" --arg ip "$pub" '{type:"A",name:$n,content:$ip,proxied:false,ttl:60}')" >/dev/null \
  || { bad "DNS 바꾸기 실패"; back_to_tunnel; exit 1; }
ok "$SITE_HOST → $pub (회색 구름)"

say "4/6 HTTPS 문(Caddy) 켜기"
setenv DIRECT=1 TRUST_CF_IP=0 "SERVER_LAN_CIDR=$net" COMPOSE_PROFILES=direct
sudo docker compose up -d app caddy >/dev/null || { bad "Caddy 를 켜지 못했습니다"; back_to_tunnel; exit 1; }
ok "켜짐"

say "5/6 인증서 받기·확인(최대 3분)"
cert=0
for i in $(seq 1 36); do
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$SITE_HOST:443:127.0.0.1" "https://$SITE_HOST/login" || true)
  [ "$code" = 200 ] && { cert=1; break; }
  sleep 5
done
if [ "$cert" != 1 ]; then
  bad "인증서를 받지 못했습니다. 공유기 포트 포워딩(443 → $lan)이 안 되었거나 KT 회선이 443 을 막고 있습니다."
  sudo docker compose logs --tail 5 caddy
  back_to_tunnel; exit 1
fi
ok "인증서 받음(밖에서 443 으로 들어오는 길이 열려 있음)"
hair=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$SITE_HOST:443:$pub" "https://$SITE_HOST/login" || true)
if [ "$hair" = 200 ]; then ok "정비소 안(와이파이)에서도 같은 주소로 열림"; else
  bad "정비소 안에서 바깥 주소로 다시 들어오는 기능(NAT 루프백)이 공유기에서 막혀 있습니다. 와이파이에 연결한 휴대폰은 열리지 않습니다."
  read -r -p "  그래도 계속할까요? 아니면 터널로 되돌릴까요? (계속=yes, 되돌리기=Enter): " a
  [ "$a" = yes ] || { back_to_tunnel; exit 1; }
fi

say "6/6 주소 자동 갱신 등록"
sudo tee /etc/cron.d/auto-body-shop-ddns >/dev/null <<CRON
# 정비소 공인 IP 가 바뀌면 클라우드플레어 DNS 고치기(minipc/direct.sh 가 만듦)
*/5 * * * * root bash $DEPLOY/minipc/ddns.sh >> $HOME/ddns.log 2>&1
CRON
sudo chmod 644 /etc/cron.d/auto-body-shop-ddns
sudo docker compose stop tunnel >/dev/null 2>&1 || true
ok "등록함(기록 ~/ddns.log)"

cat <<DONE

==================================================================
 국내 직접 접속으로 바꿨습니다. 1~2분 뒤 휴대폰 '데이터'로
   https://$SITE_HOST/cdn-cgi/trace  는 이제 열리지 않고(정상),
   https://$SITE_HOST                는 빠르게 열려야 합니다.
 휴대폰 데이터로 열리나요?
DONE
read -r -p " 열리면 Enter, 안 열리면 no 를 치고 Enter(터널로 되돌림): " a
[ "$a" = no ] && { back_to_tunnel; exit 1; }
echo " 끝. 되돌리려면: bash ~/auto-body-shop/deploy/minipc/direct.sh off"
