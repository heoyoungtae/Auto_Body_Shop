// 정책값 분류(2026-11-22 대표 결정): 92개 정책값을 업무 분야 9개로 묶고, 법정 값에는 근거 조문을 붙인다.
// 법정 값은 법령이 바뀌면 근거 조문에서 숫자를 읽어 '새 값 후보'로 올리고(law-watch), 대표가 한 번 눌러 적용한다(완전 자동 적용은 하지 않음).
import { POLICY_KEYS, type PolicyKey } from "./policy";

export const POLICY_GROUPS = {
  work: "고객·수리 업무",
  quality: "품질·고객 만족",
  purchase: "구매·재고·협력업체",
  asset: "자산·설비",
  money: "돈·회계",
  tax: "세무 한도",
  payroll: "급여·4대보험·복리후생",
  safety: "안전·환경·법규",
  security: "보안·계정",
  simple: "간소화",
} as const;
export type PolicyGroup = keyof typeof POLICY_GROUPS;
export const isPolicyGroup = (s: string): s is PolicyGroup => s in POLICY_GROUPS;

const BY_PREFIX: Record<string, PolicyGroup> = {
  consult: "work", intake: "work", diagnosis: "work", estimate: "work", inspect: "work", delivery: "work", warranty: "work", insurance: "work", lube: "work", pm: "work",
  survey: "quality", complaint: "quality", nc: "quality", calibration: "quality", five_s: "quality", proposal: "quality",
  stock: "purchase", supplier: "purchase",
  asset: "asset",
  money: "money",
  tax: "tax",
  payroll: "payroll", wage: "payroll", ins: "payroll", welfare: "payroll", work: "payroll", hr: "payroll", leave: "payroll", competency: "payroll",
  risk: "safety", legal: "safety", waste: "safety", env: "safety",
  auth: "security",
  simple: "simple",
};
/** 접두어와 다른 분류로 가는 값 */
const BY_KEY: Partial<Record<PolicyKey, PolicyGroup>> = {
  "money.event_client_max": "tax",
  "money.entertain_base": "tax",
  "money.entertain_alert_pct": "tax",
  "tax.table_pension_rate": "payroll",
  "tax.table_pension_cap": "payroll",
  "tax.table_pension_floor": "payroll",
  "tax.child_one": "payroll",
  "tax.child_two": "payroll",
  "tax.child_more": "payroll",
};
export const policyGroup = (k: PolicyKey): PolicyGroup => BY_KEY[k] ?? BY_PREFIX[k.split(".")[0]] ?? "work";
export const keysOfGroup = (g: PolicyGroup) => POLICY_KEYS.filter((k) => policyGroup(k) === g);

/**
 * 법정 값의 근거. law 는 법제처 법령명, jo 는 조 번호("41", "17의2"), pick 은 조문 글에서 숫자를 읽는 정규식(첫 괄호가 금액·숫자).
 * pick 이 없으면 숫자를 자동으로 읽지 않고 '직접 확인' 할 일만 올린다. 정규식은 2026년 조문 기준 [확인 필요].
 * via: "law" 법령 조문 · "notice" 고시(매년 12월 확인) · "auto" 앱이 따로 자동 갱신(최저임금)
 */
