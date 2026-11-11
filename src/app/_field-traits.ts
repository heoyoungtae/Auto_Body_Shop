// 칸 성격 — 입력 칸마다 '얼마나 넓게'와 '휴대폰에서 어떤 키패드'를 한곳에서 정한다.
// 화면에서 칸마다 inputMode·폭을 따로 적지 않아도 help 키만으로 같은 성격의 칸은 같은 모양·같은 키패드가 된다.
// 화면에서 직접 준 속성(inputMode·type·autoComplete 등)은 여기 값보다 우선한다.
//
// 키패드에 대해: 웹 페이지는 휴대폰 키보드를 숫자·전화·메일 배열로는 바꿀 수 있지만,
// '한글 ↔ 영문' 전환은 표준이 없어 강제할 수 없다. 그래서 영문만 쓰는 칸은 메일 배열(영문 배열로 열림)이나
// 대문자 자동·자동 고침 끄기로 돕고, 한글 칸은 자동 고침·영문 첫 글자 대문자 같은 방해만 끈다.
import type { FieldHelp } from "@/modules/help/fields";

/** 칸에 넣을 때 바로 고쳐 주는 형식 */
export type Shape = "phone" | "bizNo" | "upper" | "lower" | "numList";

export type Traits = {
  /** 칸 최대 폭(CSS). 좁은 화면에서는 칸이 화면 폭까지 줄어든다. 없으면 칸 전체 폭 */
  maxWidth?: string;
  /** 입력 요소에 줄 속성(키패드·자동 완성·자동 고침) */
  attrs: {
    type?: string;
    inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search" | "none";
    autoComplete?: string;
    autoCapitalize?: string;
    autoCorrect?: string;
    spellCheck?: boolean;
    enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  };
  shape?: Shape;
};

const em = (n: number) => `${Math.round(n * 10) / 10}em`;

/** 글자 수로 대략의 폭: 한글은 1em, 숫자·영문은 0.6em, 안쪽 여백 2em */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿○△×□■●]/.test(ch) ? 1 : 0.62;
  return w;
}

// ── 성격별 키 목록. 새 칸이 이름 규칙(…Phone, …bizNo 등)을 따르면 목록에 없어도 알아서 맞는다.
const PHONE = new Set(["sms.sender", "sms.optout", "sms.testTo", "gift.callback"]);
const BIZ_NO = new Set<string>([]);
const PERSON = new Set([
  "cust.name",
  "user.name",
  "staff.emName",
  "staff.emRelation",
  "shop.ceo",
  "approve.name",
  "dl.receiverName",
  "ro.signerName",
  "claim.adjusterName",
  "money.payerName",
  "sup.contactName",
  "sup.bankHolder",
]);
/** 영문·숫자로 된 번호: 대문자로 바꿔 넣는다 */
const CODE_UPPER = new Set([
  "veh.vin",
  "veh.color",
  "veh.generation",
  "work.colorCode",
  "est.partNo",
  "po.partNo",
  "po.lot",
  "sd.lot",
  "work.lot",
  "eqf.ncRef",
  "fx.expenseRef",
  "nc.revisionRef",
  "sg.revisionRef",
  "policy.revisionRequestNo",
  "delegation.revisionRequestNo",
  "docs.no",
  "docs.rev",
  "legal.stdRef",
  "staff.licNo",
]);
/** 번호지만 대소문자를 그대로 두는 칸(외부 기관 번호·인증 값) */
const CODE_KEEP = new Set([
  "claim.claimNo",
  "consult.claimNo",
  "po.invoiceNo",
  "waste.slipNo",
  "cal.certNo",
  "money.receiptNo",
  "exp.evidenceNo",
  "kakao.pfId",
  "kakao.code",
  "cal.apiKey",
]);
/** 쉼표로 구분한 숫자 여러 개(도막 두께 등) */
const NUM_LIST = new Set(["dmg.filmPanel", "dmg.filmAdjacent", "qc.filmUm"]);
/** 소수점이 있는 짧은 숫자 */
const DECIMAL = new Set(["qc.gapMm", "env.wasteKg", "waste.qty", "tr.hours", "tr.plannedHours", "goal.target"]);
/** 짧은 정수(연도·인원·금액을 글자 칸으로 받는 곳) */
const SHORT_INT: Record<string, number> = { "veh.year": 4, "tr.year": 4, "pay.family": 2, "pay.incomeTax": 10, "pay.extraAmount": 12 };

