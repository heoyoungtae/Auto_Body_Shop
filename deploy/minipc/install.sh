#!/usr/bin/env bash
# 사업장 미니 PC(Ubuntu 24.04 데스크톱)에 서버 환경을 한 번에 설치한다. 설명서: deploy/minipc/README.md 2단계.
# 미니 PC 에서 '관리자(abs)' 계정으로 터미널(Ctrl+Alt+T)을 열고 붙여 넣는다:
#   bash <(wget -qO- https://raw.githubusercontent.com/heoyoungtae/Auto_Body_Shop/claude/project-thread-asspnw/deploy/minipc/install.sh)
# 여러 번 돌려도 된다(이미 된 단계는 건너뜀).
set -euo pipefail
REPO_URL="https://github.com/heoyoungtae/Auto_Body_Shop.git"
DIR="$HOME/auto-body-shop"
say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }

[ "$(id -u)" -ne 0 ] || { echo "관리자(abs) 계정으로 sudo 없이 실행하세요"; exit 1; }
grep -q 'Ubuntu' /etc/os-release || { echo "Ubuntu 에서만 돌립니다"; exit 1; }
echo "미니 PC 서버 설치를 시작합니다. 중간에 비밀번호를 물으면 이 PC 로그인 비밀번호를 넣으세요(화면에 보이지 않는 것이 정상)."
sudo -v

say "1/8 프로그램 목록 새로 고침·기본 도구 설치(몇 분 걸림)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git openssl rsync ca-certificates unattended-upgrades >/dev/null
ok "완료"

say "2/8 시간대·절전 끄기·자동 보안 업데이트"
sudo timedatectl set-timezone Asia/Seoul
sudo systemctl restart cron  # 주기 작업이 서울 시각을 쓰도록
# 서버는 잠들면 안 된다
sudo systemctl mask -q sleep.target suspend.target hibernate.target hybrid-sleep.target
# 보안 업데이트는 저절로, 다시 켜야 하면 새벽 4시에 다시 켠다(앱은 저절로 다시 뜸)
sudo tee /etc/apt/apt.conf.d/52abs-server >/dev/null <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
CONF
ok "시간대 서울, 절전 꺼짐, 보안 업데이트 자동(필요하면 새벽 4시 재시작)"

say "3/8 도커 설치"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi
sudo systemctl enable -q --now docker
ok "$(sudo docker --version)"

say "4/8 앱 코드 내려받기"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only || true
else
  git clone -q "$REPO_URL" "$DIR"
fi
ok "$DIR ($(git -C "$DIR" rev-parse --abbrev-ref HEAD))"
cd "$DIR/deploy"

say "5/8 비밀값(.env) 만들기"
if [ ! -f .env ]; then
  echo "앱에 처음 들어갈 대표 계정을 정합니다(나중에 앱에서 비밀번호를 바꿀 수 있음)."
  read -r -p "  대표 아이디(영문, 예: heo): " owner_login
  read -r -p "  대표 이름(예: 허영태): " owner_name
  while true; do
    read -r -s -p "  대표 비밀번호(8자 이상): " owner_pw; echo
    read -r -s -p "  한 번 더: " owner_pw2; echo
    [ "$owner_pw" = "$owner_pw2" ] && [ "${#owner_pw}" -ge 8 ] && break
    echo "  두 번이 다르거나 8자보다 짧습니다. 다시 넣으세요."
  done
  key() { openssl rand -base64 32; }
  umask 077
  cat > .env <<ENV
