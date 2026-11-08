# 서버 배포

Oracle Cloud Always Free 서버 한 대에 앱, PostgreSQL, HTTPS(Caddy), 주기 작업을 함께 띄웁니다(앱 설계서 3장). 음악학원 앱과 같은 방식이고, **계정은 음악학원 앱과 따로** 만듭니다(설계서 10.3-1).

| 파일 | 내용 |
|---|---|
| `Dockerfile` | 앱 이미지. 시작할 때 DB 마이그레이션을 먼저 돌림 |
| `compose.yml` | db(PostgreSQL 17), app, caddy(80·443, 인증서 자동), jobs(주기 작업) |
| `jobs.sh` | 매일 07:00(한국 시각) daily 작업 |
| `backup.sh` | 매일 03:00 DB·사진 백업(암호화), Object Storage 업로드, 결과를 앱에 알림(실패 시 대표에게 알림) |
| `restore.sh` | 백업 파일로 DB 되살리기(복구 훈련용) |
| `server-setup.sh` | 도커 설치, 스왑, 방화벽 80·443, 비밀값 `.env`(처음 한 번), 백업 cron 등록, 실행 |
| `set-env.sh` | 서버 `.env` 에 값 넣기(표준입력으로 받아 로그에 남지 않음) |
| `../.github/workflows/deploy-test.yml` | main 에 병합되면 GitHub 에서 이미지를 빌드해 서버로 옮기고 실행 |

## 처음 한 번 (대표님이 하실 일)

1. **Oracle Cloud 가입**: 새 계정, 홈 리전은 **South Korea Central(서울)** 또는 **South Korea North(춘천)**. 가입 후 결제 수단을 등록해 **Pay As You Go 로 업그레이드**하기를 권합니다. 무료 한도 안에서는 청구가 없고, 쓰지 않는 무료 서버를 회수당하지 않습니다.
2. **인스턴스 만들기**: Compute → Instances → Create. 이미지 Ubuntu 24.04, Shape 는 Ampere **VM.Standard.A1.Flex**(2 OCPU, 12GB)를 먼저 시도하고, 자리가 없다고 나오면 **VM.Standard.E2.1.Micro**로 만듭니다. "Save private key" 로 SSH 개인 키를 내려받고, 공인 IP 를 붙입니다.
3. **방화벽**: Networking → Virtual cloud networks → 해당 VCN → Security Lists → Default → Add Ingress Rules: 소스 `0.0.0.0/0`, TCP, 대상 포트 `80,443`.
4. **GitHub 설정**: 저장소 Settings → Secrets and variables → Actions
   - Variables: `TEST_SERVER_HOST` = 서버 공인 IP (ARM 이미지면 `TEST_SERVER_USER` = `ubuntu` 그대로)
   - Secrets: `TEST_SERVER_SSH_KEY` = 내려받은 개인 키 파일 내용 전체
5. Actions → "테스트 서버 배포" → Run workflow.

주소는 `https://<IP의 점을 -로 바꾼 것>.sslip.io` 입니다(예: `https://152-70-1-2.sslip.io`). 테스트 서버에는 역할별 시연 계정이 들어갑니다(아이디 owner·manager·advisor·tech1·tech2·quality·safety·account, 비밀번호 `demo1234`).

## 백업을 Object Storage 에 올리기(권장)

1. Storage → Buckets → Create Bucket(예: `abs-backup`, Standard).
2. 버킷 → Pre-Authenticated Requests → Create: 대상 Bucket, 접근 "Permit object writes", 만료일은 넉넉히(예: 1년 뒤, 만료 전에 새로 만들기).
3. 만들어진 주소(끝이 `/o/`)를 GitHub Secrets `BACKUP_PAR_URL` 로 넣고 배포를 다시 돌립니다.

백업 파일은 서버 `.env` 의 `BACKUP_PASSPHRASE` 로 암호화됩니다. **이 값을 잃으면 백업을 열 수 없으니** 처음 배포 뒤 서버에서 `grep BACKUP_PASSPHRASE ~/auto-body-shop/deploy/.env` 로 확인해 따로 보관하세요. 대표 PC 가 생기면 주 1회 내려받기를 설정합니다(설계서 10.3-8).

## 운영 서버로 바꿀 때

1. 도메인을 사고 A 레코드를 서버 IP 로 겨눕니다.
2. `printf 'SITE_HOST=%s\nAPP_URL=https://%s\n' 도메인 도메인 | bash ~/auto-body-shop/deploy/set-env.sh`
3. `.env` 에서 `DEMO_SEED=1` 줄을 지우고 `INIT_OWNER_LOGIN`, `INIT_OWNER_PASSWORD`, `INIT_OWNER_NAME` 을 넣은 뒤 빈 DB 로 시작합니다(대표 계정 하나만 생깁니다).

## 서버에서 자주 쓰는 명령

```sh
cd ~/auto-body-shop/deploy
sudo docker compose ps              # 상태
sudo docker compose logs -f app     # 앱 로그
sudo docker compose logs jobs       # 주기 작업 기록
tail ~/backups.log                  # 백업 기록
bash restore.sh ~/backups/db-....sql.gz.enc   # 복구(분기 1회 훈련)
```

비밀값은 서버 `~/auto-body-shop/deploy/.env` 에만 있습니다. 지우면 암호화 키가 바뀌어 저장된 연락처 등을 읽을 수 없게 되니 지우지 마세요.