const off = { autoComplete: "off", autoCorrect: "off", spellCheck: false } as const;

/**
 * help 키·도움말·화면에서 준 type 으로 칸 성격을 정한다.
 * 순서: 키 목록 → 키 이름 규칙(phone·bizNo·email·loginId…) → type → 글자 수 상한·예시 길이.
 */
export function fieldTraits(key: string, h: FieldHelp, type?: string): Traits {
  const last = key.split(".").pop() ?? key;
  const example = h.example ?? "";
  const byExample = (min = 8) => em(Math.max(min, textEm(example) + 3));

  if (type === "time") return { maxWidth: "9em", attrs: {} };
  if (type === "month") return { maxWidth: "11em", attrs: {} };
  if (type === "date") return { maxWidth: "11em", attrs: {} };
  if (type === "password") return { maxWidth: "20em", attrs: { autoCapitalize: "none", ...off } };

  if (PHONE.has(key) || /phone$/i.test(last))
    return { maxWidth: "11em", attrs: { type: "tel", inputMode: "tel", ...off }, shape: "phone" };
  if (BIZ_NO.has(key) || /bizNo$/.test(last)) return { maxWidth: "10em", attrs: { inputMode: "numeric", ...off }, shape: "bizNo" };
  if (/bankAccount$/.test(last)) return { maxWidth: "14em", attrs: { inputMode: "numeric", ...off } };
  if (/email$/i.test(last) || type === "email")
    return { maxWidth: "22em", attrs: { type: "email", inputMode: "email", autoCapitalize: "none", ...off } };
  if (/loginId$/.test(last)) return { maxWidth: "16em", attrs: { inputMode: "email", autoCapitalize: "none", autoCorrect: "off", spellCheck: false }, shape: "lower" };
  if (key === "veh.plate") return { maxWidth: "10em", attrs: { ...off } };
  if (key === "veh.vin") return { maxWidth: "17em", attrs: { autoCapitalize: "characters", ...off }, shape: "upper" };
  if (/zip$/i.test(last)) return { maxWidth: "8em", attrs: { inputMode: "numeric", autoComplete: "off" } };
  if (key in SHORT_INT) {
    const n = SHORT_INT[key];
    return { maxWidth: em(Math.max(5, n * 0.62 + 3)), attrs: { inputMode: "numeric", autoComplete: "off" } };
  }
  if (DECIMAL.has(key)) return { maxWidth: "8em", attrs: { inputMode: "decimal", autoComplete: "off" } };
  if (NUM_LIST.has(key)) return { maxWidth: byExample(14), attrs: { inputMode: "decimal", autoComplete: "off" }, shape: "numList" };
  if (CODE_UPPER.has(key)) return { maxWidth: byExample(), attrs: { autoCapitalize: "characters", ...off }, shape: "upper" };
  if (CODE_KEEP.has(key)) return { maxWidth: key === "cal.apiKey" ? "28em" : byExample(10), attrs: { autoCapitalize: "none", ...off } };
  if (PERSON.has(key)) return { maxWidth: em(Math.max(10, Math.min(16, (h.maxLength ?? 20) * 0.6))), attrs: { ...off } };
  if (/(Time|time)$/.test(last)) return { maxWidth: "9em", attrs: {} };

  // 그 밖의 글자 칸: 글자 수 상한이 있으면 그에 맞추고, 없으면 예시 길이로. 긴 칸은 폭을 다 쓴다.
  const text = { autoComplete: "off" };
  const max = h.maxLength;
  if (max != null) {
    if (max <= 10) return { maxWidth: "9em", attrs: text };
    if (max <= 20) return { maxWidth: "13em", attrs: text };
    if (max <= 30) return { maxWidth: "17em", attrs: text };
    if (max <= 40) return { maxWidth: "22em", attrs: text };
    if (max <= 60) return { maxWidth: "30em", attrs: text };
    if (max <= 80) return { maxWidth: "36em", attrs: text };
    return { attrs: text };
  }
  const ex = textEm(example);
  if (!example) return { maxWidth: "36em", attrs: text };
  if (ex <= 8) return { maxWidth: "14em", attrs: text };
  if (ex <= 16) return { maxWidth: "24em", attrs: text };
  if (ex <= 28) return { maxWidth: "36em", attrs: text };
  return { attrs: text };
}

