#!/usr/bin/env bash
# 5단계(백업): 백업을 다른 디스크(USB 외장 디스크 또는 미니 PC 의 두 번째 SSD)에도 매일 복사한다.
# 먼저 '디스크' 프로그램으로 그 디스크를 포맷하면서 이름(볼륨 이름)을 ABS-BACKUP, 형식을 Ext4 로 정한다(설명서 5단계).
# 사용(관리자 abs 계정 터미널): bash ~/auto-body-shop/deploy/minipc/backup-disk.sh
set -euo pipefail
cd "$(dirname "$0")/.."
LABEL=ABS-BACKUP
MNT=/mnt/abs-backup
dev="/dev/disk/by-label/$LABEL"
[ -e "$dev" ] || { echo "이름이 $LABEL 인 디스크를 찾지 못했습니다. '디스크' 프로그램에서 포맷할 때 볼륨 이름을 $LABEL 로 했는지 확인하세요."; exit 1; }
sudo mkdir -p "$MNT"
# nofail: 디스크를 빼 둔 채로 켜도 PC 는 정상으로 켜진다(대신 백업 결과에 '백업 디스크 없음'이 뜸)
grep -q "LABEL=$LABEL" /etc/fstab || echo "LABEL=$LABEL $MNT ext4 defaults,nofail,x-systemd.device-timeout=10s 0 2" | sudo tee -a /etc/fstab >/dev/null
sudo systemctl daemon-reload
mountpoint -q "$MNT" || sudo mount "$MNT"
sudo mkdir -p "$MNT/auto-body-shop" && sudo chmod 700 "$MNT/auto-body-shop"
printf 'BACKUP_COPY_DIR=%s\n' "$MNT/auto-body-shop" | bash ./set-env.sh
echo "지금 한 번 백업해 봅니다..."
sudo HOME="$HOME" bash ./backup.sh && echo "✔ 백업 디스크에 복사됨: $(ls "$MNT/auto-body-shop" 2>/dev/null | tail -2 | tr '\n' ' ')" || echo "백업에 문제가 있습니다. 위 메시지를 Claude 에게 보여 주세요."
