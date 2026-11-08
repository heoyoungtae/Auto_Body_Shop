// 고객·상담 규칙 — 화면과 서버가 같이 쓰는 값과 검사(사내 표준서 STD-01, STD-13)

/** 차량번호: 띄어쓰기를 빼고 저장. 12가3456 · 123가4567 · 서울12가3456 */
export const PLATE_RE = /^(\d{2,3}[가-힣]\d{4}|[가-힣]{2}\d{2}[가-힣]\d{4})$/;
export const normalizePlate = (s: string) => s.replace(/\s+/g, "").trim();

/** 휴대폰·일반 전화(고객이 집 전화만 줄 수도 있다) */
export const PHONE_RE = /^0\d{8,10}$/;

export const CHANNEL_LABEL = { phone: "전화", visit: "방문", message: "문자·메신저", online: "고객용 화면", insurer: "보험사 소개", partner: "거래처 소개" } as const;
export const RESULT_LABEL = { open: "진행 중", reserved: "입고 예약", recontact: "재연락", declined: "거절·보류", converted: "입고됨" } as const;
export const INSURANCE_LABEL = { self: "자비", own: "자차 보험", other: "대물(상대 보험)" } as const;
export const CONSENT_METHOD_LABEL = { phone: "전화로 읽어 주고 구두 동의", visit: "방문해서 서명", online: "고객이 링크·화면에서 직접 동의" } as const;
/** 상담 화면의 '동의 받은 방법' 고르기: 위 세 가지 + 링크로 요청 */
export const CONSENT_PICK = { phone: CONSENT_METHOD_LABEL.phone, visit: CONSENT_METHOD_LABEL.visit, link: "문자·알림톡으로 동의 요청(링크)" } as const;

export const DAMAGE_TYPES = ["찌그러짐", "긁힘", "도장 박리", "부식", "기타"] as const;
export const CAUSES = ["사고", "긁힘·주차", "노후", "기타"] as const;
export const METHODS = ["덴트", "판금·도장", "교환", "광택"] as const;
export const PARTS_PREF = ["순정", "인증 대체품", "중고", "상관없음"] as const;

/** 상담 시간 고르기(30분 단위, 영업시간 08:00~19:00) */
export const TIME_SLOTS = Array.from({ length: 23 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

/** 개인정보 수집·이용 동의서(F-13-01) 문구. 문구를 바꾸면 판을 올리고, 다음 상담 때 다시 받는다 */
export const CONSENT_VERSION = "F-13-01 v1";
export const CONSENT_TEXT = {
  required: {
    title: "[필수] 수리 상담·작업·연락을 위한 개인정보 수집·이용",
    body: "수집 항목: 이름, 연락처, 차량번호·차종·연식·색상, 손상 사진. 목적: 상담, 예약, 견적, 수리, 출고·보증 안내. 보관: 상담만 하면 1년, 수리하면 5년(세법·표준서 7장) 뒤 파기. 동의하지 않으면 상담 기록과 연락을 할 수 없습니다.",
  },
  photo: {
    title: "[선택] 수리 전후 사진을 홍보에 사용",
    body: "번호판·얼굴을 가린 사진만 누리집·SNS에 씁니다. 동의하지 않아도 수리에는 지장이 없습니다.",
  },
  marketing: {
    title: "[선택] 할인·이벤트·기프티콘 안내(광고 문자) 받기",
    body: "할인·이벤트 소식과 이벤트 경품·감사 기프티콘은 이 항목에 동의한 고객에게만 보냅니다. 동의하지 않으면 이벤트 참여와 기프티콘 수신이 어렵습니다. 광고 문자는 오후 9시~오전 8시를 피해 보내고, 언제든 무료수신거부로 끊을 수 있습니다. 동의하지 않아도 예약·견적·출고 안내는 받습니다.",
  },
  notice: "서버 위탁·국외 이전 고지: 기록은 Oracle Cloud(일본 오사카) 서버에 보관되고, 문자 발송 대행사에 연락처가 전달됩니다. [개인정보 처리방침 확인 필요]",
} as const;

/** 영업일 더하기(토·일 제외. 공휴일은 아직 빼지 않음) */
export function addBusinessDays(iso: string, n: number): string {
  let t = Date.parse(`${iso}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    t += 864e5;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** 서울 날짜·시각 → UTC Date */
export const seoulDateTime = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);

/** UTC Date → 서울 'YYYY-MM-DD', 'HH:MM' */
export function seoulParts(d: Date): { date: string; time: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

/** 알림 문구용: 11월 9일(월) 오전 10:00 */
export function koDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
}