/** 숫자 칸 폭: 상한 자릿수, 없으면 금액 13em·그 밖 8em */
export function numberWidth(opts: { unit?: string; max?: number }): string {
  if (opts.max != null) return em(Math.max(6, opts.max.toLocaleString("ko-KR").length * 0.62 + 3));
  return opts.unit?.includes("원") ? "13em" : "8em";
}

/** 고르기 칸 폭: 가장 긴 보기 글자에 맞춘다(화살표 자리 포함) */
export function selectWidth(labels: string[]): string {
  const w = Math.max(6, ...labels.map(textEm));
  return em(Math.min(40, w + 3.5));
}

/** 여러 줄 칸 기본 줄 수: 글자 수 상한으로 */
export function textareaRows(maxLength?: number): number {
  if (maxLength == null) return 4;
  if (maxLength <= 120) return 2;
  if (maxLength <= 300) return 3;
  if (maxLength <= 1000) return 4;
  return 6;
}

// ── 넣는 동안 형식 맞추기 ──
const digitsOf = (s: string) => s.replace(/\D/g, "");

/** 전화번호에 붙임표: 010-1234-5678, 02-123-4567, 1588-1234, 080-123-4567 */
export function shapePhone(raw: string): string {
  const d = digitsOf(raw).slice(0, 12);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `02-${d.slice(2)}`;
    if (d.length <= 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
    return `02-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (/^1[5-9]/.test(d)) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
}

/** 사업자등록번호 123-45-67890 */
export function shapeBizNo(raw: string): string {
  const d = digitsOf(raw).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 숫자 여러 개: 점·띄어쓰기·쉼표를 모두 ', ' 로(휴대폰 숫자 키패드에는 쉼표가 없어 점으로 구분해도 되게) */
export function shapeNumList(raw: string): string {
  return raw.replace(/[^\d]+/g, ", ").replace(/^, /, "");
}

/**
 * 칸에 넣을 때 형식을 맞추고 커서 자리를 지킨다.
 * 지울 때 붙임표·쉼표 같은 구분자만 지워졌으면 그 앞 숫자를 지운다(구분자가 다시 생겨 지워지지 않는 일을 막음).
 */
export function applyShape(el: HTMLInputElement, shape: Shape, inputType: string, prev: string) {
  const v = el.value;
  const pos = el.selectionStart ?? v.length;
  if (shape === "upper" || shape === "lower") {
    const next = shape === "upper" ? v.toUpperCase() : v.toLowerCase();
    if (next !== v) {
      el.value = next;
      el.setSelectionRange(pos, pos);
    }
    return;
  }
  if (shape === "numList") {
    if (inputType.startsWith("delete")) return;
    const next = shapeNumList(v);
    if (next !== v) {
      const before = shapeNumList(v.slice(0, pos));
      el.value = next;
      el.setSelectionRange(before.length, before.length);
    }
    return;
  }
  // 전화·사업자번호: 숫자·붙임표·띄어쓰기 말고 다른 글자가 있으면 손대지 않는다
  if (/[^\d\-\s]/.test(v)) return;
  let digits = digitsOf(v);
  let caretDigits = digitsOf(v.slice(0, pos)).length;
  if (inputType === "deleteContentBackward" && digits === digitsOf(prev) && v.length < prev.length && caretDigits > 0) {
    digits = digits.slice(0, caretDigits - 1) + digits.slice(caretDigits);
    caretDigits -= 1;
  }
  const next = shape === "phone" ? shapePhone(digits) : shapeBizNo(digits);
  if (next === v) return;
  el.value = next;
  let seen = 0;
  let at = 0;
  while (at < next.length && seen < caretDigits) {
    if (/\d/.test(next[at])) seen++;
    at++;
  }
  el.setSelectionRange(at, at);
}
