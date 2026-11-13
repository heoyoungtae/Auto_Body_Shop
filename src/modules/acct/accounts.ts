// 계정과목표(보고서 센터 4단계, 사용자 결정 2026-11-13: 중소기업회계기준 표준 계정, 관리용 재무제표를 앱 자동 분개로).
// 번호는 세무사 사무실이 많이 쓰는 회계 프로그램의 번호 체계를 따랐다. 세무사가 정해지면 이름·번호를 맞춘다.
// DB 없음(분개·보고서·화면·테스트가 같이 쓴다).

/** 구분: 자산·부채·자본(재무상태표), 수익·비용(손익계산서) */
export type AcctType = "asset" | "liability" | "equity" | "revenue" | "expense";
/** 손익계산서·재무상태표에서 묶는 칸 */
export type AcctGroup =
  | "cur_asset" // 유동자산
  | "inventory" // 재고자산
  | "fixed_asset" // 비유동자산(유형자산·보증금)
  | "cur_liab" // 유동부채
  | "long_liab" // 비유동부채
  | "equity" // 자본
  | "sales" // 매출액
  | "cogs" // 매출원가
  | "sga" // 판매비와관리비
  | "other_inc" // 영업외수익
  | "other_exp"; // 영업외비용
/** 현금흐름표에서 상대 계정이 이 계정이면 어느 활동인지 */
export type CfKind = "operating" | "investing" | "financing" | "cash";

export type Account = { code: string; name: string; type: AcctType; group: AcctGroup; cf: CfKind; /** 자금 전표에서 고를 수 있나 */ manual?: boolean; note?: string };

const A = (code: string, name: string, type: AcctType, group: AcctGroup, cf: CfKind, o: Partial<Account> = {}): Account => ({ code, name, type, group, cf, manual: true, ...o });

export const ACCOUNTS: Account[] = [
  // 자산
  A("101", "현금", "asset", "cur_asset", "cash", { note: "금고·현금 시재" }),
  A("103", "보통예금", "asset", "cur_asset", "cash", { note: "사업용 통장. 카드 매출도 카드사 입금 전에 여기로 본다" }),
  A("108", "외상매출금", "asset", "cur_asset", "operating", { manual: false, note: "정비명세서 발급 − 입금(고객·보험사)" }),
  A("120", "미수금", "asset", "cur_asset", "operating", { note: "본업 아닌 받을 돈(환급금 등)" }),
  A("131", "선급금", "asset", "cur_asset", "operating", { manual: false, note: "선입금 발주: 낸 돈 − 들어온 물건" }),
  A("135", "부가세대급금", "asset", "cur_asset", "operating", { manual: false, note: "매입 때 낸 부가세" }),
  A("153", "원재료", "asset", "inventory", "operating", { manual: false, note: "재고 품목 장부 금액(이동평균)" }),
  A("212", "비품·설비", "asset", "fixed_asset", "investing", { note: "지출 계정 '설비·공구'로 산 것" }),
  A("213", "감가상각누계액", "asset", "fixed_asset", "investing", { manual: false, note: "비품·설비에서 빼는 계정(−)" }),
  A("232", "임차보증금", "asset", "fixed_asset", "investing"),
  // 부채
  A("251", "외상매입금", "liability", "cur_liab", "operating", { manual: false, note: "부품·도료·소모품·외주 입고 − 지급" }),
  A("253", "미지급금", "liability", "cur_liab", "operating", { note: "그 밖의 매입·결의 후 안 낸 돈·카드 결제일 전" }),
  A("254", "예수금", "liability", "cur_liab", "operating", { note: "급여에서 뗀 세금·4대보험(회사 몫 포함)" }),
  A("255", "부가세예수금", "liability", "cur_liab", "operating", { note: "매출 때 받은 부가세" }),
  A("260", "단기차입금", "liability", "cur_liab", "financing"),
  A("293", "장기차입금", "liability", "long_liab", "financing"),
  // 자본
  A("331", "자본금", "equity", "equity", "financing", { note: "개업 때 넣은 돈(기초 잔액의 나머지)" }),
  A("338", "인출금", "equity", "equity", "financing", { note: "대표가 가져가거나(+) 넣은(−) 돈" }),
  A("375", "이익잉여금", "equity", "equity", "operating", { manual: false, note: "지난해까지 손익 누계(보고서에서 계산)" }),
  // 수익
  A("401", "부품 매출", "revenue", "sales", "operating", { manual: false }),
  A("404", "공임 매출", "revenue", "sales", "operating", { manual: false }),
  A("403", "매출 차감(보험 삭감)", "revenue", "sales", "operating", { manual: false, note: "보험사가 깎고 준 금액" }),
  A("901", "이자수익", "revenue", "other_inc", "operating"),
  A("930", "잡이익", "revenue", "other_inc", "operating"),
  // 매출원가
  A("501", "부품비", "expense", "cogs", "operating", { manual: false }),
  A("502", "도료비", "expense", "cogs", "operating", { manual: false }),
  A("503", "작업 소모품비", "expense", "cogs", "operating", { manual: false }),
  A("533", "외주가공비", "expense", "cogs", "operating", { manual: false }),
  A("545", "재고감모·폐기손실", "expense", "cogs", "operating", { manual: false, note: "실사 부족·유효기간 폐기(실사로 늘면 −)" }),
  // 판매비와관리비
  A("801", "급여", "expense", "sga", "operating", { manual: false }),
  A("811", "복리후생비", "expense", "sga", "operating", { note: "식대·작업복·회사 몫 4대보험" }),
  A("815", "수도광열비·통신비", "expense", "sga", "operating"),
  A("817", "세금과공과", "expense", "sga", "operating"),
  A("818", "감가상각비", "expense", "sga", "operating", { manual: false }),
  A("819", "임차료", "expense", "sga", "operating"),
  A("820", "수선비", "expense", "sga", "operating"),
  A("821", "보험료", "expense", "sga", "operating"),
  A("822", "차량유지비", "expense", "sga", "operating"),
  A("831", "지급수수료", "expense", "sga", "operating", { note: "카드·은행·용역 수수료" }),
  A("833", "광고선전비", "expense", "sga", "operating"),
  A("848", "잡비", "expense", "sga", "operating"),
  // 영업외비용
  A("951", "이자비용", "expense", "other_exp", "operating"),
  A("960", "잡손실", "expense", "other_exp", "operating"),
];

