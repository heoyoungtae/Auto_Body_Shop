#!/usr/bin/env bash
# 3단계: 인터넷 주소(도메인) 연결. 클라우드플레어 터널 토큰과 주소를 .env 에 넣고 터널을 켠다.
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/connect.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "클라우드플레어에서 만든 앱 주소와 터널 토큰을 넣습니다(설명서 3단계)."
read -r -p "  앱 주소(예: app.myshop.com, https:// 없이): " host
host="${host#https://}"; host="${host#http://}"; host="${host%%/*}"
[ -n "$host" ] || { echo "주소가 비었습니다"; exit 1; }
read -r -s -p "  터널 토큰(클라우드플레어 화면의 긴 글자, 붙여 넣기 후 Enter. 화면에 보이지 않음): " token; echo
token="${token##* }"   # 'cloudflared service install <토큰>' 줄을 통째로 붙여 넣어도 토큰만 쓴다
[ "${#token}" -gt 50 ] || { echo "토큰이 너무 짧습니다. 다시 복사해 주세요"; exit 1; }
printf 'SITE_HOST=%s\nAPP_URL=https://%s\nTUNNEL_TOKEN=%s\n' "$host" "$host" "$token" | bash ./set-env.sh
unset token
sudo docker compose up -d app tunnel
echo "연결 확인 중(최대 1분)..."
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$host/login" || true)
  [ "$code" = 200 ] && break
  sleep 5
done
if [ "$code" = 200 ]; then
  echo "✔ 연결됨: https://$host  (휴대폰 데이터로도 열어 보세요)"
else
  echo "아직 열리지 않습니다(응답 $code). 클라우드플레어의 Public hostname 서비스가 'HTTP' 와 'app:3000' 인지 확인하세요."
  echo "터널 상태: sudo docker compose logs --tail 20 tunnel"
fi
