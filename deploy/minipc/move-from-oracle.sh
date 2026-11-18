#!/usr/bin/env bash
# (필요할 때만) 오라클 테스트 서버의 DB·사진과 암호화 열쇠를 미니 PC 로 그대로 옮긴다. 미니 PC 의 지금 내용은 지워진다.
# 테스트 서버에는 시연 계정(owner·manager… 비밀번호 demo1234)과 연습 자료도 함께 있으니, 옮긴 뒤 시연 계정을 꼭 막는다(설명서 6단계).
# 준비: 오라클 서버를 만들 때 받은 SSH 개인 키 파일(예: ssh-key-2026-11-08.key)을 미니 PC 의 '다운로드'에 둔다.
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/move-from-oracle.sh 150.230.58.33 ~/다운로드/ssh-key-2026-11-08.key
set -euo pipefail
cd "$(dirname "$0")/.."
IP="${1:?오라클 서버 IP 가 필요합니다(예: 150.230.58.33)}"
KEY="${2:?SSH 개인 키 파일 경로가 필요합니다}"
USER_NAME="${3:-ubuntu}"
[ -f .env ] || { echo "먼저 install.sh 로 설치하세요"; exit 1; }
chmod 600 "$KEY"
ssh_old() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER_NAME@$IP" "$@"; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

echo "오라클 서버 연결 확인..."
ssh_old "test -f auto-body-shop/deploy/.env" || { echo "오라클 서버에 앱이 없습니다"; exit 1; }
read -r -p "미니 PC 의 지금 DB·사진을 지우고 오라클 서버 것으로 바꿉니다. 계속하려면 yes: " answer
[ "$answer" = yes ] || exit 1

echo "1/4 오라클 서버에서 꺼내기(앱을 잠시 멈춤)..."
ssh_old "cd auto-body-shop/deploy && sudo docker compose stop app jobs >/dev/null 2>&1"
ssh_old "cd auto-body-shop/deploy && sudo docker compose exec -T db pg_dump -U shop -d shop --no-owner | gzip" > "$work/db.sql.gz"
ssh_old 'v=$(sudo docker volume ls -q | grep -E "_files$" | head -1); [ -n "$v" ] && sudo tar -C "$(sudo docker volume inspect -f "{{.Mountpoint}}" "$v")" -czf - . || true' > "$work/files.tgz"
ssh_old "grep -E '^(APP_ENCRYPTION_KEY|SENSITIVE_ENCRYPTION_KEY|JOBS_TOKEN)=' auto-body-shop/deploy/.env" > "$work/keys"
ssh_old "cd auto-body-shop/deploy && sudo docker compose start app jobs >/dev/null 2>&1"
[ -s "$work/db.sql.gz" ] && [ "$(wc -l < "$work/keys")" -eq 3 ] || { echo "꺼내기 실패"; exit 1; }
echo "  DB $(du -h "$work/db.sql.gz" | cut -f1), 사진 $(du -h "$work/files.tgz" | cut -f1)"

echo "2/4 암호화 열쇠 맞추기(연락처 등 암호화된 값을 읽으려면 같은 열쇠가 필요)..."
cp .env ".env.before-move-$(date +%Y%m%d%H%M)"
grep -vE '^(APP_ENCRYPTION_KEY|SENSITIVE_ENCRYPTION_KEY|JOBS_TOKEN|INIT_OWNER_[A-Z]*|DEMO_SEED)=' .env > "$work/env"
cat "$work/keys" >> "$work/env"
install -m 600 "$work/env" .env

echo "3/4 미니 PC 에 넣기..."
sudo docker compose stop app jobs
sudo docker compose exec -T db psql -q -U shop -d postgres -c "DROP DATABASE IF EXISTS shop WITH (FORCE);" -c "CREATE DATABASE shop OWNER shop;"
gunzip -c "$work/db.sql.gz" | sudo docker compose exec -T db psql -q -U shop -d shop >/dev/null
vol=$(sudo docker volume ls -q | grep -E '_files$' | head -1)
if [ -s "$work/files.tgz" ] && [ -n "$vol" ]; then
  sudo tar -C "$(sudo docker volume inspect -f '{{.Mountpoint}}' "$vol")" -xzf "$work/files.tgz"
fi

echo "4/4 다시 켜기..."
sudo docker compose up -d app jobs
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)
  [ "$code" = 200 ] && break
  sleep 5
done
[ "$code" = 200 ] && echo "✔ 옮기기 끝. 앱에 테스트 서버 계정으로 로그인해 확인하고, 시연 계정을 잠그고 owner 비밀번호를 바꾸세요." || echo "앱이 열리지 않습니다. 'sudo docker compose logs app' 을 Claude 에게 보여 주세요."
echo "통장 문자 전달 앱의 주소는 새 주소로 다시 넣어야 합니다(설정 › 통장·카드 연동)."
