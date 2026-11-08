#!/usr/bin/env bash
# 서버(Oracle Always Free, Ubuntu)에서 돌린다: 도커 설치, 스왑, 방화벽 80·443 열기, 비밀값 .env 만들기(처음 한 번), 백업 등록, 실행.
# 앱 이미지(auto-body-shop-app)는 GitHub Actions 가 빌드해 옮겨 둔다. 이미지가 아직 없으면 준비만 하고 끝낸다.
# 사용: bash deploy/server-setup.sh <서버 공인 IP>
set -euo pipefail
cd "$(dirname "$0")"
HOST_IP="${1:?서버 공인 IP 가 필요함}"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# 메모리 1GB 서버(E2.1.Micro)에서도 돌도록 스왑 2GB(A1.Flex 면 없어도 됨)
if [ "$(swapon --noheadings | wc -l)" -eq 0 ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 오라클 우분투 이미지는 iptables 가 22번 외에는 막는다. REJECT 앞에 80·443 을 연다.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    n=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    if [ -n "$n" ]; then sudo iptables -I INPUT "$n" -p tcp --dport "$port" -j ACCEPT; else sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT; fi
  fi
done
command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null || true

if [ ! -f .env ]; then
  key() { openssl rand -base64 32; }
  host="${HOST_IP//./-}.sslip.io"
  umask 077
  cat > .env <<ENV
SITE_HOST=$host
APP_URL=https://$host
DB_PASSWORD=$(openssl rand -hex 24)
APP_ENCRYPTION_KEY=$(key)
SENSITIVE_ENCRYPTION_KEY=$(key)
JOBS_TOKEN=$(openssl rand -hex 32)
# 백업 파일 암호. 잃어버리면 백업을 열 수 없으니 대표가 따로 적어 보관한다
BACKUP_PASSPHRASE=$(openssl rand -base64 24)
# 테스트 서버 전용: 역할별 시연 계정을 만든다. 운영 서버에서는 지우고 INIT_OWNER_* 를 넣는다
DEMO_SEED=1
ENV
  echo ".env 를 새로 만들었음 (주소 https://$host)"
fi

# 매일 03:00(한국 시각) 백업. 서버 시간대가 UTC 이면 18:00 으로 등록한다
if ! crontab -l 2>/dev/null | grep -q 'deploy/backup.sh'; then
  hour=3; [ "$(date +%Z)" = "UTC" ] && hour=18
  { crontab -l 2>/dev/null || true; echo "0 $hour * * * bash $PWD/backup.sh >> $HOME/backups.log 2>&1"; } | crontab -
fi

if ! sudo docker image inspect auto-body-shop-app:latest >/dev/null 2>&1; then
  echo "앱 이미지가 아직 없음: 준비만 마침"
  exit 0
fi
sudo docker compose up -d --no-build --remove-orphans
# jobs.sh 는 시작할 때 한 번 읽히므로, 주기 작업 목록이 바뀌어도 반영되게 다시 띄운다
sudo docker compose restart jobs
sudo docker image prune -f >/dev/null
echo "배포 완료: $(grep ^APP_URL= .env | cut -d= -f2)"
