#!/usr/bin/env bash
# 5단계(정전): APC UPS 를 USB 로 이 PC 에 연결했을 때, 정전이 길어지면 배터리가 바닥나기 전에 PC 를 안전하게 끈다.
# 전기가 돌아오면 UPS 가 다시 켜지고, BIOS 의 'After Power Failure = Power On' 덕분에 PC 도 저절로 켜진다.
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/ups.sh
set -euo pipefail
lsusb 2>/dev/null | grep -qi 'american power\|051d:' || echo "주의: APC UPS 가 USB 로 보이지 않습니다. UPS 의 USB 선을 미니 PC 에 꽂았는지 확인하세요(계속 진행합니다)."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apcupsd >/dev/null
C=/etc/apcupsd/apcupsd.conf
sudo sed -i 's/^UPSCABLE .*/UPSCABLE usb/; s/^UPSTYPE .*/UPSTYPE usb/; s/^DEVICE .*/DEVICE/; s/^BATTERYLEVEL .*/BATTERYLEVEL 40/; s/^MINUTES .*/MINUTES 5/' "$C"
[ -f /etc/default/apcupsd ] && sudo sed -i 's/^ISCONFIGURED=.*/ISCONFIGURED=yes/' /etc/default/apcupsd
sudo systemctl enable -q --now apcupsd
sudo systemctl restart apcupsd
sleep 3
apcaccess status 2>/dev/null | grep -E 'STATUS|BCHARGE|TIMELEFT' || echo "UPS 상태를 아직 읽지 못했습니다. 1분 뒤 'apcaccess status' 로 다시 확인하세요."
echo "✔ 배터리 40% 또는 남은 시간 5분이 되면 PC 를 안전하게 끕니다."
