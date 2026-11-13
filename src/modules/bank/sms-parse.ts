// 은행 입출금·카드 승인 알림 문자 읽기(순수 함수). 은행·카드사마다 줄바꿈·순서가 달라서
// '입금·출금·승인·취소' 낱말 → 그 옆 금액, '잔액·누적' 뒤 금액, 월/일 시:분, 번호 끝자리, 남은 낱말(상대방)을 차례로 찾는다.
import { BANKS, CARDS, parseDateTime, type BankCo, type CardCo } from "./rules";

export type SmsTx = {
  kind: "in" | "out" | "card" | "card_cancel";
  company: BankCo | CardCo | null;
  /** 문자에 보인 번호 끝자리(계좌·카드) */
  digits: string | null;
  on: string;
  at: string | null;
  amountWon: number;
  balanceWon: number | null;
  party: string | null;
  memo: string | null;
  approvalNo: string | null;
};
export type SmsParse = { ok: true; tx: SmsTx } | { ok: false; reason: string };

const IN_WORDS = ["입금", "이체입금", "타행입금", "급여입금"];
const OUT_WORDS = ["출금", "지급", "이체출금", "타행이체", "자동이체", "인출", "송금", "체크출금", "출금이체", "대체출금"];
const NOISE = new Set([
  "web발신", "국외발신", "국제발신", "일시불", "할부", "체크", "승인", "취소", "승인취소", "입금", "출금", "지급", "잔액", "누적", "이체", "자동이체", "타행이체", "인출", "송금", "원", "결제", "사용", "일반",
  "광고", "알림", "안내", "님", "고객님", "체크카드", "신용", "법인", "개인", "해외", "국내", "누적금액", "잔액원", "대체", "스마트폰", "인터넷", "atm", "cd", "펌뱅킹", "오픈뱅킹", "모바일", "전자금융", "창구", "fb",
]);

function detectCompany(text: string, card: boolean): BankCo | CardCo | null {
  const flat = text.replace(/\s/g, "");
  if (card) {
    for (const [k, v] of Object.entries(CARDS)) if (v.keys.some((w) => flat.includes(w))) return k as CardCo;
  }
  // 은행: [KB] 같은 머리표 먼저, 그다음 이름
  for (const [k, v] of Object.entries(BANKS)) if (v.keys.some((w) => w.length > 2 && flat.includes(w))) return k as BankCo;
  for (const [k, v] of Object.entries(BANKS)) if (v.keys.some((w) => flat.includes(w))) return k as BankCo;
  return null;
}

type Tok = { s: string; i: number; used?: boolean };

