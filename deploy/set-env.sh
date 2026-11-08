#!/usr/bin/env bash
# 서버 .env 에 값 넣기/바꾸기. 표준입력으로 KEY=VALUE 줄을 받는다(비밀값이 명령줄·로그에 남지 않게).
# 값이 빈 줄은 건너뛴다(서버에서 직접 넣은 값을 지우지 않음). 허용한 이름만 받는다.
# 사용: printf 'BACKUP_PAR_URL=%s\n' "$URL" | bash deploy/set-env.sh
set -euo pipefail
cd "$(dirname "$0")"
ALLOWED="BACKUP_PAR_URL INIT_OWNER_LOGIN INIT_OWNER_PASSWORD INIT_OWNER_NAME SITE_HOST APP_URL"
touch .env && chmod 600 .env
changed=0
while IFS= read -r line || [ -n "$line" ]; do
  name="${line%%=*}"
  value="${line#*=}"
  [ -z "$value" ] && continue
  case " $ALLOWED " in *" $name "*) ;; *) echo "받지 않는 이름: $name" >&2; continue ;; esac
  if [ "$(grep -E "^$name=" .env | head -1 | cut -d= -f2-)" != "$value" ]; then
    grep -vE "^$name=" .env > .env.tmp || true
    printf '%s=%s\n' "$name" "$value" >> .env.tmp
    mv .env.tmp .env && chmod 600 .env
    echo "$name 설정함"
    changed=1
  fi
done
[ "$changed" = 0 ] && echo "바뀐 값 없음"
exit 0
