// 환경(STD-10) 규칙. 화면과 서버가 함께 쓴다.

export const ENV_EVENTS = {
  filter: "필터 교체",
  carbon: "활성탄 교체",
  measure: "자가측정",
  separator: "유수분리조 점검",
  spill: "누출·흡수 처리",
} as const;
export type EnvEventKind = keyof typeof ENV_EVENTS;

/** 10.2·STD-10 6절 폐기물 품목. designated: 지정폐기물(보관 기간 한도 관리, 전자인계 필수) [확인 필요: 항목별 분류] */
export const WASTE_ITEMS = {
  paint: { label: "폐도료·폐시너·세척 용제", group: "designated", unit: "kg" },
  oil: { label: "폐유(윤활유·유압유)", group: "designated", unit: "kg" },
  filter: { label: "폐필터·활성탄", group: "designated", unit: "kg" },
  rag: {
    label: "도료 묻은 걸레·마스킹지·흡수포",
    group: "designated",
    unit: "kg",
  },
  can: { label: "빈 도료캔(잔류물)", group: "designated", unit: "kg" },
  sludge: { label: "세척수·연마 슬러지", group: "designated", unit: "kg" },
  dust: { label: "샌딩 먼지", group: "general", unit: "kg" },
  parts: { label: "폐부품(범퍼·패널)", group: "general", unit: "kg" },
  packing: { label: "포장재", group: "general", unit: "kg" },
  metal: { label: "고철·알루미늄", group: "recycle", unit: "kg" },
  paper: { label: "골판지", group: "recycle", unit: "kg" },
} as const;
export type WasteItem = keyof typeof WASTE_ITEMS;
export const WASTE_GROUP = {
  designated: "지정폐기물",
  general: "사업장 일반",
  recycle: "재활용",
} as const;

/** 공정별 환경측면 초안(STD-10 4절) → 리스크·기회 대장(10장) */
export const ENV_ASPECTS: {
  content: string;
  likelihood: number;
  impact: number;
  control: string;
}[] = [
  {
    content: "[환경측면] 도장 VOC·도료 미스트 배출(대기)",
    likelihood: 2,
    impact: 3,
    control: "도장 부스 필터·활성탄, 배출시설 신고",
  },
  {
    content:
      "[환경측면] 지정폐기물(폐도료·폐시너·폐필터) 보관 기간 초과·부적정 처리",
    likelihood: 1,
    impact: 3,
    control: "폐기물 관리대장, 허가 업체 위탁, 올바로 전자인계",
  },
  {
    content: "[환경측면] 세척수·연마 슬러지 하수구 유출(수질·토양)",
    likelihood: 1,
    impact: 3,
    control: "세척수 폐기물 처리, 유출 방지 키트",
  },
  {
    content: "[환경측면] 샌딩 분진 비산",
    likelihood: 2,
    impact: 2,
    control: "집진 샌더, 작업장 문 닫기",
  },
  {
    content: "[환경측면] 그라인딩·해머링 소음·도장 냄새 민원",
    likelihood: 2,
    impact: 2,
    control: "작업 시간 제한, 부스 문 닫고 도장",
  },
  {
    content: "[환경측면] 전기·가스 사용(부스 가열·컴프레서)",
    likelihood: 3,
    impact: 1,
    control: "가동 시간 기록, 누기 점검",
  },
];

/**
 * 먼저 낸 것 먼저 처리(FIFO)로 아직 인계하지 않은 가장 이른 발생일과 보관량.
 * gens·outs 는 날짜 순이 아니어도 된다
 */
export function storageOf(
  gens: { on: string; qty: number }[],
  outs: { qty: number }[],
) {
  let out = outs.reduce((a, o) => a + o.qty, 0);
  const total = gens.reduce((a, g) => a + g.qty, 0);
  const stock = Math.round((total - out) * 10) / 10;
  for (const g of [...gens].sort((a, b) => a.on.localeCompare(b.on))) {
    if (out >= g.qty - 1e-9) {
      out -= g.qty;
      continue;
    }
    return { stock, since: g.on };
  }
  return { stock: Math.max(0, stock), since: null as string | null };
}

export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5,
  );
