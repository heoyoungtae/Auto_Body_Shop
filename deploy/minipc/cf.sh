# direct.sh·ddns.sh 가 함께 쓰는 클라우드플레어 DNS 도우미. .env 를 읽은 뒤 source 한다.
# CF_API_TOKEN: 클라우드플레어 'Edit zone DNS' API 토큰(설명서 9단계). SITE_HOST: app.jmotors.co.kr 같은 앱 주소.
CF_API="https://api.cloudflare.com/client/v4"
cf() { # cf METHOD PATH [JSON]
  local m="$1" p="$2" d="${3:-}"
  if [ -n "$d" ]; then
    curl -fsS -m 30 -X "$m" -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data "$d" "$CF_API$p"
  else
    curl -fsS -m 30 -X "$m" -H "Authorization: Bearer $CF_API_TOKEN" "$CF_API$p"
  fi
}
# 앱 주소가 속한 영역(zone) id. 토큰이 볼 수 있는 영역 중 주소 끝이 같은 것
cf_zone_id() {
  cf GET "/zones?per_page=50" | jq -r --arg h "$SITE_HOST" '.result[] | select(($h == .name) or ($h | endswith("." + .name))) | .id' | head -1
}
cf_record() { # 앱 주소의 DNS 기록(JSON 한 줄). 없으면 빈 줄
  cf GET "/zones/$ZONE_ID/dns_records?name=$SITE_HOST" | jq -c '.result[0] // empty'
}
public_ip() { # 이 PC 가 인터넷에 나갈 때 쓰는 공인 IPv4
  curl -4 -fsS -m 10 https://1.1.1.1/cdn-cgi/trace | sed -n 's/^ip=//p'
}