export type LegalBasis = { law: string; jo?: string; article: string; via: "law" | "notice" | "auto"; pick?: RegExp; unit?: "won" | "pct" };
export const LEGAL_BASIS: Partial<Record<PolicyKey, LegalBasis>> = {
  "money.event_client_max": { law: "법인세법 시행령", jo: "41", article: "법인세법 시행령 제41조 제1항(경조금 20만원)", via: "law", pick: /경조금[^.]{0,120}?(\d[\d천백,]*만\s*원)/, unit: "won" },
  "money.entertain_base": { law: "법인세법", jo: "25", article: "법인세법 제25조 제4항(기본 한도, 중소기업)", via: "law", pick: /중소기업[^)]{0,30}?(\d[\d천백,]*만\s*원)/, unit: "won" },
  "tax.simple_receipt_max": { law: "법인세법 시행령", jo: "158", article: "법인세법 시행령 제158조(적격증빙, 3만원)", via: "law", pick: /(\d[\d천백,]*만\s*원)\s*(?:을|를)?\s*초과/, unit: "won" },
  "tax.cash_receipt_must": { law: "소득세법", jo: "162의3", article: "소득세법 제162조의3 제4항(건당 10만원 이상)", via: "law", pick: /건당[^.]{0,60}?(\d[\d천백,]*만\s*원)\s*이상/, unit: "won" },
  "tax.car_expense_cap": { law: "법인세법 시행령", jo: "50의2", article: "법인세법 시행령 제50조의2(운행기록 없을 때 1,500만원)", via: "law", pick: /(\d[\d천백,]*만\s*원)\s*(?:을|를)?\s*(?:한도|초과)/, unit: "won" },
  "tax.car_dep_cap": { law: "법인세법", jo: "27의2", article: "법인세법 제27조의2 제3항(감가상각비 800만원)", via: "law", pick: /(\d[\d천백,]*만\s*원)\s*(?:을|를)?\s*초과/, unit: "won" },
  // 식대 월 20만원은 법률 본문(제12조 제3호 거목)에 있다. 시행령 제17조의2는 '식사 기타 음식물'의 범위만 정함
  "tax.meal_exempt": { law: "소득세법", jo: "12", article: "소득세법 제12조 제3호 거목(식사대 월 20만원), 시행령 제17조의2", via: "law", pick: /월\s*(\d[\d천백,]*만\s*원)\s*이하의\s*식사/, unit: "won" },
  "tax.car_exempt": { law: "소득세법 시행령", jo: "12", article: "소득세법 시행령 제12조 제3호(자가운전보조금)", via: "law", pick: /자기차량[^.]{0,200}?월\s*(\d[\d천백,]*만\s*원)\s*이내/, unit: "won" },
  "tax.childcare_exempt": { law: "소득세법", jo: "12", article: "소득세법 제12조 제3호 머목(출산·6세 이하 보육수당)", via: "law", pick: /6세\s*이하[^.]{0,120}?월\s*(\d[\d천백,]*만\s*원)\s*이내/, unit: "won" },
  "tax.ot_exempt_pay_cap": { law: "소득세법 시행령", jo: "17", article: "소득세법 시행령 제17조 제1항(생산직 연장근로 비과세 월정액급여)", via: "law", pick: /월정액급여[^.]{0,40}?(\d[\d천백,]*만\s*원)\s*이하/, unit: "won" },
  "tax.ot_exempt_prev_gross": { law: "소득세법 시행령", jo: "17", article: "소득세법 시행령 제17조 제1항(직전 과세기간 총급여액)", via: "law", pick: /직전\s*과세기간[^.]{0,40}?총급여액[^.]{0,10}?(\d[\d천백,]*만\s*원)\s*이하/, unit: "won" },
  // 연 240만원은 시행령 제17조 제2항(법 제12조 제3호 나목이 '대통령령으로 정하는 금액'으로 넘김) [확인 필요]
  "tax.ot_exempt_annual": { law: "소득세법 시행령", jo: "17", article: "소득세법 제12조 제3호 나목, 시행령 제17조 제2항(연장근로 연 240만원)", via: "law", pick: /연\s*(\d[\d천백,]*만\s*원)\s*(?:이하|이내|을\s*한도|를\s*한도)/, unit: "won" },
  "tax.group_ins_exempt": { law: "소득세법 시행령", jo: "17의4", article: "소득세법 제12조 제3호, 시행령 제17조의4(단체 보장성보험료 연 70만원)", via: "law", pick: /보장성보험[^.]{0,80}?연\s*(\d[\d천백,]*만\s*원)\s*이하/, unit: "won" },
  "tax.discount_exempt": { law: "소득세법", jo: "12", article: "소득세법 제12조 제3호(종업원 할인 금액, 시가 20%와 연 240만원 중 큰 금액, 2025년 지급분부터)", via: "law", pick: /할인[^.]{0,200}?연\s*(\d[\d천백,]*만\s*원)/, unit: "won" },
  "asset.immediate_max": { law: "법인세법 시행령", jo: "31", article: "법인세법 시행령 제31조 제4항(소액 자산 즉시 비용)", via: "law", pick: /거래단위별로[^.]{0,60}?(\d[\d천백,]*만\s*원)\s*이하/, unit: "won" },
  "wage.minimum_hourly": { law: "최저임금 고시", article: "고용노동부 최저임금 고시(매년 8월)", via: "auto" },
  "ins.pension_rate": { law: "국민연금법", article: "국민연금법 제88조(보험료율)", via: "notice" },
  "ins.pension_cap": { law: "국민연금법 시행령", article: "국민연금법 시행령 제5조(기준소득월액 상한, 매년 7월 고시)", via: "notice" },
  "ins.pension_floor": { law: "국민연금법 시행령", article: "국민연금법 시행령 제5조(기준소득월액 하한, 매년 7월 고시)", via: "notice" },
  "ins.health_rate": { law: "국민건강보험법 시행령", article: "국민건강보험법 시행령 제44조(보험료율)", via: "notice" },
  "ins.ltc_ratio": { law: "노인장기요양보험법 시행령", article: "노인장기요양보험법 시행령 제4조(장기요양보험료율)", via: "notice" },
  "ins.employment_rate": { law: "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령", article: "보험료징수법 시행령 제12조(고용보험료율)", via: "notice" },
  "ins.employment_employer_rate": { law: "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령", article: "보험료징수법 시행령 제12조(고용안정·직업능력개발 사업 요율)", via: "notice" },
  "ins.accident_rate": { law: "산재보험료율 고시", article: "고용노동부 산재보험료율 고시(매년 12월)", via: "notice" },
  "ins.durunuri_pay_cap": { law: "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령", article: "두루누리 지원 기준 보수(매년 고시)", via: "notice" },
};
export const isLegal = (k: PolicyKey) => k in LEGAL_BASIS;
export const lawLink = (law: string) => `https://www.law.go.kr/법령/${encodeURIComponent(law.replace(/\s+/g, ""))}`;

/** "3천600만원"·"20만 원"·"1,500만원" → 원. 못 읽으면 null */
export function parseKoWon(s: string): number | null {
  const m = s.replace(/[\s,]/g, "").match(/^(?:(\d+)천)?(?:(\d+)백)?(\d*)만원$/);
  if (!m) return null;
  const man = Number(m[1] ?? 0) * 1000 + Number(m[2] ?? 0) * 100 + Number(m[3] || 0);
  return man > 0 ? man * 10_000 : null;
}

/** 조문 글에서 그 정책값의 숫자를 읽는다. 못 읽으면 null */
export function pickValue(key: PolicyKey, text: string): number | null {
  const b = LEGAL_BASIS[key];
  if (!b?.pick) return null;
  const m = text.match(b.pick);
  if (!m?.[1]) return null;
  return b.unit === "won" ? parseKoWon(m[1]) : Number(m[1]);
}