# 사업장 미니 PC 서버 설정. 지우거나 아래 열쇠 값을 바꾸면 저장된 연락처 등을 읽을 수 없게 되니 손대지 마세요.
COMPOSE_FILE=compose.minipc.yml
# 인터넷 주소(도메인). 3단계(connect.sh)에서 넣는다. 그 전에는 이 PC 안에서만 열림
SITE_HOST=localhost
APP_URL=http://localhost:3000
APP_INTERNAL_URL=http://127.0.0.1:3000
# 서버가 공업사 안에 있음: 출퇴근 '서버와 같은 인터넷' 허용, 접속 주소는 클라우드플레어가 알려 준 값 사용
SERVER_ON_SITE=1
TRUST_CF_IP=1
DB_PASSWORD=$(openssl rand -hex 24)
APP_ENCRYPTION_KEY=$(key)
SENSITIVE_ENCRYPTION_KEY=$(key)
JOBS_TOKEN=$(openssl rand -hex 32)
# 백업 파일 암호. 잃어버리면 백업을 열 수 없으니 대표가 종이에 적어 금고에 보관한다
BACKUP_PASSPHRASE=$(openssl rand -base64 24)
INIT_OWNER_LOGIN=$owner_login
INIT_OWNER_NAME=$owner_name
INIT_OWNER_PASSWORD=$owner_pw
ENV
  unset owner_pw owner_pw2
  ok ".env 를 만들었습니다"
else
  ok "이미 있음(그대로 둠)"
fi

say "6/8 앱 만들기·실행(처음에는 10~20분 걸림, 화면이 멈춘 것처럼 보여도 기다리세요)"
sudo docker compose build app
sudo docker compose up -d --remove-orphans db app jobs
grep -q '^TUNNEL_TOKEN=.\+' .env && sudo docker compose up -d tunnel
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)
  [ "$code" = 200 ] && break
  sleep 5
done
[ "$code" = 200 ] || { echo "앱이 열리지 않습니다. 'sudo docker compose logs app' 결과를 Claude 에게 보여 주세요"; exit 1; }
# 대표 계정이 만들어졌으니 처음 비밀번호는 .env 에서 지운다
sed -i '/^INIT_OWNER_PASSWORD=/d' .env
ok "앱이 열렸습니다: 이 PC 에서 http://localhost:3000"

say "7/8 매일 백업(03:00)·새 버전 확인(21:30) 등록"
sudo tee /etc/cron.d/auto-body-shop >/dev/null <<CRON
# 사업장 미니 PC 서버 주기 작업(minipc/install.sh 가 만듦)
SHELL=/bin/bash
0 3 * * * root HOME=$HOME bash $DIR/deploy/backup.sh >> $HOME/backups.log 2>&1
30 21 * * * root HOME=$HOME bash $DIR/deploy/minipc/update.sh >> $HOME/update.log 2>&1
CRON
sudo chmod 644 /etc/cron.d/auto-body-shop
# 앱 설정 › 서버 화면 연결(1분마다 상태 알림·'지금 새 버전 올리기' 요청 받기)
sudo tee /etc/cron.d/auto-body-shop-agent >/dev/null <<CRON
SHELL=/bin/bash
* * * * * root HOME=$HOME bash $DIR/deploy/minipc/agent.sh >/dev/null 2>&1
CRON
sudo chmod 644 /etc/cron.d/auto-body-shop-agent
ok "등록함(기록: ~/backups.log, ~/update.log)"

say "8/8 바탕화면에 '앱 열기' 아이콘"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/auto-body-shop.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=공업사 앱(이 PC)
Exec=xdg-open http://localhost:3000
Icon=applications-internet
DESK
ok "프로그램 목록에서 '공업사 앱' 검색"

cat <<DONE

==================================================================
 설치 끝. 지금은 이 미니 PC 에서만 앱이 열립니다(http://localhost:3000).
 다음: 설명서 3단계(인터넷 주소 연결) →  bash ~/auto-body-shop/deploy/minipc/connect.sh

 꼭 할 일: 아래 '백업 암호'를 종이에 적어 안전한 곳에 두세요.
 이것을 잃으면 백업 파일을 열 수 없습니다.
   $(grep ^BACKUP_PASSPHRASE= "$DIR/deploy/.env" | cut -d= -f2-)
==================================================================
DONE
