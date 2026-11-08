// 역량 표(F-11-02, STD-11 6절) 규칙. 화면과 서버가 같이 쓴다(DB 없음).

/** 직무(표준서 STD-11 6절의 열) */
export const SKILLS = {
  consult: "상담·견적",
  sheet: "판금",
  dent: "덴트",
  weld: "용접",
  putty: "퍼티·샌딩",
  color: "조색",
  paint: "도장",
  polish: "광택",
  inspect: "검사",
  equip: "설비 운전",
} as const;
export type Skill = keyof typeof SKILLS;
export const isSkill = (s: string): s is Skill => s in SKILLS;

/** 4단계(STD-11 6절). 4단계는 신입 OJT 지도·역량 평가 보조 [확인 필요: 표준서 4단계 문구] */
export const LEVELS = {
  1: { label: "교육 중", can: "선임자 감독 아래 작업 보조" },
  2: { label: "독립 작업", can: "혼자 기준에 맞게 작업 — 작업 배정 가능" },
  3: { label: "숙련", can: "난이도 높은 작업·문제 해결 — 최종 검사자·지도자 지정 가능" },
  4: { label: "지도", can: "신입 OJT 지도, 작업 표준 개정 제안" },
} as const;
export type Level = 1 | 2 | 3 | 4;
export const isLevel = (n: number): n is Level => n === 1 || n === 2 || n === 3 || n === 4;

/** 지도자·최종 검사자가 되는 최소 단계 */
export const MENTOR_LEVEL = 3;
export const INSPECTOR_LEVEL = 3;

/** 작업 공정 → 필요한 직무. null 이면 역량 확인 없음(외주·재작업은 원래 공정 담당이 판단) */
export const PROCESS_SKILL: Record<string, Skill | null> = {
  detach: "sheet",
  outsource: null,
  dent: "dent",
  sheet: "sheet",
  putty: "putty",
  color: "color",
  mask: "putty",
  paint: "paint",
  dry: "paint",
  polish: "polish",
  calibrate: "equip",
  assemble: "sheet",
  rework: null,
};

export type Levels = Partial<Record<Skill, number>>;

/** 배정 점검: 담당 단계가 단독 기준 미만이면 지도자(3단계 이상)가 있어야 한다 */
export function assignmentIssue(process: string, assignee: Levels, mentor: Levels | null, minSolo: number): string | null {
  const skill = PROCESS_SKILL[process];
  if (!skill) return null;
  const lv = assignee[skill] ?? 0;
  if (lv >= minSolo) return null;
  const name = SKILLS[skill];
  if (!mentor) return `담당의 '${name}' 역량이 ${lv ? `${lv}단계` : "없음"}입니다. ${minSolo}단계 미만은 혼자 맡을 수 없으니 지도자(${MENTOR_LEVEL}단계 이상)를 함께 정해 주세요(STD-11 6절)`;
  if ((mentor[skill] ?? 0) < MENTOR_LEVEL) return `지도자의 '${name}' 역량이 ${MENTOR_LEVEL}단계 미만입니다. 숙련(${MENTOR_LEVEL}단계) 이상인 사람을 지도자로 정해 주세요`;
  return null;
}

export const GENDER = { m: "남", f: "여" } as const;
export const CONTRACT_KIND = { regular: "기간의 정함 없음(정규)", fixed: "기간제", part: "단시간(파트타임)" } as const;

/** 근속 기간(입사일 ~ 기준일, 만) */
export function tenure(hiredOn: string, on: string): { years: number; months: number } {
  const [y1, m1, d1] = hiredOn.split("-").map(Number);
  const [y2, m2, d2] = on.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}
export function tenureText(hiredOn: string, on: string) {
  const t = tenure(hiredOn, on);
  return t.years ? `${t.years}년 ${t.months}개월` : `${t.months}개월`;
}
