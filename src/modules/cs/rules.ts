// 보증·불만·만족도(STD-06) 규칙: 화면과 서버가 같이 쓴다
export const CHANNELS = { visit: "방문", phone: "전화", app: "앱", review: "온라인 리뷰", survey: "만족도 설문", partner: "거래처", resident: "주민(환경 민원)" } as const;
export type Channel = keyof typeof CHANNELS;
export const isChannel = (v: string): v is Channel => v in CHANNELS;

export const CATEGORIES = { quality: "수리 품질", schedule: "출고 일정", explain: "설명 부족", price: "가격", kindness: "직원 응대", environment: "환경(소음·냄새)", other: "기타" } as const;
export type Category = keyof typeof CATEGORIES;
export const isCategory = (v: string): v is Category => v in CATEGORIES;

export const VERDICTS = { covered: "보증 해당", partial: "일부 해당", not: "비해당", none: "보증과 무관" } as const;
export type Verdict = keyof typeof VERDICTS;
export const isVerdict = (v: string): v is Verdict => v in VERDICTS;

export const RESOLUTIONS = { warranty_repair: "보증 수리", explain: "설명 종결", other: "기타" } as const;
export type Resolution = keyof typeof RESOLUTIONS;
export const isResolution = (v: string): v is Resolution => v in RESOLUTIONS;

export const CP_STATUS = { received: "접수", acked: "접수 안내함", judged: "판정", agreed: "처리 중", closed: "종결" } as const;
export type CpStatus = keyof typeof CP_STATUS;
export const CP_TONE: Record<CpStatus, "warn" | "danger" | "ok" | undefined> = { received: "danger", acked: "warn", judged: "warn", agreed: undefined, closed: "ok" };
export const CP_STEPS: CpStatus[] = ["received", "acked", "judged", "agreed", "closed"];

/** 만족도 설문 F-06-01 질문(5점 척도). 낮은 점수 → 불만 분류 */
export const SURVEY_QUESTIONS: { q: string; category: Category }[] = [
  { q: "수리 품질(색상·마감)에 만족하십니까?", category: "quality" },
  { q: "약속한 날짜에 출고되었습니까?", category: "schedule" },
  { q: "견적·수리 내용 설명이 충분했습니까?", category: "explain" },
  { q: "가격이 적정했습니까?", category: "price" },
  { q: "직원이 친절했습니까?", category: "kindness" },
  { q: "다음에도 이용하거나 주변에 추천하시겠습니까?", category: "other" },
];
export const SCALE = [1, 2, 3, 4, 5] as const;
export const SCALE_LABEL: Record<number, string> = { 1: "매우 불만", 2: "불만", 3: "보통", 4: "만족", 5: "매우 만족" };
/** 링크는 보낸 뒤 30일까지 열린다 */
export const SURVEY_OPEN_DAYS = 30;
/** 같은 유형이 분기에 이만큼이면 경영 검토 안건(STD-06 6.4) */
export const REPEAT_PER_QUARTER = 3;

/** 설문 점수 중 기준 이하 항목 */
export function lowItems(scores: number[], threshold: number) {
  return scores.map((s, i) => ({ s, i })).filter((x) => x.s <= threshold);
}

export function surveyIssues(scores: number[]) {
  if (scores.length !== SURVEY_QUESTIONS.length || scores.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) return ["모든 질문에 1~5점 중 하나를 골라 주세요"];
  return [];
}

export type Warranty = { kind: string; until: string };
/** 명세서에 적힌 보증(출고일부터) 중 오늘 기준 남은 것 */
export function warrantyState(list: Warranty[] | undefined, today: string) {
  const all = list ?? [];
  const live = all.filter((w) => w.until >= today);
  return { all, live, inWarranty: live.length > 0 };
}

/** 판정 입력 검사 */
export function judgeIssues(p: { verdict: string; reason: string; inspectNote: string }) {
  const out: string[] = [];
  if (!isVerdict(p.verdict)) out.push("판정을 골라 주세요");
  if (!p.inspectNote.trim()) out.push("현물 확인 내용을 적어 주세요(출고 검사 기록·사진과 비교)");
  if (!p.reason.trim()) out.push("판정 근거를 적어 주세요");
  return out;
}

/** 분기(YYYY-Qn) */
export const quarterOf = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}`;
