// 문자 규칙: 바이트·종류(SMS/LMS), 광고 문자(야간 금지·(광고) 표기·수신거부 번호), 번호 형식.
// 미래모터스의 규칙을 따른다. 법령 근거: 정보통신망법 제50조(광고성 정보 전송 제한) [확인 필요: 최신 조문]

/** 대행사 기준(EUC-KR 근사): 한글 등 비 ASCII 는 2바이트 */
export const smsBytes = (s: string) =>
  Array.from(s).reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 1 : 2), 0);
export const SMS_MAX = 90;
export const LMS_MAX = 2000;
export const smsKind = (s: string) => (smsBytes(s) <= SMS_MAX ? "SMS" : "LMS");

/** 서울 시각 기준 광고 금지 시간(오후 9시~오전 8시) */
export function adBlockedAt(at: Date = new Date()): boolean {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hourCycle: "h23",
    }).format(at),
  );
  return h >= 21 || h < 8;
}

export const adWrap = (body: string, optout: string) =>
  `(광고)${body}\n무료수신거부 ${optout}`;

/** 발신번호: 하이픈 뺀 숫자 8~12자리(1588 대표번호 포함) */
export const SENDER_RE = /^\d{8,12}$/;
/** 받는 휴대폰: 01X 로 시작하는 10~11자리 */
export const MOBILE_RE = /^01[016789]\d{7,8}$/;
export const digits = (s: string) => s.replace(/\D/g, "");
