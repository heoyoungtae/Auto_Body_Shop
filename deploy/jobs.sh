# 주기 작업(앱 설계서 8.6): 매일 07:00(한국 시각) daily. 1차부터 10:00 점검 누락·설문 같은 작업을 더한다.
call() {
  curl -fsS -m 300 -X POST -H "Authorization: Bearer $JOBS_TOKEN" "http://app:3000/api/jobs/$1" -o /dev/null \
    && echo "$(date '+%F %R') $1 ok" || echo "$(date '+%F %R') $1 실패"
}
while true; do
  hm=$(date +%H%M)
  [ "$hm" = "0700" ] && call daily
  s=$(date +%S | sed 's/^0//')
  sleep $((60 - s))
done
