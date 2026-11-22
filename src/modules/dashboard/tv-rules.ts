// TV 현황판 상태 구분·색(대표 결정 2026-11-18 "제안대로 진행").
// 색은 색약에도 구분되는 Okabe-Ito 팔레트 계열이고, 색만으로 구분하지 않도록 상태마다 아이콘과 글자를 함께 쓴다.
// 작업 대기·작업 중·출고 대기 색은 수리 부위 차 그림의 작업 전·작업 중·끝 색과 같다(src/app/repairs/damage-map.tsx PROGRESS).
// 지연은 상태가 아니라 덧표시다: 출고 약속일이 지나면 어떤 상태든 주홍 테두리와 '⚠ n일 지연'이 붙고 맨 위로 올라간다.

export const TV_STATES = {
  plan: { label: "입고 예정", icon: "", color: "#9aa3ab", fg: "#eef3fa", outline: true, help: "예약한 상담·업체 주문. 차가 아직 들어오지 않음" },
  in: { label: "입고·점검", icon: "⬇", color: "#56B4E9", fg: "#0b0f14", outline: false, help: "입고 점검 중이거나 진단 대기" },
  est: { label: "견적·승인 대기", icon: "✍", color: "#CC79A7", fg: "#0b0f14", outline: false, help: "견적 작성, 고객 승인이나 보험사 손해사정 대기" },
  wait: { label: "작업 대기", icon: "◷", color: "#9AA3AB", fg: "#0b0f14", outline: false, help: "작업 지시는 있는데 아직 시작 전" },
  work: { label: "작업 중", icon: "🔧", color: "#E69F00", fg: "#0b0f14", outline: false, help: "공정 진행 중(지금 공정 이름과 공정 막대)" },
  hold: { label: "부품·외주 대기", icon: "⏸", color: "#F0E442", fg: "#0b0f14", outline: false, help: "부품이 안 들어왔거나 외주에 나가 있어 멈춤(빗금)" },
  qc: { label: "검사 중", icon: "🔍", color: "#2F8FE0", fg: "#ffffff", outline: false, help: "최종 검사" },
  ready: { label: "출고 대기", icon: "✔", color: "#009E73", fg: "#0b0f14", outline: false, help: "검사 끝, 고객을 기다림" },
  out: { label: "출고함", icon: "✓", color: "#56616e", fg: "#d6dde6", outline: false, help: "오늘 나간 차(출고 예정 칸에만)" },
} as const;
export type TvState = keyof typeof TV_STATES;
export const TV_STATE_KEYS = Object.keys(TV_STATES) as TvState[];

/** 지연 덧표시 색(주홍) */
export const TV_LATE_COLOR = "#D55E00";

/** 수리 건 하나를 상태로 나누는 데 필요한 값(앞선 전표에서 모음) */
export type TvRoInput = {
  status: "intake" | "checked" | "estimating" | "working" | "inspecting" | "ready" | "delivered" | "cancelled";
  diagnosed: boolean;
  readyNoticed: boolean;
  /** 최근 견적 상태(없으면 null) */
  estimate: string | null;
  /** 보험 청구 상태(없으면 null) */
  claim: string | null;
  /** 작업 지시서가 있나 */
  hasWorkOrder: boolean;
  /** 공정(순서대로). assignee 는 이름 */
  steps: { process: string; label: string; started: boolean; ended: boolean; assignee: string | null }[];
  /** 아직 다 안 들어온 발주(부품). dueOn 은 납기(회신 납기 우선) */
  partsPending: { dueOn: string | null }[];
  /** 외주: requested 의뢰함 · out 반출 중 */
  outsource: ("requested" | "out")[];
  /** 검사 회차(검사 중일 때) */
  inspectRound: number;
};

export type TvClass = { state: TvState; sub: string; rework: boolean; done: number; total: number; current: number | null };

const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 수리 건 → TV 상태와 한 줄 설명 */
export function classifyRo(r: TvRoInput): TvClass {
  const total = r.steps.length;
  const done = r.steps.filter((s) => s.ended).length;
  const doingIdx = r.steps.findIndex((s) => s.started && !s.ended);
  const nextIdx = r.steps.findIndex((s) => !s.ended);
  const base = { done, total, current: doingIdx >= 0 ? doingIdx : null, rework: r.steps.some((s) => s.process === "rework" && !s.ended) };
  const who = (s: { assignee: string | null }) => (s.assignee ? ` · ${s.assignee}` : "");

  if (r.status === "ready") return { ...base, state: "ready", sub: r.readyNoticed ? "고객 연락함" : "고객 연락 전" };
  if (r.status === "delivered") return { ...base, state: "out", sub: "출고함" };

  // 공정이 돌고 있으면 작업 중(검사 불합격 재작업도 여기)
  if (doingIdx >= 0 && (r.status === "working" || r.status === "inspecting")) {
    const s = r.steps[doingIdx];
    return { ...base, state: "work", sub: `${s.label}${who(s)} · ${done + 1}/${total}` };
  }
  // 외주에 나가 있거나 부품이 안 와서 멈춤
  if (r.outsource.length && r.status !== "inspecting")
    return { ...base, state: "hold", sub: r.outsource.includes("out") ? "외주 작업 중(차 반출)" : "외주 의뢰함" };
  if (r.status === "working" && r.partsPending.length) {
    const due = r.partsPending.map((p) => p.dueOn).filter((x): x is string => !!x).sort()[0];
    return { ...base, state: "hold", sub: `부품 미입고${due ? ` · ${mmdd(due)} 입고 예정` : ""}` };
  }
  if (r.status === "inspecting") return { ...base, state: "qc", sub: r.inspectRound > 1 ? `최종 검사 ${r.inspectRound}회차` : "최종 검사" };
  if (r.status === "working") {
    if (!r.hasWorkOrder) return { ...base, state: "wait", sub: "작업 지시서 만들기 전" };
    const n = nextIdx >= 0 ? r.steps[nextIdx] : null;
    return { ...base, state: "wait", sub: n ? `다음: ${n.label}${who(n)}` : "공정 끝 · 검사 대기" };
  }
  if (r.status === "estimating") {
    if (r.claim === "requested") return { ...base, state: "est", sub: "보험사 손해사정 중" };
    if (r.estimate === "sent") return { ...base, state: "est", sub: "고객 승인 대기" };
    if (r.estimate === "review" || r.estimate === "approved") return { ...base, state: "est", sub: "견적 검토 중" };
    return { ...base, state: "est", sub: "견적 작성 중" };
  }
  if (r.status === "checked") return { ...base, state: "in", sub: r.diagnosed ? "진단 확인 대기" : "진단 대기" };
  return { ...base, state: "in", sub: "입고 점검 중" };
}

