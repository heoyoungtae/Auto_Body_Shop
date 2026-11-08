// 작업(STD-04): 공정 목록·순서·자주 검사. 화면과 서버가 함께 쓴다.
// 공정 흐름(5절): 탈부착 → 덴트·판금 → 퍼티·서페이서 → 마스킹 → 조색(3~4와 병행) → 도장 → 건조 → 광택 → 조립·작동 확인 → 최종 검사(STD-05)

export const PROCESSES = {
  detach: { label: "탈부착", rank: 1, checks: ["커넥터 분리 전 배터리(-) 차단", "부품·볼트·클립을 수리 건 바구니에 보관", "부품 수량 일치·분해 중 손상 없음"], photo: true, std: "재사용 불가 클립 교환 목록을 메모에 적습니다." },
  outsource: { label: "외주(계측·특수 작업)", rank: 1, checks: ["외주 결과지 받음", "결과지 내용을 공장장에게 보고"], photo: true, std: "결과지를 사진으로 올립니다." },
  dent: { label: "덴트", rank: 2, checks: ["라이트 보드로 빛 반사선이 곧음", "도막 균열·들뜸 없음", "패널 뒷면 방청제 원상 복구"], photo: true, std: "작업 전후 사진을 올립니다." },
  sheet: { label: "판금·용접", rank: 2, checks: ["단차·간격이 반대편과 같음", "용접은 제조사 지정 방식(스폿·MIG·브레이징)", "용접부 방청·실러 처리"], photo: true, std: "용접 방식을 메모에 적습니다." },
  putty: { label: "퍼티·서페이서", rank: 3, checks: ["퍼티 두께 제품 기준(통상 3mm) 이하", "단계별 샌딩·가이드 코트 사용", "핀홀·샌딩 자국·가장자리 단차 없음"], photo: true, std: "" },
  color: { label: "조색", rank: 3, checks: ["컬러 코드 배합에서 시작", "시편을 인접 패널과 자연광·색도등에서 비교", "배합 기록 저장"], photo: true, std: "시편 사진과 배합(도료 회사·배합 번호·로트)을 남깁니다. 퍼티·마스킹과 함께 진행할 수 있습니다." },
  mask: { label: "마스킹", rank: 4, checks: ["유리·고무·센서·번호판 덮음", "백 마스킹으로 테두리 자국 방지", "누락 부위 없음"], photo: false, std: "" },
  paint: { label: "도장", rank: 6, checks: ["도장 부스 안에서 작업·온습도 기록", "도료 TDS의 도막 두께·플래시 타임 준수", "먼지·흘러내림·오렌지 필 없음"], photo: true, std: "인접 패널 블렌딩이 원칙입니다." },
  dry: { label: "건조", rank: 7, checks: ["TDS의 온도·시간 준수", "건조 전 이동하지 않음"], photo: false, std: "온도와 시간을 적습니다." },
  polish: { label: "광택", rank: 8, checks: ["클리어층 두께 안에서만 연마", "스월 마크·홀로그램·버닝 없음"], photo: true, std: "" },
  calibrate: { label: "센서·카메라 보정", rank: 9, checks: ["경고등 꺼짐", "센서·카메라 기능 확인", "보정 결과지 받음(외주면 결과지)"], photo: true, std: "결과지를 사진으로 올립니다." },
  assemble: { label: "조립·작동 확인", rank: 10, checks: ["분해 역순 조립·볼트 체결", "등화·센서·카메라 작동 확인", "커버 걷기 전 실내 확인·세차"], photo: true, std: "" },
  rework: { label: "재작업(검사 불합격)", rank: 11, checks: ["불합격 항목을 고침", "그 작업으로 영향받은 부분 확인"], photo: true, std: "최종 검사의 불합격 내용을 고칩니다. 끝나면 다시 검사합니다." },
} as const;
export type Process = keyof typeof PROCESSES;
export const isProcess = (s: string): s is Process => s in PROCESSES;
export const processLabel = (p: string) => (isProcess(p) ? PROCESSES[p].label : p);

