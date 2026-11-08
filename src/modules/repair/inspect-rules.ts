// 최종 검사(F-05-01, STD-05 5절)와 출고(F-05-02). 화면과 서버가 함께 쓴다.

/** 검사 항목. need 는 그 공정이 있었을 때만 묻는다(없으면 '해당 없음') */
export const INSPECT_ITEMS = [
  { key: "scope", group: "범위", label: "작업 지시서의 모든 작업 항목 완료", method: "지시서 대조", pass: "누락 0건" },
  { key: "surface", group: "판금·덴트", label: "면 평활도", method: "검사등 육안·손 촉감", pass: "굴곡이 보이지 않음", need: ["dent", "sheet"] },
  { key: "gap", group: "판금", label: "패널 단차·간극", method: "간극 게이지", pass: "좌우 차이 정책값 이내", need: ["sheet", "detach"], measure: "gapMm" },
  { key: "color", group: "도장", label: "색상 일치", method: "자연광·표준 광원, 3개 각도", pass: "인접 패널과 색차가 눈에 띄지 않음", need: ["paint"] },
  { key: "defect", group: "도장", label: "도막 결함(먼지·흐름·오렌지 필·핀홀·크레이터)", method: "검사등 육안", pass: "1m에서 보이는 결함 0건", need: ["paint"] },
  { key: "film", group: "도장", label: "도막 두께(패널당 5점)", method: "도막 측정기", pass: "정책값 범위 이내", need: ["paint"], measure: "filmUm" },
  { key: "polish", group: "광택", label: "스월 마크·버닝", method: "검사등", pass: "결함 0건", need: ["polish"] },
  { key: "assembly", group: "조립", label: "탈착 부품 체결·클립 누락·몰딩 들뜸", method: "육안·손 확인", pass: "누락·들뜸 0건", need: ["detach", "assemble"], safety: true },
  { key: "electric", group: "전장", label: "램프·센서·경고등, 탈착한 전장 부품 작동", method: "시동 후 확인", pass: "정상 작동, 경고등 없음", safety: true },
  { key: "clean", group: "청결", label: "실내·외 오염, 마스킹 잔여물, 연마 가루", method: "육안", pass: "잔여물 0건" },
  { key: "belongings", group: "고객 소지품", label: "입고 때 기록한 소지품·단말기 그대로", method: "입고 점검표 대조", pass: "일치" },
  { key: "photos", group: "사진", label: "작업 후 사진(작업 전과 같은 각도)", method: "앱 촬영", pass: "정해진 장수 이상" },
] as const;
export type InspectKey = (typeof INSPECT_ITEMS)[number]["key"];

/** 이 수리에서 물어야 할 항목(한 공정도 없으면 해당 없음) */
export function itemsFor(processes: string[]) {
  return INSPECT_ITEMS.filter((i) => !("need" in i) || i.need.some((p) => processes.includes(p)));
}

export type InspectInput = { passed: string[]; gapMm: number | null; filmUm: number[]; failNote: string };
type Limits = { gapMm: number; filmMin: number; filmMax: number; photos: number };

/** 판정: 체크 안 한 항목, 정책값을 벗어난 측정값은 불합격. 사진 장수 부족도 불합격 */
export function judge(processes: string[], input: InspectInput, photos: number, lim: Limits) {
  const items = itemsFor(processes);
  const fails: { key: string; why: string }[] = [];
  for (const i of items) if (!input.passed.includes(i.key)) fails.push({ key: i.key, why: `${i.group} ${i.label}` });
  const has = (k: string) => items.some((i) => i.key === k);
  if (has("gap") && input.passed.includes("gap") && (input.gapMm == null || input.gapMm > lim.gapMm)) fails.push({ key: "gap", why: input.gapMm == null ? "간극 측정값을 적지 않았습니다" : `간극 차 ${input.gapMm}mm > ${lim.gapMm}mm` });
  if (has("film") && input.passed.includes("film")) {
    if (input.filmUm.length < 5) fails.push({ key: "film", why: `도막 두께는 5점을 적습니다(지금 ${input.filmUm.length}점)` });
    const out = input.filmUm.filter((v) => v < lim.filmMin || v > lim.filmMax);
    if (out.length) fails.push({ key: "film", why: `도막 두께 ${out.join("·")}μm가 ${lim.filmMin}~${lim.filmMax}μm 밖` });
  }
  if (photos < lim.photos && input.passed.includes("photos")) fails.push({ key: "photos", why: `작업 후 사진 ${photos}장 < ${lim.photos}장` });
  const uniq = [...new Map(fails.map((f) => [f.key + f.why, f])).values()];
  return { items, fails: uniq, pass: uniq.length === 0 };
}

export const parseFilm = (s: string) =>
  s
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number)
    .slice(0, 10);

/** 출고 때 고객에게 확인받는 안내(F-05-02 안내 확인란) */
export const DELIVERY_NOTICES = {
  photos: "작업 전후 사진과 수리 부위 설명을 들었습니다",
  care: "도장 후 세차·왁스 금지 기간 안내를 받았습니다",
  warranty: "보증 기간·범위 안내를 받았습니다",
  returned: "차량 키·소지품을 돌려받았습니다",
} as const;
export type DeliveryNotice = keyof typeof DELIVERY_NOTICES;

export const PAY_METHODS = { card: "카드", cash: "현금", transfer: "계좌 이체", insurance: "보험사 직접 지급", receivable: "미수(나중에 받음)" } as const;

/** 법정 서식(별지 제89호의2) 안내 1: 정비 잘못으로 생긴 고장의 무상 점검·정비 기간 */
export function legalFreeDays(registeredOn: string | null, mileage: number | null, today: string) {
  const years = registeredOn ? (Date.parse(today) - Date.parse(registeredOn)) / (365.25 * 864e5) : 99;
  const km = mileage ?? 1e9;
  if (years < 1 || km <= 20_000) return 90;
  if (years < 3 || km <= 60_000) return 60;
  return 30;
}