export const ACCT = new Map(ACCOUNTS.map((a) => [a.code, a]));
export const acctName = (code: string) => ACCT.get(code)?.name ?? code;
/** 차변이 늘어나는 쪽인 계정(자산·비용). 잔액 = 차변 − 대변 */
export const debitNormal = (code: string) => {
  const t = ACCT.get(code)?.type;
  return t === "asset" || t === "expense";
};
export const CASH_CODES = ["101", "103"] as const;

export const GROUP_LABEL: Record<AcctGroup, string> = {
  cur_asset: "유동자산",
  inventory: "재고자산",
  fixed_asset: "비유동자산",
  cur_liab: "유동부채",
  long_liab: "비유동부채",
  equity: "자본",
  sales: "매출액",
  cogs: "매출원가",
  sga: "판매비와관리비",
  other_inc: "영업외수익",
  other_exp: "영업외비용",
};

/** 지출 계정(money/rules EXP_CATEGORIES) → 계정과목 */
export const EXP_ACCOUNT: Record<string, string> = {
  parts: "501",
  paint: "502",
  consumable: "503",
  outsource: "533",
  equipment: "212",
  repair: "820",
  rent: "819",
  utility: "815",
  tax: "817",
  insurance: "821",
  fee: "831",
  welfare: "811",
  vehicle: "822",
  ad: "833",
  other: "848",
};
export const expAccount = (category: string) => EXP_ACCOUNT[category] ?? "848";

/** 재고 품목 구분 → 매출원가 계정(입고 때 원재료로 옮기고, 쓸 때 다시 비용으로) */
export const STOCK_ACCOUNT: Record<string, string> = { paint: "502", consumable: "503", part: "501" };

/**
 * 자금 전표 종류(앱의 다른 전표로 생기지 않는 돈). 고르면 차변·대변 계정이 정해진다. other 는 직접 고른다.
 * 통장 내역의 분류(대출·이자·수수료·세금·4대보험·대표 인출·입금)에서 바로 만들 수 있다.
 */
export const FUND_KINDS = {
  capital_in: { label: "자본금 넣음", dr: "103", cr: "331" },
  owner_in: { label: "대표가 사업 통장에 넣음", dr: "103", cr: "338" },
  owner_out: { label: "대표가 가져감(생활비 등)", dr: "338", cr: "103" },
  loan_in: { label: "돈 빌림(대출 받음)", dr: "103", cr: "293" },
  loan_repay: { label: "빌린 돈 갚음(원금)", dr: "293", cr: "103" },
  interest: { label: "이자 냄", dr: "951", cr: "103" },
  interest_in: { label: "이자 받음", dr: "103", cr: "901" },
  vat_pay: { label: "부가세 냄", dr: "255", cr: "103" },
  vat_refund: { label: "부가세 돌려받음(환급)", dr: "103", cr: "255" },
  withhold_pay: { label: "원천세·4대보험 냄(급여에서 뗀 것·회사 몫)", dr: "254", cr: "103" },
  tax_pay: { label: "세금·공과금 냄(결의 없이 빠져나감)", dr: "817", cr: "103" },
  fee: { label: "은행·카드 수수료", dr: "831", cr: "103" },
  deposit_out: { label: "임차보증금 냄", dr: "232", cr: "103" },
  deposit_in: { label: "임차보증금 돌려받음", dr: "103", cr: "232" },
  cash_in: { label: "현금을 통장에 넣음", dr: "103", cr: "101" },
  cash_out: { label: "통장에서 현금 찾음", dr: "101", cr: "103" },
  other: { label: "기타(계정 직접 고름)", dr: "", cr: "" },
} as const;
export type FundKind = keyof typeof FUND_KINDS;
export const isFundKind = (s: string): s is FundKind => s in FUND_KINDS;

/** 통장 내역 분류(bank_tx.cls) → 자금 전표 종류(입금/출금) */
export const CLS_FUND: Record<string, { in?: FundKind; out?: FundKind }> = {
  loan: { in: "loan_in", out: "loan_repay" },
  interest: { in: "interest_in", out: "interest" },
  fee: { out: "fee" },
  tax: { in: "vat_refund", out: "tax_pay" },
  social: { out: "withhold_pay" },
  owner: { in: "owner_in", out: "owner_out" },
};

/** 기초 잔액에 적는 계정(나머지는 앱이 만든다). 자본금은 자산 − 부채로 저절로 맞춘다 */
export const OPENING_CODES = ["101", "103", "108", "120", "131", "212", "213", "232", "251", "253", "254", "255", "260", "293"] as const;