/** 문자 한 통 읽기. receivedOn: 받은 날(연도 붙이기용) */
export function parseBankSms(raw: string, receivedOn: string): SmsParse {
  const text = raw
    .replace(/\[?(web발신|Web발신|국외발신|국제발신|국외발송)\]?/gi, " ")
    .replace(/[​ ]/g, " ")
    .trim();
  if (!text) return { ok: false, reason: "빈 문자" };
  if (/인증번호|인증 번호|비밀번호|OTP|보안카드|광고\)|\(광고/.test(text)) return { ok: false, reason: "거래 알림이 아님(인증·광고 문자)" };

  const cardish = (/카드|체크/.test(text) && /승인|취소/.test(text)) || (/승인/.test(text) && !/입금|출금/.test(text));
  const cancel = cardish && /취소/.test(text);
  const isCard = cardish;
  let kind: SmsTx["kind"] | null = null;
  if (isCard && (cancel || /승인/.test(text))) kind = cancel ? "card_cancel" : "card";
  else {
    const inAt = Math.min(...IN_WORDS.map((w) => text.indexOf(w)).filter((i) => i >= 0), Infinity);
    const outAt = Math.min(...OUT_WORDS.map((w) => text.indexOf(w)).filter((i) => i >= 0), Infinity);
    if (inAt === Infinity && outAt === Infinity) return { ok: false, reason: "입금·출금·승인 낱말이 없음" };
    kind = inAt < outAt ? "in" : "out";
  }

  // 낱말로 쪼개기(금액·날짜·번호를 따로 집어내려고 숫자와 한글 사이도 띄움)
  const spaced = text
    .replace(/(잔액|누적|입금|출금|지급|승인|취소|일시불|할부)/g, " $1 ")
    .replace(/(\d)(원)/g, "$1 $2")
    .replace(/([가-힣])(\d{1,3}(,\d{3})+)/g, "$1 $2")
    .replace(/[\n\r\t]+/g, " ");
  const toks: Tok[] = spaced
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => ({ s, i }));

  const isMoney = (s: string) => /^-?\d{1,3}(,\d{3})+원?$/.test(s) || /^-?\d{1,9}원$/.test(s) || /^\d{1,9}$/.test(s);
  const money = (s: string) => Number(s.replace(/[^\d]/g, ""));

  // 잔액·누적
  let balance: number | null = null;
  for (let i = 0; i < toks.length; i++) {
    if (/^(잔액|누적|누적금액|잔액원)$/.test(toks[i].s) || /^(잔액|누적)[:：]/.test(toks[i].s)) {
      toks[i].used = true;
      const inline = /^(?:잔액|누적)[:：]?(-?[\d,]+)원?$/.exec(toks[i].s);
      if (inline) {
        balance = money(inline[1]);
        break;
      }
      for (let j = i + 1; j < Math.min(toks.length, i + 3); j++) {
        const t = toks[j].s.replace(/^[:：]/, "");
        if (/^-?[\d,]+원?$/.test(t) && t.replace(/\D/g, "").length) {
          balance = money(t);
          toks[j].used = true;
          if (toks[j + 1]?.s === "원") toks[j + 1].used = true;
          break;
        }
      }
      break;
    }
  }
  const balanceTok = toks.find((t) => /^(잔액|누적)[:：]?[\d,]+원?$/.test(t.s));
  if (balance == null && balanceTok) {
    balance = money(balanceTok.s);
    balanceTok.used = true;
  }

  // 날짜·시각
  let on: string | null = null;
  let at: string | null = null;
  for (const t of toks) {
    if (t.used) continue;
    const d = /^\(?(\d{4}[./-])?\d{1,2}[/.-]\d{1,2}\)?$/.test(t.s) ? parseDateTime(t.s.replace(/[()]/g, ""), receivedOn) : null;
    if (d && !on) {
      on = d.on;
      t.used = true;
      continue;
    }
    const dt = /^(\d{1,2}[/.-]\d{1,2})(\d{1,2}:\d{2})$/.exec(t.s) ?? /^(\d{1,2}[/.-]\d{1,2}),(\d{1,2}:\d{2})$/.exec(t.s);
    if (dt && !on) {
      const p = parseDateTime(dt[1], receivedOn);
      if (p) {
        on = p.on;
        at = dt[2].padStart(5, "0");
        t.used = true;
        continue;
      }
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t.s) && !at) {
      at = t.s.slice(0, 5).padStart(5, "0");
      t.used = true;
    }
  }
  // 쉼표로 붙은 "하나,11/13,14:23" 같은 꼴
  if (!on) {
    const m = /(?<![\d,])(\d{1,2})[/.](\d{1,2})(?![\d/.])/.exec(text);
    if (m) on = parseDateTime(`${m[1]}/${m[2]}`, receivedOn)?.on ?? null;
    const tm = /(\d{1,2}):(\d{2})/.exec(text);
    if (tm && !at) at = `${tm[1].padStart(2, "0")}:${tm[2]}`;
    for (const t of toks) if (/\d{1,2}[/.]\d{1,2}/.test(t.s) && !/^[\d,]+원?$/.test(t.s)) t.used = true;
  }

  // 금액: 거래 낱말 바로 뒤(또는 앞)의 금액. 없으면 '원'이 붙은 첫 금액(잔액·누적 제외)
  const keyRe = kind === "in" ? /입금/ : kind === "out" ? new RegExp(OUT_WORDS.join("|")) : /승인|취소/;
  let amount: number | null = null;
  const keyIdx = toks.findIndex((t) => keyRe.test(t.s));
  const near = keyIdx >= 0 ? [keyIdx + 1, keyIdx + 2, keyIdx - 1, keyIdx + 3, keyIdx + 4] : [];
  for (const j of near) {
    const t = toks[j];
    if (!t || t.used) continue;
    const inline = /^(?:입금|출금|지급|승인|취소)?(-?[\d,]+)원?$/.exec(t.s);
    if (inline && isMoney(inline[1] + (t.s.endsWith("원") ? "원" : "")) && (inline[1].includes(",") || t.s.endsWith("원") || toks[j + 1]?.s === "원" || Number(inline[1]) >= 100)) {
      if (/^\d{4}$/.test(inline[1]) && !toks[j + 1]?.s.startsWith("원") && !t.s.endsWith("원")) continue; // 카드 번호 4자리일 수 있음
      amount = money(inline[1]);
      t.used = true;
      if (toks[j + 1]?.s === "원") toks[j + 1].used = true;
      break;
    }
  }
  if (amount == null) {
    for (let j = 0; j < toks.length; j++) {
      const t = toks[j];
      if (t.used) continue;
      if (/^-?[\d,]+원$/.test(t.s) || (/^-?\d{1,3}(,\d{3})+$/.test(t.s) && toks[j + 1]?.s !== "누적")) {
        amount = money(t.s);
        t.used = true;
        break;
      }
    }
  }
  if (keyIdx >= 0) toks[keyIdx].used = true;
  if (amount == null || amount <= 0) return { ok: false, reason: "금액을 찾지 못함" };
  if (!on) on = receivedOn;

  // 번호 끝자리: (1234) · 1234 · 123-***-456789 · 110***123456 · *1234
  let digits: string | null = null;
  for (const t of toks) {
    if (t.used) continue;
    const s = t.s.replace(/^[[(]|[\])]$/g, "");
    const masked = /^[\d*-]{6,}$/.test(s) && /\*/.test(s) ? s : null;
    const card4 = /^[가-힣A-Za-z]*\(?(\d{4})\)?(승인|취소)?$/.exec(t.s);
    if (masked) {
      digits = s.replace(/\D/g, "").slice(-4) || null;
      t.used = true;
      break;
    }
    if (/^\d{3,6}-\d{2,6}(-\d{1,6})*$/.test(s) && s.replace(/\D/g, "").length >= 8) {
      digits = s.replace(/\D/g, "").slice(-4);
      t.used = true;
      break;
    }
    if (card4 && (kind === "card" || kind === "card_cancel") && !/^\d{4}$/.test(t.s.replace(/[()]/g, "")) === false) {
      digits = card4[1];
      t.used = true;
      break;
    }
    if (card4 && /[가-힣A-Za-z]/.test(t.s)) {
      digits = card4[1];
      t.used = true;
      break;
    }
  }
  if (!digits) {
    const m = /(\d{2,})\*+(\d{2,})/.exec(text) ?? /\((\d{4})\)/.exec(text) ?? /\*(\d{3,4})(?!\d)/.exec(text);
    if (m) digits = (m[2] ?? m[1]).slice(-4);
  }

  // 승인번호(있으면)
  const ap = /승인번호[:：\s]*(\d{6,10})/.exec(text);
  const approvalNo = ap ? ap[1] : null;

  const company = detectCompany(text, kind === "card" || kind === "card_cancel");
  const companyWords = new Set(
    Object.values(kind === "card" || kind === "card_cancel" ? CARDS : BANKS)
      .flatMap((v) => v.keys as readonly string[])
      .concat(Object.values(BANKS).flatMap((v) => v.keys as readonly string[])),
  );

  // 남은 낱말 = 상대방(입금자·받는 분·가맹점). 카드 문자의 가린 이름(홍*동)은 카드 주인이라 뺀다
  const rest = toks
    .filter((t) => !t.used)
    .map((t) => t.s.replace(/^[[(]+|[\])([]+$/g, "").replace(/[:：]$/, ""))
    .filter((s) => {
      if (!s) return false;
      const low = s.toLowerCase();
      if (NOISE.has(low) || NOISE.has(s)) return false;
      if (companyWords.has(s) || [...companyWords].some((w) => w.length >= 2 && s.startsWith(w) && /^(\d{4})?(승인|취소|체크|카드|은행)?\(?\d*\)?$/.test(s.slice(w.length)))) return false;
      if (/^[가-힣]\*[가-힣]?$|^[가-힣]{1,2}\*+[가-힣]{0,2}$/.test(s)) return false; // 홍*동
      if (/^\d+개월$|^\(?일시불\)?$|^\(?\d+개월\)?$/.test(s)) return false;
      if (/^[\d,.:/*-]+$/.test(s)) return false;
      if (/^(잔액|누적)/.test(s)) return false;
      if (/^(입금|출금|승인|취소)$/.test(s)) return false;
      return true;
    });
  const party = rest.join(" ").replace(/\s+/g, " ").trim().slice(0, 60) || null;

  return {
    ok: true,
    tx: { kind, company, digits, on, at, amountWon: amount, balanceWon: balance, party, memo: null, approvalNo },
  };
}

export const SMS_TEXT_KEYS = ["text", "message", "msg", "body", "content", "sms", "smsText", "message_body", "fullText"];

/** 전달 앱마다 다른 JSON 모양에서 문자 본문을 찾는다(안쪽 묶음까지) */
export function pickSmsText(v: unknown, depth = 0): string | null {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object" || depth > 3) return null;
  const o = v as Record<string, unknown>;
  for (const k of SMS_TEXT_KEYS) if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
  for (const k of Object.keys(o)) {
    const t = o[k] && typeof o[k] === "object" ? pickSmsText(o[k], depth + 1) : null;
    if (t) return t;
  }
  return null;
}
