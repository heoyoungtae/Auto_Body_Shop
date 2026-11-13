// 통장·카드 연동의 규칙(순수 함수): 은행·카드사 이름, 거래 종류·분류, 금액·날짜 읽기, 같은 거래 판단.

export const BANKS = {
  kb: { label: "KB국민은행", keys: ["KB국민", "국민은행", "[KB]", "KB"] },
  shinhan: { label: "신한은행", keys: ["신한"] },
  woori: { label: "우리은행", keys: ["우리"] },
  hana: { label: "하나은행", keys: ["하나"] },
  nh: { label: "NH농협은행", keys: ["농협", "NH"] },
  ibk: { label: "IBK기업은행", keys: ["기업", "IBK"] },
  sc: { label: "SC제일은행", keys: ["SC제일", "제일"] },
  citi: { label: "한국씨티은행", keys: ["씨티"] },
  kakao: { label: "카카오뱅크", keys: ["카카오뱅크", "카뱅"] },
  toss: { label: "토스뱅크", keys: ["토스뱅크", "토스"] },
  kbank: { label: "케이뱅크", keys: ["케이뱅크", "K뱅크"] },
  mg: { label: "새마을금고", keys: ["새마을", "MG"] },
  cu: { label: "신협", keys: ["신협"] },
  post: { label: "우체국", keys: ["우체국"] },
  suhyup: { label: "수협", keys: ["수협"] },
  busan: { label: "부산은행", keys: ["부산"] },
  im: { label: "iM뱅크(대구)", keys: ["iM뱅크", "대구"] },
  kn: { label: "경남은행", keys: ["경남"] },
  kj: { label: "광주은행", keys: ["광주"] },
  jb: { label: "전북은행", keys: ["전북"] },
  jeju: { label: "제주은행", keys: ["제주"] },
  kdb: { label: "KDB산업은행", keys: ["산업은행", "KDB"] },
} as const;

export const CARDS = {
  shinhan_card: { label: "신한카드", keys: ["신한카드", "신한체크"] },
  samsung_card: { label: "삼성카드", keys: ["삼성카드", "삼성"] },
  hyundai_card: { label: "현대카드", keys: ["현대카드", "현대"] },
  kb_card: { label: "KB국민카드", keys: ["KB국민카드", "국민카드", "KB카드", "KB국민체크", "KB국민"] },
  lotte_card: { label: "롯데카드", keys: ["롯데카드", "롯데"] },
  woori_card: { label: "우리카드", keys: ["우리카드", "우리체크", "우리"] },
  hana_card: { label: "하나카드", keys: ["하나카드", "하나체크", "하나"] },
  bc_card: { label: "BC카드", keys: ["BC카드", "비씨카드", "BC", "비씨"] },
  nh_card: { label: "NH농협카드", keys: ["NH농협카드", "농협카드", "NH카드", "NH체크", "농협체크", "농협", "NH"] },
  ibk_card: { label: "IBK기업카드", keys: ["IBK카드", "기업카드", "IBK"] },
  citi_card: { label: "씨티카드", keys: ["씨티카드", "씨티"] },
  kakao_card: { label: "카카오뱅크카드", keys: ["카카오뱅크카드", "카카오뱅크"] },
} as const;

export type BankCo = keyof typeof BANKS;
export type CardCo = keyof typeof CARDS;
export type Company = BankCo | CardCo;
export const companyLabel = (c: string) => (BANKS as Record<string, { label: string }>)[c]?.label ?? (CARDS as Record<string, { label: string }>)[c]?.label ?? c;
export const isBankCo = (c: string): c is BankCo => c in BANKS;
export const isCardCo = (c: string): c is CardCo => c in CARDS;

/** 등록한 통장·카드 */
export type FeedAccount = {
  id: string;
  kind: "bank" | "card";
  company: Company;
  /** 부르는 이름(예: 사업용 기업은행, 법인카드 1) */
  name: string;
  /** 문자·엑셀에 보이는 번호 끝자리(3~4자리). 비우면 이 회사 문자는 모두 이 계좌·카드로 본다 */
  digits: string;
  /** 카드 대금 빠지는 날(카드만) */
  payDay: number | null;
  /** 문자 받기(꺼 두면 엑셀로만 넣음) */
  sms: boolean;
};
export const accountLabel = (a: FeedAccount) => `${a.name || companyLabel(a.company)}${a.digits ? ` (${a.digits})` : ""}`;