/** 날짜 차이(일). a - b */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** 출고 약속·예정일 표시: 오늘·내일·모레·11/20 (금) */
export function dayWord(date: string, today: string): string {
  const d = daysBetween(date, today);
  if (d === 0) return "오늘";
  if (d === 1) return "내일";
  if (d === 2) return "모레";
  return `${mmdd(date)} (${WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
}

/** 지연 일수(약속일이 지났으면 1 이상, 아니면 0) */
export function lateDays(due: string | null, today: string): number {
  return due ? Math.max(0, daysBetween(today, due)) : 0;
}

/** 입고 중 차량 순서: 지연 많은 순 → 출고 약속 빠른 순(미정은 뒤) → 입고 빠른 순 */
export function sortBoard<T extends { late: number; due: string | null; inAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.late - a.late || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.inAt.localeCompare(b.inAt));
}

// ── 테크베이용 현황판(대표 요청 2026-11-20): 색을 상태가 아니라 공정별로 쓴다.
// 공정 13개를 TV에서 한눈에 볼 수 있게 단계로 묶는다(작업 흐름 순서). 대표 요청(2026-11-20): 입고·견적 한 칸, 탈부착·판금 한 칸, 조립·검사 한 칸. 도장 준비·도장 마무리는 칸을 두지 않는다(퍼티·조색·마스킹·도장 마무리(연마)는 도장 칸에 셈). 상단 요약은 '오늘 입고 → 각 공정 → 출고 대기 → 오늘 출고'.
// 색은 어두운 배경에서 서로 구분되는 Okabe-Ito 계열 + 보라·회색. 주홍(#D55E00)은 지연 덧표시 전용이라 쓰지 않는다.
export const TB_STAGES = {
  intake: { label: "입고·견적", color: "#9AA3AB", procs: [] as string[], help: "입고 점검·진단·견적, 승인·손해사정 대기(작업 지시 전)" },
  body: { label: "탈부착·판금", color: "#3D7BE0", procs: ["detach", "sheet", "outsource"], help: "탈부착·판금·용접, 계측 같은 외주" },
  paint: { label: "도장·건조", color: "#E69F00", procs: ["putty", "color", "mask", "paint", "dry", "polish"], help: "도장 부스·건조(퍼티·조색·마스킹·도장 마무리(연마) 공정도 여기에 셈)" },
  assemble: { label: "조립·검사", color: "#B39DDB", procs: ["assemble", "calibrate", "rework"], help: "조립·작동 확인, 센서·카메라 보정, 최종 검사·재작업" },
  ready: { label: "출고 대기", color: "#009E73", procs: [] as string[], help: "검사 끝, 고객 인도 대기" },
} as const;
export type TbStage = keyof typeof TB_STAGES;
export const TB_STAGE_KEYS = Object.keys(TB_STAGES) as TbStage[];

/** 공정 → 테크베이 현황판 단계 */
export function stageOfProcess(process: string): TbStage {
  for (const k of TB_STAGE_KEYS) if ((TB_STAGES[k].procs as readonly string[]).includes(process)) return k;
  return "assemble";
}

/**
 * 차 한 대가 지금 어느 공정 단계에 있나.
 * 입고 점검·견적·승인(작업 지시 전)은 intake, 검사는 조립·검사(공정 다 끝나고 검사 기다림 포함), 출고 대기는 ready.
 * 공정 중이면 그 공정, 대기·부품·외주 대기면 다음에 할 공정 단계에 서 있는 것으로 본다.
 */
export function tbStageOf(state: TvState, steps: { process: string; started: boolean; ended: boolean }[]): { stage: TbStage; doing: boolean } {
  if (state === "in" || state === "est" || state === "plan") return { stage: "intake", doing: false };
  if (state === "ready" || state === "out") return { stage: "ready", doing: false };
  if (state === "qc") return { stage: "assemble", doing: true };
  const cur = steps.find((s) => s.started && !s.ended);
  if (cur) return { stage: stageOfProcess(cur.process), doing: state === "work" };
  const next = steps.find((s) => !s.ended);
  if (next) return { stage: stageOfProcess(next.process), doing: false };
  return { stage: steps.length ? "assemble" : "intake", doing: false };
}
