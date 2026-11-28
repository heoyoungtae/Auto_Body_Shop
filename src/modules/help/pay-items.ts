// 임금명세서 줄마다 ? 도움말: 과세/비과세, 한도, 조건, 법적 근거(대표 요청 2026-11-28).
// 금액 한도는 정책값을 그대로 보여 준다(법이 바뀌면 정책값만 고치면 도움말도 바뀜).
// 근거 조문은 2026-11 기준 [확인 필요]: 세무사 검토 전.
import { allowanceTf, type PayLine, type SlipData } from "@/modules/staff/payroll-rules";

export type PayItemTax = {
  title: string;
  /** 과세 · 비과세 · 일부 비과세 · 공제 */
  tax: "과세" | "비과세" | "일부 비과세" | "조건부 비과세" | "공제";
  /** 한도(정책값 키가 있으면 화면에서 지금 값으로 채움) */
  limit?: string;
  limitKey?: string;
  when?: string[];
  basis: string;
  note?: string;
};

export const PAY_ITEM_TAX = {
  base: {
    title: "기본급",
    tax: "과세",
    basis: "소득세법 제20조(근로소득)",
    note: "생산직 연장수당 비과세를 따질 때 '월정액급여'에 들어갑니다. 4대 보험 보수에도 들어갑니다.",
  },
  allowance: {
    title: "고정 수당(직책·자격·기술·교통비 등)",
    tax: "과세",
    basis: "소득세법 제20조(근로소득)",
    note: "이름이 식대·자가운전·보육이 아니면 과세입니다. 출퇴근 교통비, 차 없는 직원의 차량비도 과세입니다. 월정액급여에 들어갑니다.",
  },
  meal: {
    title: "식대",
    tax: "조건부 비과세",
    limit: "직원 1명당 월 {v}(식대 이름의 수당이 여러 줄이어도 합쳐서)",
    limitKey: "tax.meal_exempt",
    when: ["회사가 식사를 현물로 주지 않을 것(점심을 주면 식대는 전액 과세, 현물로 준 식사는 비과세)", "급여 화면 '비과세 조건 확인'에 체크"],
    basis: "소득세법 제12조 제3호 거목, 시행령 제17조의2",
    note: "한도를 넘는 금액은 과세합니다. 비과세분은 4대 보험 보수에서도 빠집니다.",
  },
  car: {
    title: "자가운전보조금",
    tax: "조건부 비과세",
    limit: "월 {v}",
    limitKey: "tax.car_exempt",
    when: [
      "직원 본인(배우자 공동 포함) 명의로 소유하거나 빌린 차를 직원이 직접 운전",
      "그 차를 회사 업무(부품 수령·출장 등)에 씀",
      "그 업무의 교통비를 실제 여비로 따로 받지 않음(받으면 보조금은 과세)",
      "급여 화면 '비과세 조건 확인'에 체크",
    ],
    basis: "소득세법 제12조 제3호, 시행령 제12조 제3호",
    note: "출퇴근 교통비 보조는 과세입니다. 회사 차를 쓰는 직원에게 주면 과세입니다.",
  },
  childcare: {
    title: "출산·보육수당",
    tax: "조건부 비과세",
    limit: "직원 1명당 월 {v}(자녀 수와 상관없이)",
    limitKey: "tax.childcare_exempt",
    when: ["직원이나 배우자가 출산했거나 6세 이하(그 해 1월 1일 기준) 자녀가 있음", "급여 화면 '비과세 조건 확인'에 체크"],
    basis: "소득세법 제12조 제3호 머목",
    note: "2026년 세제개편안(2027년 지급분부터)에 위탁아동 보육수당을 넣는 내용이 있습니다. 국회 통과 여부 확인 필요.",
  },
  fixot: {
    title: "고정 연장근로수당",
    tax: "일부 비과세",
    limit: "생산직 연장·야간·휴일 수당과 합쳐 연 {v}",
    limitKey: "tax.ot_exempt_annual",
    when: [
      "생산직(판금·도장·정비 같은 현장 기능직)으로 표시",
      "월정액급여가 정책값 기준 이하, 지난해 총급여가 정책값 기준 이하",
      "그 달 실제 인정된 평일 연장시간분(통상시급 × 인정 시간 × 1.5)까지만 비과세",
    ],
    basis: "소득세법 제12조 제3호 나목, 시행령 제17조, 국세청 해석(실제 연장 여부와 관계없이 정액으로 주는 시간외수당은 비과세 아님)",
    note: "덜 일한 달에 보장해 준 나머지는 연장근로를 하여 받은 급여가 아니라서 과세하고, 월정액급여 판정에도 넣습니다(앱이 안전한 쪽으로 판단, 세무사 확인 필요). 인정 시간은 승인된 연장 시각과 실제 출퇴근이 겹친 시간입니다.",
  },
  ot: {
    title: "연장근로수당·연장수당 차액",
    tax: "조건부 비과세",
    limit: "생산직은 연장·야간·휴일 수당 합쳐 연 {v}",
    limitKey: "tax.ot_exempt_annual",
    when: ["생산직으로 표시", "월정액급여가 정책값 기준 이하", "지난해 총급여가 정책값 기준 이하"],
    basis: "소득세법 제12조 제3호 나목, 시행령 제17조, 시행규칙 별표 2(생산직 직종)",
    note: "사무·상담·영업 직원은 과세입니다. 고정 연장근로수당을 넘어 더 준 차액은 실제 근로분이라 비과세 대상입니다.",
  },
  hol: {
    title: "휴일근로수당",
    tax: "조건부 비과세",
    limit: "생산직은 연장·야간·휴일 수당 합쳐 연 {v}",
    limitKey: "tax.ot_exempt_annual",
    when: ["생산직으로 표시", "월정액급여·지난해 총급여 조건을 맞춤"],
    basis: "소득세법 제12조 제3호 나목, 시행령 제17조",
  },
  night: {
    title: "야간근로 가산",
    tax: "조건부 비과세",
    limit: "생산직은 연장·야간·휴일 수당 합쳐 연 {v}",
    limitKey: "tax.ot_exempt_annual",
    when: ["생산직으로 표시", "월정액급여·지난해 총급여 조건을 맞춤"],
    basis: "소득세법 제12조 제3호 나목, 시행령 제17조",
  },
  leave: {
    title: "미사용 연차수당",
    tax: "과세",
    basis: "소득세법 제20조(근로소득)",
    note: "연장근로수당이 아니라서 생산직 비과세가 없습니다.",
  },
  absent: {
    title: "결근·지각 등 공제(지급 줄의 빼기)",
    tax: "과세",
    basis: "근로기준법 제43조(전액 지급)",
    note: "과세 급여에서 그만큼 빠집니다.",
  },
  birth: {
    title: "출산지원금",
    tax: "비과세",
    limit: "금액 한도 없음(같은 출산에 2번까지)",
    when: ["자녀 출생일 뒤 2년 안에 지급", "회사 공통 지급 기준으로 지급", "대표의 친족 등 특수관계인 직원은 해당 없음"],
    basis: "소득세법 제12조 제3호 모목(2024년 지급분부터)",
    note: "2026년 세제개편안(2027년 지급분부터)에 임신 중 지급분도 넣는 내용이 있습니다. 국회 통과 여부 확인 필요.",
  },
  condolence: {
    title: "직원 경조금",
    tax: "조건부 비과세",
    limit: "사회통념상 알맞은 금액(앱의 직원 경조금 기준표)",
    basis: "소득세법 시행규칙 제10조",
    note: "기준표보다 훨씬 많으면 넘는 부분은 과세로 바꾸세요.",
  },
  duty: {
    title: "숙직·일직료",
    tax: "조건부 비과세",
    limit: "사규로 정한 실비 정도",
    basis: "소득세법 시행령 제12조 제3호",
  },
  travel: {
    title: "출장 여비",
    tax: "조건부 비과세",
    limit: "실제 든 비용(영수증·사규 기준)",
    when: ["업무 출장의 교통·숙박비를 정산한 금액"],
    basis: "소득세법 시행령 제12조 제3호",
    note: "출퇴근 교통비, 정액으로 매달 주는 교통비는 과세입니다. 보통은 급여가 아니라 지출결의(출장교통 계정)로 처리합니다.",
  },
  groupIns: {
    title: "단체 보장성보험료(현물)",
    tax: "조건부 비과세",
    limit: "연 {v}",
    limitKey: "tax.group_ins_exempt",
    when: ["직원이나 가족이 보험금을 받는 단체 순수·환급부 보장성보험"],
    basis: "소득세법 제12조 제3호, 시행령 제17조의4",
    note: "돈으로 주는 게 아니라서 같은 금액을 공제 줄로 빼 실수령은 그대로입니다. 한도 안이면 급여에 넣지 않아도 됩니다.",
  },
  discount: {
    title: "직원 할인(현물)",
    tax: "조건부 비과세",
    limit: "연 {v} 또는 시가의 20% 중 큰 금액",
    limitKey: "tax.discount_exempt",
    when: ["회사가 하는 수리를 직원 본인 차에 할인해 줌", "모든 직원에게 같은 기준으로 할인"],
    basis: "소득세법 제12조 제3호(종업원 할인, 2025년 지급분부터)",
    note: "한도를 넘는 할인 금액만 과세 급여입니다. 돈으로 주지 않아서 같은 금액을 공제 줄로 뺍니다.",
  },
  other: {
    title: "기타 비과세",
    tax: "비과세",
    basis: "소득세법 제12조(비과세소득)에 정한 것만",
    note: "법에 없는 항목을 비과세로 넣으면 나중에 추징될 수 있습니다. 세무사에게 확인하세요.",
  },
  extraPay: {
    title: "기타 지급(성과급·포상금 등)",
    tax: "과세",
    basis: "소득세법 제20조(근로소득)",
    note: "부정기 지급이라 월정액급여에는 들어가지 않습니다.",
  },
  pension: { title: "국민연금", tax: "공제", basis: "국민연금법 제88조", note: "비과세를 뺀 보수로 계산합니다(상·하한 있음)." },
  health: { title: "건강보험", tax: "공제", basis: "국민건강보험법 제69조·제70조", note: "비과세를 뺀 보수로 계산합니다." },
  ltc: { title: "장기요양보험", tax: "공제", basis: "노인장기요양보험법 제9조", note: "건강보험료에 비율을 곱합니다." },
  employment: { title: "고용보험", tax: "공제", basis: "보험료징수법 제13조", note: "비과세를 뺀 보수로 계산합니다." },
  income_tax: { title: "소득세", tax: "공제", basis: "소득세법 제134조, 시행령 별표 2(근로소득 간이세액표)", note: "비과세를 뺀 과세 급여로 계산합니다." },
  local_tax: { title: "지방소득세", tax: "공제", basis: "지방세법 제103조의13", note: "소득세의 10%." },
  inkind: { title: "현물로 받음", tax: "공제", basis: "앱 계산 방식", note: "단체보험·직원 할인처럼 돈으로 주지 않은 금액을 실수령에서 뺍니다." },
  extraDeduct: { title: "기타 공제", tax: "공제", basis: "근로기준법 제43조(법령·단체협약에 정한 것 외 공제는 직원 동의 필요)" },
} satisfies Record<string, PayItemTax>;
export type PayItemKey = keyof typeof PAY_ITEM_TAX;
export const isPayItemKey = (s: string): s is PayItemKey => s in PAY_ITEM_TAX;

/** 명세서 한 줄이 어떤 도움말인지 */
export function payItemKey(p: PayLine, d: Pick<SlipData, "extras">, side: "pay" | "deduct"): PayItemKey {
  if (side === "deduct") {
    if (p.code === "extra") return "extraDeduct";
    return isPayItemKey(p.code) ? p.code : "extraDeduct";
  }
  if (p.code.startsWith("fix:")) return allowanceTf(p.name) ?? "allowance";
  if (p.code === "short") return "absent";
  if (p.code === "extra") {
    const e = d.extras.find((x) => x.kind === "pay" && x.name === p.name);
    if (e?.tf) return e.tf;
    return e?.taxable === false ? "other" : "extraPay";
  }
  return isPayItemKey(p.code) ? p.code : "extraPay";
}

/** 도움말 한도에 채울 정책값만 골라 낸다 */
export function payLimits(pol: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const h of Object.values(PAY_ITEM_TAX) as PayItemTax[]) if (h.limitKey && pol[h.limitKey] != null) out[h.limitKey] = pol[h.limitKey];
  return out;
}
