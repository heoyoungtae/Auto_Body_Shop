#!/usr/bin/env bash
# 4단계: 미니 PC 를 켜면 '화면' 계정으로 저절로 로그인해 앱을 전체 화면으로 띄운다(관리자 계정과 분리).
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/screen.sh [열 주소]
#   열 주소를 빼면 3단계에서 넣은 앱 주소(.env 의 APP_URL)를 연다. 예: TV 현황판 링크를 넣으면 현황판을 띄운다.
# 끄려면: bash screen.sh off
set -euo pipefail
cd "$(dirname "$0")/.."
GDM=/etc/gdm3/custom.conf
if [ "${1:-}" = "off" ]; then
  sudo sed -i 's/^AutomaticLoginEnable=.*/AutomaticLoginEnable=false/' "$GDM"
  echo "자동 화면을 껐습니다. 다시 켜면 로그인 화면이 나옵니다."
  exit 0
fi
url="${1:-$(grep ^APP_URL= .env | cut -d= -f2-)}"
id screen >/dev/null 2>&1 || sudo adduser --disabled-password --gecos "앱 화면" screen >/dev/null
# 자동 로그인
sudo sed -i '/^AutomaticLoginEnable=/d;/^AutomaticLogin=/d' "$GDM"
sudo sed -i 's/^\[daemon\]/[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=screen/' "$GDM"
# 파이어폭스 첫 실행 안내·기본 브라우저 묻기 끄기
sudo mkdir -p /etc/firefox/policies
sudo tee /etc/firefox/policies/policies.json >/dev/null <<'JSON'
{ "policies": { "DontCheckDefaultBrowser": true, "OverrideFirstRunPage": "", "OverridePostUpdatePage": "", "DisableTelemetry": true, "DisableProfileImport": true, "NoDefaultBookmarks": true } }
JSON
# 화면 계정이 로그인하면: 화면 꺼짐·잠금 끄기 → 앱을 전체 화면(키오스크)으로
sudo -u screen mkdir -p /home/screen/.config/autostart
sudo tee /home/screen/kiosk.sh >/dev/null <<KIOSK
#!/bin/bash
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.desktop.notifications show-banners false
sleep 5
# 인터넷이 끊겨 있으면 이 PC 안 주소로 연다
if curl -s -o /dev/null -m 5 "$url"; then u="$url"; else u="http://localhost:3000"; fi
while true; do firefox --kiosk "\$u"; sleep 2; done
KIOSK
sudo chmod 755 /home/screen/kiosk.sh
sudo tee /home/screen/.config/autostart/kiosk.desktop >/dev/null <<'DESK'
[Desktop Entry]
Type=Application
Name=공업사 앱 화면
Exec=/home/screen/kiosk.sh
X-GNOME-Autostart-enabled=true
DESK
sudo chown -R screen:screen /home/screen/.config /home/screen/kiosk.sh
echo "✔ 다음에 켜면 '앱 화면' 계정으로 저절로 들어가 $url 을 전체 화면으로 엽니다."
echo "  관리할 때: Ctrl+Alt+Delete → 로그아웃 → '관리자'로 로그인하세요. 끄기: bash screen.sh off"