export const WO_STATUS_LABEL = { planned: "작업 대기", working: "작업 중", done: "작업 끝·검사 대기" } as const;
export const STEP_STATUS_LABEL = { waiting: "대기", ready: "시작 가능", started: "작업 중", done: "끝" } as const;

type ApprovedLine = { id: string; category: string; laborMinutes: number; name: string };
export type StepDraft = { process: Process; lineIds: string[]; stdMinutes: number };

/** 승인한 견적 줄 → 공정. 승인하지 않은 줄은 넣지 않는다(STD-04 4절 1). 도장이 있으면 마스킹·조색·건조·광택을, 판금이면 퍼티를 붙인다 */
export function buildSteps(lines: ApprovedLine[]): StepDraft[] {
  const by = new Map<Process, StepDraft>();
  const add = (p: Process, l?: ApprovedLine, minutes = 0) => {
    const s = by.get(p) ?? { process: p, lineIds: [], stdMinutes: 0 };
    if (l && !s.lineIds.includes(l.id)) s.lineIds.push(l.id);
    s.stdMinutes += minutes;
    by.set(p, s);
  };
  for (const l of lines) {
    const m = l.laborMinutes;
    if (l.category === "detach" || l.category === "part") add("detach", l, l.category === "detach" ? Math.round(m / 2) : 0);
    if (l.category === "detach") add("assemble", l, m - Math.round(m / 2));
    if (l.category === "part") add("assemble", l);
    if (l.category === "dent") add("dent", l, m);
    if (l.category === "sheet") {
      add("sheet", l, m);
      add("putty", l);
    }
    if (l.category === "paint") {
      for (const p of ["mask", "color", "paint", "dry", "polish"] as const) add(p, l, p === "paint" ? m : 0);
    }
    if (l.category === "polish") add("polish", l, m);
    if (l.category === "outsource") add("outsource", l, m);
    if (l.category === "etc") add(/보정|센서|카메라/.test(l.name) ? "calibrate" : "assemble", l, m);
  }
  if (by.size) add("assemble");
  return [...by.values()].sort((a, b) => PROCESSES[a.process].rank - PROCESSES[b.process].rank);
}

type StepLike = { id: string; process: string; endedAt: Date | null };

/** 이 공정을 시작하려면 끝나 있어야 하는 앞 공정(4절 5). 조색은 퍼티·마스킹과 병행할 수 있어 마스킹의 앞 공정이 아니다 */
export function blockers<T extends StepLike>(steps: T[], step: T): T[] {
  const rank = (s: StepLike) => (isProcess(s.process) ? PROCESSES[s.process].rank : 99);
  const r = rank(step);
  return steps.filter((s) => s.id !== step.id && !s.endedAt && rank(s) < r && !(s.process === "color" && r < PROCESSES.paint.rank));
}

/** 공정을 끝낼 때 빠진 것(저장 전에 화면에서 보여 줌) */
export function finishIssues(process: string, input: { checks: string[]; photos: number; detail: Record<string, string> }) {
  const out: string[] = [];
  if (!isProcess(process)) return ["알 수 없는 공정입니다"];
  const p = PROCESSES[process];
  const missing = p.checks.filter((c) => !input.checks.includes(c));
  if (missing.length) out.push(`자주 검사 ${missing.length}개를 확인하지 않았습니다: ${missing.join(", ")}`);
  if (p.photo && input.photos < 1) out.push("사진을 한 장 이상 올려야 합니다");
  if (process === "color" && (!input.detail.colorCode || !input.detail.mixNo)) out.push("조색: 컬러 코드와 배합 번호를 적어야 합니다");
  if (process === "dry" && (!input.detail.tempC || !input.detail.minutes)) out.push("건조: 온도와 시간을 적어야 합니다");
  if (process === "sheet" && !input.detail.weld) out.push("판금: 용접 방식을 적어야 합니다(용접 안 했으면 '없음')");
  return out;
}

export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