export const TX_KINDS = {
  in: "입금",
  out: "출금",
  card: "카드 승인",
  card_cancel: "카드 취소",
  tax_sale: "매출 세금계산서",
  tax_buy: "매입 세금계산서",
  cash_sale: "현금영수증 매출",
  cash_buy: "현금영수증 매입",
  card_buy: "사업용 카드 매입(홈택스)",
} as const;
export type TxKind = keyof typeof TX_KINDS;
export const isTxKind = (s: string): s is TxKind => s in TX_KINDS;
export const HOMETAX_KINDS: TxKind[] = ["tax_sale", "tax_buy", "cash_sale", "cash_buy", "card_buy"];
export const isHometax = (k: string) => (HOMETAX_KINDS as string[]).includes(k);
/** 돈이 들어오는 쪽인가(현금흐름 표시용) */
export const isInflow = (k: string) => k === "in";
export const isOutflow = (k: string) => k === "out";

/** 전표가 없는 돈의 분류. 현금흐름표(보고서 센터)에서 이 이름으로 묶는다 */
export const TX_CLASSES = {
  self: { label: "내 계좌끼리 옮김", flow: "제외" },
  card_bill: { label: "카드 대금 결제", flow: "영업" },
  tax: { label: "세금 납부·환급", flow: "영업" },
  social: { label: "4대보험료", flow: "영업" },
  loan: { label: "대출 받음·갚음", flow: "재무" },
  interest: { label: "이자", flow: "영업" },
  fee: { label: "은행 수수료", flow: "영업" },
  owner: { label: "대표 출자·인출", flow: "재무" },
  refund: { label: "환불·반품 돈", flow: "영업" },
  asset: { label: "설비·차량 사고팖", flow: "투자" },
  other: { label: "기타(메모에 사유)", flow: "영업" },
  personal: { label: "사업과 무관(개인 거래, 빼기)", flow: "제외" },
} as const;
export type TxClass = keyof typeof TX_CLASSES;
export const isTxClass = (s: string): s is TxClass => s in TX_CLASSES;

/** 상대방 이름으로 저절로 분류할 수 있는 출금·입금(틀리면 사람이 바꿈) */
const AUTO_CLASS: { cls: TxClass; kinds: string[]; words: string[] }[] = [
  { cls: "card_bill", kinds: ["out"], words: ["카드대금", "카드결제", "신한카드", "삼성카드", "현대카드", "국민카드", "롯데카드", "우리카드", "하나카드", "비씨카드", "BC카드", "농협카드"] },
  { cls: "social", kinds: ["out"], words: ["국민연금", "건강보험", "고용보험", "산재보험", "근로복지공단", "국민건강"] },
  { cls: "tax", kinds: ["out", "in"], words: ["국세", "세무서", "지방세", "부가세", "원천세", "종합소득", "법인세", "위택스", "국세환급"] },
  { cls: "interest", kinds: ["in", "out"], words: ["이자", "결산이자", "예금이자"] },
  { cls: "fee", kinds: ["out"], words: ["수수료", "이체수수료", "CMS수수료"] },
  { cls: "loan", kinds: ["out", "in"], words: ["대출원리금", "대출이자", "대출금", "원리금"] },
];
export function autoClass(kind: string, party: string | null, memo: string | null): TxClass | null {
  const t = `${party ?? ""} ${memo ?? ""}`.replace(/\s/g, "");
  if (!t) return null;
  for (const r of AUTO_CLASS) if (r.kinds.includes(kind) && r.words.some((w) => t.includes(w))) return r.cls;
  return null;
}

/** "1,234,567원" "-45,000" "(45,000)" → 정수. 읽을 수 없으면 null */
export function parseWon(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[원₩\s,]/g, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return neg ? -n : n;
}

const pad = (n: number | string) => String(n).padStart(2, "0");
const validYmd = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;

