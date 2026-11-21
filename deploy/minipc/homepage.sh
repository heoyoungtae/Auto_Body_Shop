#!/usr/bin/env bash
# 11단계: 홈페이지 주소(jmotors.co.kr, www.jmotors.co.kr) 연결. 9단계 '국내 직접 접속'을 켠 뒤 한 번 한다.
# 하는 일: 클라우드플레어 DNS 에 홈페이지 주소를 이 PC 공인 IP 로 넣고(회색 구름, 앱 주소와 같은 방식),
#          Caddy 가 그 주소의 HTTPS 인증서를 받게 하고, 앱이 그 주소를 홈페이지로 알아보게 한다(.env HOMEPAGE_HOST).
#          주소가 바뀌면 ddns.sh 가 앱 주소와 함께 5분마다 고친다.
# 사용(관리자 abs 계정 터미널):
#   bash ~/auto-body-shop/deploy/minipc/homepage.sh                 jmotors.co.kr + www 연결(앱 주소에서 짐작)
#   bash ~/auto-body-shop/deploy/minipc/homepage.sh 다른도메인.kr   다른 주소로
#   bash ~/auto-body-shop/deploy/minipc/homepage.sh off             홈페이지 주소 끊기(DNS 기록은 남김)
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
bad() { printf '\033[1;31m  ✘ %s\033[0m\n' "$*"; }
SITES=./caddy-sites/homepage.caddy

if [ "${1:-}" = off ]; then
  rm -f "$SITES"
  grep -vE '^HOMEPAGE_HOST=' .env > .env.tmp; mv .env.tmp .env; chmod 600 .env
  sudo docker compose up -d app >/dev/null && sudo docker compose restart caddy >/dev/null
  ok "홈페이지 주소를 끊었습니다. 클라우드플레어의 DNS 기록은 그대로 두었습니다(필요하면 직접 지우세요)."
  exit 0
fi

[ "${DIRECT:-}" = 1 ] || { bad "먼저 9단계(direct.sh)로 '국내 직접 접속'을 켜 주세요"; exit 1; }
[ -n "${CF_API_TOKEN:-}" ] || { bad "클라우드플레어 API 토큰이 없습니다(9단계)"; exit 1; }
command -v jq >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq jq >/dev/null
. ./minipc/cf.sh

# 앱 주소 app.jmotors.co.kr → 홈페이지 jmotors.co.kr
apex="${1:-$(awk -F. '{ n = NF; two = ($NF == "kr" && $(NF-1) ~ /^(co|or|go|ne|re|ac|pe)$/); if (two && n >= 3) print $(n-2) "." $(n-1) "." $n; else print $(n-1) "." $n }' <<<"$SITE_HOST")}"
apex="${apex,,}"
[[ "$apex" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { bad "주소가 이상합니다: $apex"; exit 1; }
[ "$apex" != "$SITE_HOST" ] || { bad "앱 주소와 같은 주소는 홈페이지로 쓸 수 없습니다"; exit 1; }
NAMES=("$apex" "www.$apex")

say "1/4 이 PC 공인 IP"
ip=$(public_ip) || { bad "공인 IP 확인 실패(인터넷?)"; exit 1; }
ok "$ip"

say "2/4 클라우드플레어 DNS (${NAMES[*]} → $ip, 회색 구름)"
ZONE_ID=$(cf_zone_id)
[ -n "$ZONE_ID" ] || { bad "영역(Zone)을 못 찾았습니다. 9단계에서 넣은 토큰이 $apex 를 고칠 수 있는지 확인하세요"; exit 1; }
for n in "${NAMES[@]}"; do
  recs=$(cf GET "/zones/$ZONE_ID/dns_records?name=$n" | jq -c '.result // []')
  if [ "$(jq length <<<"$recs")" -gt 0 ]; then
    cur=$(jq -r '.[0] | "\(.type) \(.content)"' <<<"$recs")
    if [ "$cur" = "A $ip" ] && [ "$(jq -r '.[0].proxied' <<<"$recs")" = false ]; then
      ok "$n 은 이미 맞습니다"; continue
    fi
    echo "  $n 에 이미 기록이 있습니다: $cur (가비아 기본 화면·예전 홈페이지일 수 있음)"
    read -r -p "  이 PC 로 바꿀까요? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || { bad "$n 은 그대로 두었습니다. 그만둡니다"; exit 1; }
    for id in $(jq -r '.[].id' <<<"$recs"); do cf DELETE "/zones/$ZONE_ID/dns_records/$id" >/dev/null; done
  fi
  cf POST "/zones/$ZONE_ID/dns_records" "$(jq -nc --arg n "$n" --arg ip "$ip" '{type:"A",name:$n,content:$ip,proxied:false,ttl:60}')" >/dev/null \
    && ok "$n → $ip" || { bad "$n DNS 넣기 실패(토큰 권한?)"; exit 1; }
done

say "3/4 인증서·앱 설정"
mkdir -p ./caddy-sites
printf '%s, %s {\n\timport app\n}\n' "${NAMES[0]}" "${NAMES[1]}" > "$SITES"
printf 'HOMEPAGE_HOST=%s,%s\n' "${NAMES[0]}" "${NAMES[1]}" | bash ./set-env.sh >/dev/null
sudo docker compose up -d app >/dev/null && sudo docker compose restart caddy >/dev/null
ok "Caddy 가 인증서를 받는 중(1~2분)"

say "4/4 확인"
code=000
for _ in $(seq 1 24); do
  sleep 5
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$apex:443:127.0.0.1" "https://$apex/" || true)
  [ "$code" = 200 ] && break
done
if [ "$code" = 200 ]; then
  ok "https://$apex 가 열립니다"
  echo
  echo "  다음: 앱 설정 › 홈페이지에서 문구·개업일·개인정보 보호책임자를 넣으세요."
else
  bad "아직 열리지 않습니다(응답 $code). 1~2분 뒤 다시 열어 보고, 계속 안 되면 'sudo docker compose logs caddy | tail -30' 을 보내 주세요"
fi
