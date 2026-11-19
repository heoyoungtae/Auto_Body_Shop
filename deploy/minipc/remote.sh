#!/usr/bin/env bash
# 원격 관리 켜기(설명서 10단계). 서버가 대표 자택 등 정비소 밖에 있을 때 한 번 실행한다.
#  1) 서버 위치를 '정비소 밖'으로 표시: 출퇴근 '서버와 같은 인터넷'을 끈다(서버 인터넷 ≠ 정비소 인터넷)
#  2) 앱 설정 › 서버 화면이 이 PC 상태를 보고 '지금 새 버전 올리기'를 할 수 있게 agent.sh 를 1분마다 돌린다
#  3) (고르면) Tailscale: 정비소 PC·휴대폰에서 이 PC 터미널에 들어갈 수 있게(공유기 포트를 열지 않음)
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/remote.sh
#   서버를 다시 정비소 안에 두면: bash ~/auto-body-shop/deploy/minipc/remote.sh shop
set -uo pipefail
cd "$(dirname "$0")/.."
DIR="$(dirname "$PWD")"
say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
command -v jq >/dev/null || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq jq >/dev/null

say "1/3 서버 위치"
if [ "${1:-}" = shop ]; then
  printf 'SERVER_ON_SITE=1\n' | bash ./set-env.sh >/dev/null
  ok "정비소 안으로 표시(출퇴근 '서버와 같은 인터넷'을 쓸 수 있음)"
else
  printf 'SERVER_ON_SITE=0\n' | bash ./set-env.sh >/dev/null
  ok "정비소 밖(대표 자택)으로 표시. 출퇴근은 'TV 현황판과 같은 인터넷'으로 정비소를 알아봅니다"
fi
sudo docker compose up -d app >/dev/null && ok "앱에 반영"

say "2/3 앱 설정 › 서버 연결(1분마다 상태 알림·새 버전 올리기 요청 받기)"
sudo tee /etc/cron.d/auto-body-shop-agent >/dev/null <<CRON
# 앱 설정 › 서버 화면과 연결(minipc/remote.sh 가 만듦)
SHELL=/bin/bash
* * * * * root HOME=$HOME bash $DIR/deploy/minipc/agent.sh >/dev/null 2>&1
CRON
sudo chmod 644 /etc/cron.d/auto-body-shop-agent
sudo HOME="$HOME" bash ./minipc/agent.sh && ok "등록함. 앱 설정 › 서버 에 1분 안에 정보가 나옵니다"

say "3/3 원격 터미널(Tailscale, 선택)"
if command -v tailscale >/dev/null; then
  ok "이미 설치됨: $(tailscale ip -4 2>/dev/null | head -1)"
else
  read -r -p "  정비소 PC·휴대폰에서 이 PC 터미널에 들어갈 수 있게 Tailscale 을 설치할까요? (y/N) " a
  if [ "${a,,}" = y ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    echo "  아래에 나오는 주소를 휴대폰이나 PC 브라우저로 열어 로그인(구글 계정 등)하세요."
    sudo tailscale up --ssh --hostname abs-server
    ok "연결됨. 다른 기기에도 Tailscale 을 설치하고 같은 계정으로 로그인한 뒤: ssh abs@abs-server"
  else
    echo "  건너뜀. 나중에 다시 이 명령을 실행하면 됩니다."
  fi
fi
echo
echo "끝. 앱에서 설정 › 서버 를 열어 보세요."