/** 엑셀 날짜 일련번호(1900 체계) → YYYY-MM-DD, 시:분 */
export function excelSerial(n: number): { on: string; at: string | null } | null {
  if (!(n > 20000 && n < 80000)) return null;
  const ms = Math.round((n - 25569) * 864e5);
  const d = new Date(ms);
  const on = d.toISOString().slice(0, 10);
  const frac = n - Math.floor(n);
  return { on, at: frac > 0.0001 ? d.toISOString().slice(11, 16) : null };
}

/**
 * 날짜(시간 함께 있어도 됨) 읽기: 2026-11-13, 2026.11.13, 2026/11/13, 20261113, 26.11.13, 2026년 11월 13일, 엑셀 일련번호.
 * 연도 없는 11/13 은 base(받은 날) 기준으로 연도를 붙인다(받은 날보다 한 달 넘게 뒤면 작년).
 */
export function parseDateTime(v: unknown, base?: string): { on: string; at: string | null } | null {
  if (typeof v === "number") return excelSerial(v);
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerial(Number(s));
  const time = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s);
  const at = time ? `${pad(time[1])}:${time[2]}` : null;
  let m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s);
  if (m && validYmd(+m[1], +m[2], +m[3])) return { on: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, at };
  m = /^(\d{4})(\d{2})(\d{2})(?:\s|$|\d)/.exec(s);
  if (m && validYmd(+m[1], +m[2], +m[3])) {
    const t = /^\d{8}\s*(\d{2}):?(\d{2})/.exec(s) ?? /^\d{8}(\d{2})(\d{2})/.exec(s);
    return { on: `${m[1]}-${m[2]}-${m[3]}`, at: at ?? (t ? `${t[1]}:${t[2]}` : null) };
  }
  m = /^(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/.exec(s);
  if (m && validYmd(2000 + +m[1], +m[2], +m[3])) return { on: `20${m[1]}-${pad(m[2])}-${pad(m[3])}`, at };
  m = /(?<!\d)(\d{1,2})[/.-](\d{1,2})(?![\d/.-])/.exec(s) ?? /(\d{1,2})월\s*(\d{1,2})일/.exec(s);
  if (m && base) {
    const mo = +m[1];
    const d = +m[2];
    let y = +base.slice(0, 4);
    if (!validYmd(y, mo, d)) return null;
    if (`${y}-${pad(mo)}-${pad(d)}` > addDaysIso(base, 31)) y -= 1;
    return { on: `${y}-${pad(mo)}-${pad(d)}`, at };
  }
  return null;
}

export function addDaysIso(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
}
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** 같은 거래인가(문자로 온 것과 엑셀로 올린 것이 겹칠 때). 날짜·종류·금액이 같고, 둘 다 가진 구별 값(잔액·승인번호·시각)이 다르지 않아야 한다 */
export type TxKey = { kind: string; accountId: string | null; on: string; amountWon: number; balanceWon: number | null; approvalNo: string | null; at: string | null };
export function sameTx(a: TxKey, b: TxKey): boolean {
  if (a.kind !== b.kind || a.on !== b.on || a.amountWon !== b.amountWon) return false;
  if (a.accountId && b.accountId && a.accountId !== b.accountId) return false;
  if (a.approvalNo && b.approvalNo) return a.approvalNo.replace(/\D/g, "") === b.approvalNo.replace(/\D/g, "");
  if (a.balanceWon != null && b.balanceWon != null) return a.balanceWon === b.balanceWon;
  if (a.at && b.at) return a.at === b.at;
  return true;
}

/** 이름 비교용: 공백·(주)·주식회사·괄호 빼고 */
export function normName(s: string | null | undefined) {
  return (s ?? "")
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|\s|[()[\]·.,-]/g, "")
    .toLowerCase();
}
/** 한쪽 이름이 다른 쪽에 들어 있나(은행 문자는 이름을 잘라 보냄: 삼성화재해상보험 → 삼성화재해) */
export function nameLike(a: string | null | undefined, b: string | null | undefined) {
  const x = normName(a);
  const y = normName(b);
  if (x.length < 2 || y.length < 2) return false;
  return x.includes(y) || y.includes(x) || (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4));
}

/** 사업자등록번호 숫자만 */
export const bizDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
