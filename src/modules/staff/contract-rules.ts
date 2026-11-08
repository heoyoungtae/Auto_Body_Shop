// 근로계약서(F-11-01, 고용노동부 표준근로계약서 기준)와 정보보호 서약서(F-13-02)·퇴직 비밀유지 확인서(F-13-03) 규칙.
// 화면과 서버가 같이 쓴다(DB 없음). 법 근거: 근로기준법 제17조(서면 명시·교부), 제50조(40시간), 제54조(휴게),
// 제55조(주휴), 최저임금법 제6조, 기간제법 제4조(2년)·제6조(단시간 초과근로 가산).

export const DOC_KINDS = {
  contract: { label: "근로계약서", form: "F-11-01" },
  pledge_join: { label: "정보보호·비밀유지 서약서", form: "F-13-02" },
  pledge_leave: { label: "퇴직 비밀유지 확인서", form: "F-13-03" },
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const isDocKind = (s: string): s is DocKind => s in DOC_KINDS;

export const DOC_STATUS = { draft: "작성 중", ready: "서명 대기", signed: "서명 완료", cancelled: "취소" } as const;

export const CONTRACT_TYPES = {
  regular: "기간의 정함이 없는 근로자(정규직)",
  fixed: "기간의 정함이 있는 근로자(기간제)",
  part: "단시간 근로자",
} as const;
export type ContractType = keyof typeof CONTRACT_TYPES;

export const PAY_TYPES = { monthly: "월급", hourly: "시급" } as const;
export const PAY_METHODS = { account: "근로자 명의 예금통장에 입금", direct: "근로자에게 직접 지급" } as const;
export const INSURANCES = { employment: "고용보험", accident: "산재보험", pension: "국민연금", health: "건강보험" } as const;
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type Allowance = { name: string; amount: number };
export type ContractTerms = {
  contractType: ContractType;
  startOn: string;
  endOn: string;
  place: string;
  duties: string;
  workDays: number[];
  workStart: string;
  workEnd: string;
  breakStart: string;
  breakEnd: string;
  holiday: number;
  payType: keyof typeof PAY_TYPES;
  basePay: number;
  allowances: Allowance[];
  bonus: string;
  payDay: number;
  payMethod: keyof typeof PAY_METHODS;
  insurances: string[];
  extra: string;
  /** 저장할 때 정책값으로 정해 고정한다 */
  annualText?: string;
};

export type PledgeTerms = { version: string; leftOn?: string; checks?: string[]; note?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const mins = (t: string) => {
  const m = HM.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 하루 근로시간(휴게 뺌)과 휴게 분 */
export function dailyHours(t: Pick<ContractTerms, "workStart" | "workEnd" | "breakStart" | "breakEnd">) {
  const s = mins(t.workStart);
  const e = mins(t.workEnd);
  if (s == null || e == null || e <= s) return null;
  let brk = 0;
  if (t.breakStart || t.breakEnd) {
    const bs = mins(t.breakStart);
    const be = mins(t.breakEnd);
    if (bs == null || be == null || be <= bs || bs < s || be > e) return null;
    brk = be - bs;
  }
  return { hours: (e - s - brk) / 60, breakMinutes: brk };
}

/** 월 소정근로시간(주휴 포함): (주 시간 + 주휴 시간) × 365 ÷ 7 ÷ 12. 주 15시간 미만은 주휴 없음 */
export function monthlyStdHours(weekly: number) {
  const paidHoliday = weekly >= 15 ? Math.min(8, (weekly / 40) * 8) : 0;
  return Math.round(((weekly + paidHoliday) * 365) / 7 / 12);
}

export function contractNumbers(t: ContractTerms) {
  const d = dailyHours(t);
  const daily = d?.hours ?? 0;
  const weekly = Math.round(daily * t.workDays.length * 100) / 100;
  const monthHours = monthlyStdHours(weekly);
  const fixed = t.allowances.reduce((a, x) => a + (x.amount || 0), 0);
  const hourly = t.payType === "hourly" ? t.basePay : monthHours ? Math.floor((t.basePay + fixed) / monthHours) : 0;
  return { daily, breakMinutes: d?.breakMinutes ?? 0, weekly, monthHours, hourly, fixedAllowances: fixed };
}

const addYears = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + n}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * 계약 내용 검사. 법을 어기는 값은 errors(저장 막음), 알아 둘 것은 warnings.
 * minWage: 그 해 최저임금(시급), legal5: 상시 5명 이상(근로기준법 제50·53·54조 등 전부 적용)
 */
export function checkContract(t: ContractTerms, o: { minWage: number; legal5: boolean }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(t.contractType in CONTRACT_TYPES)) errors.push("계약 형태를 골라 주세요");
  if (!ISO.test(t.startOn)) errors.push("계약 시작일을 골라 주세요");
  if (t.contractType === "fixed") {
    if (!ISO.test(t.endOn)) errors.push("기간제는 계약 끝나는 날을 적어야 합니다");
    else if (t.endOn <= t.startOn) errors.push("계약 끝나는 날이 시작일보다 뒤여야 합니다");
    else if (t.endOn >= addYears(t.startOn, 2)) warnings.push("기간제 계약이 2년을 넘으면 기간의 정함이 없는 근로자로 봅니다(기간제법 제4조)");
  } else if (t.endOn && t.contractType === "regular") errors.push("정규직은 끝나는 날을 비워 둡니다(기간제면 계약 형태를 바꾸세요)");
  if (!t.place.trim()) errors.push("근무 장소를 적어 주세요");
  if (!t.duties.trim()) errors.push("업무 내용을 적어 주세요");
  if (!t.workDays.length) errors.push("근무 요일을 하나 이상 골라 주세요");
  if (t.workDays.includes(t.holiday)) errors.push(`주휴일(${WEEKDAYS[t.holiday] ?? "?"}요일)이 근무 요일에 들어 있습니다`);
  const d = dailyHours(t);
  if (!d) errors.push("시업·종업·휴게 시각을 확인해 주세요(휴게는 근무 시간 안에)");
  const n = contractNumbers(t);
  if (d) {
    const span = n.daily + d.breakMinutes / 60;
    // 제54조: 4시간에 30분, 8시간에 1시간 이상(근로시간 기준)
    const need = n.daily > 8 ? 60 : n.daily >= 4 ? 30 : 0;
    if (d.breakMinutes < need) errors.push(`하루 ${n.daily}시간 일하면 휴게가 ${need}분 이상이어야 합니다(근로기준법 제54조)`);
    if (n.daily > 8 || n.weekly > 40) {
      if (o.legal5) errors.push(`소정근로시간은 하루 8시간·주 40시간을 넘을 수 없습니다(지금 하루 ${n.daily}시간·주 ${n.weekly}시간, 근로기준법 제50조). 넘는 시간은 연장근로로 따로 신청합니다`);
      else warnings.push(`하루 ${n.daily}시간·주 ${n.weekly}시간입니다. 상시 5명 미만이라 제50조는 적용되지 않지만 건강을 위해 줄이는 것이 좋습니다`);
    }
    if (span > 13) warnings.push("출근부터 퇴근까지 13시간이 넘습니다");
  }
  if (t.contractType === "part") {
    if (n.weekly >= 40) errors.push("단시간 근로자는 통상 근로자(주 40시간)보다 짧게 일해야 합니다. 정규직·기간제로 고르세요");
    warnings.push("단시간 근로자가 소정근로시간을 넘겨 일하면 통상임금의 50% 이상을 더 줍니다(기간제법 제6조). 계약서에 적혀 나갑니다");
  }
  if (n.weekly > 0 && n.weekly < 15) warnings.push("주 15시간 미만이면 주휴일·연차·퇴직금이 적용되지 않습니다(근로기준법 제18조 3항)");
  if (!(t.payType in PAY_TYPES)) errors.push("임금 형태를 골라 주세요");
  if (!Number.isFinite(t.basePay) || t.basePay <= 0) errors.push("기본급(시급)을 적어 주세요");
  else if (n.hourly && n.hourly < o.minWage) {
    errors.push(
      t.payType === "hourly"
        ? `시급 ${t.basePay.toLocaleString("ko-KR")}원이 최저임금 ${o.minWage.toLocaleString("ko-KR")}원보다 적습니다(최저임금법 제6조)`
        : `월 ${(t.basePay + n.fixedAllowances).toLocaleString("ko-KR")}원 ÷ ${n.monthHours}시간 = 시간당 ${n.hourly.toLocaleString("ko-KR")}원으로 최저임금 ${o.minWage.toLocaleString("ko-KR")}원보다 적습니다. 월 ${(o.minWage * n.monthHours).toLocaleString("ko-KR")}원 이상이어야 합니다`,
    );
  }
  for (const a of t.allowances) if (!a.name.trim() || !(a.amount > 0)) errors.push("수당은 이름과 금액을 둘 다 적거나 둘 다 비웁니다");
  if (!Number.isInteger(t.payDay) || t.payDay < 1 || t.payDay > 31) errors.push("임금 지급일(1~31일)을 확인해 주세요");
  if (!(t.payMethod in PAY_METHODS)) errors.push("지급 방법을 골라 주세요");
  if (t.insurances.some((x) => !(x in INSURANCES))) errors.push("사회보험 항목을 확인해 주세요");
  if (!t.insurances.includes("accident")) warnings.push("산재보험은 근로자 1명 이상이면 모두 가입 대상입니다");
  return { errors, warnings, numbers: n };
}

export const fmtDays = (days: number[]) => {
  const s = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const run = s.length > 2 && s.every((d, i) => i === 0 || (d === (s[i - 1] + 1) % 7 && d !== 0) || (s[i - 1] === 6 && d === 0));
  return run ? `${WEEKDAYS[s[0]]}~${WEEKDAYS[s[s.length - 1]]}요일(주 ${s.length}일)` : `${s.map((d) => WEEKDAYS[d]).join("·")}요일(주 ${s.length}일)`;
};

// ── 정보보호 서약서(F-13-02)·퇴직 확인서(F-13-03) 문안: 표준서 STD-13 9절(v0.3)과 같게 유지 ──

export const PLEDGE_VERSION = "STD-13 v0.3";

export const PLEDGE_JOIN_ITEMS = [
  "업무 중 알게 된 고객의 개인정보(이름·연락처·차량번호·사고 내용 등)는 맡은 업무에만 쓰고, 다른 사람에게 알려 주거나 따로 적어 두지 않겠습니다.",
  "견적 단가·공임 기준표·거래처 단가와 계약 조건·보험사 협의 내용·직원 급여와 인사 기록·계정과 비밀번호 같은 '비밀' 정보를 허락 없이 밖으로 내보내지 않겠습니다.",
  "업무 자료와 사진을 개인 메신저·개인 클라우드·USB·개인 이메일로 옮기지 않고, 차량·고객 사진은 정비소 앱으로만 찍고 보관하겠습니다. 개인 SNS에 올리지 않겠습니다.",
  "내 계정과 비밀번호를 다른 사람과 같이 쓰지 않고, 자리를 비울 때는 화면을 잠그며, 출력물은 다 쓰면 파쇄함에 넣겠습니다.",
  "개인정보가 새거나 휴대폰·자료를 잃어버리는 등 사고를 알게 되면 바로 개인정보 보호책임자(대표)에게 알리겠습니다.",
  "개인정보 보호 교육(입사 때와 매년)을 받겠습니다.",
  "퇴직할 때 받은 자료·장비를 모두 돌려주고 개인 기기의 업무 자료를 지우며, 퇴직한 뒤에도 업무 중 알게 된 비밀을 지키겠습니다.",
  "이 서약을 어겨 회사나 고객에게 손해가 생기면 관련 법(개인정보 보호법, 부정경쟁방지법 등)과 취업규칙에 따른 책임을 지겠습니다.",
] as const;

export const LEAVE_CHECKS = {
  return_docs: "업무 자료·출력물·장비(열쇠·출입카드 등)를 모두 돌려주었습니다",
  delete_device: "개인 휴대폰·PC·클라우드에 남은 업무 사진과 자료를 지웠습니다",
  leave_chat: "업무용 메신저 대화방에서 나왔습니다",
  no_copy: "업무 자료를 따로 복사하거나 가져가지 않았습니다",
  account: "정비소 앱 계정을 회수(잠금)하는 데 동의합니다",
} as const;

export const LEAVE_PLEDGE_TEXT =
  "본인은 위 사항을 사실대로 확인하며, 퇴직한 뒤에도 재직 중 알게 된 고객 개인정보와 회사의 비밀 정보를 누구에게도 알리거나 쓰지 않겠습니다. 이를 어겨 손해가 생기면 관련 법에 따른 책임을 지겠습니다.";
