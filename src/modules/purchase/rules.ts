// 구매·자재·외주 규칙(STD-07) — 화면과 서버가 같이 쓰는 표와 계산(데이터베이스 없음)

export const SUPPLIER_KINDS = { parts: "부품", paint: "도료", consumable: "소모품", outsource: "외주 가공", waste: "폐기물 위탁" } as const;
export type SupplierKind = keyof typeof SUPPLIER_KINDS;
export const isSupplierKind = (s: string): s is SupplierKind => s in SUPPLIER_KINDS;

/** 4.1 확인 서류. need: 그 업종이면 꼭 확인 */
export const SUPPLIER_DOCS = {
  biz: { label: "사업자등록 확인", need: ["parts", "paint", "consumable", "outsource", "waste"] },
  price: { label: "단가표", need: ["parts", "paint", "consumable"] },
  tds: { label: "도료 TDS(기술 자료)", need: ["paint"] },
  msds: { label: "MSDS(물질안전보건자료)", need: ["paint"] },
  license: { label: "인허가(정비업·폐기물 처리 등)", need: ["outsource", "waste"] },
  insurance: { label: "보험 가입(배상 책임)", need: ["outsource"] },
} as const satisfies Record<string, { label: string; need: SupplierKind[] }>;
export type SupplierDoc = keyof typeof SUPPLIER_DOCS;

export const SUPPLIER_STATUS = { candidate: "후보(평가 전)", proposed: "등록 승인 대기", registered: "등록", rejected: "등록 안 함", stopped: "거래 중지" } as const;
export type SupplierStatus = keyof typeof SUPPLIER_STATUS;
export const SUPPLIER_TONE: Record<SupplierStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { candidate: "neutral", proposed: "warn", registered: "ok", rejected: "danger", stopped: "danger" };

/** 4.2 평가 항목과 배점(100점) */
export const EVAL_ITEMS = [
  { key: "quality", label: "품질", max: 30 },
  { key: "delivery", label: "납기", max: 25 },
  { key: "price", label: "가격", max: 20 },
  { key: "docs", label: "서류·인허가", max: 15 },
  { key: "safety", label: "안전·환경 준수", max: 10 },
] as const;
export type EvalKey = (typeof EVAL_ITEMS)[number]["key"];
/** 등록 기준(4.2) */
export const REGISTER_MIN = 70;
/** 긴급 사용 뒤 등록 평가를 마칠 기한(일) */
export const EMERGENCY_DAYS = 7;

export function missingDocs(kinds: string[], docs: string[]): SupplierDoc[] {
  return (Object.keys(SUPPLIER_DOCS) as SupplierDoc[]).filter((d) => (SUPPLIER_DOCS[d].need as readonly string[]).some((k) => kinds.includes(k)) && !docs.includes(d));
}

export function evalTotal(scores: Record<string, number>) {
  return EVAL_ITEMS.reduce((s, i) => s + Math.max(0, Math.min(i.max, Math.round(scores[i.key] ?? 0))), 0);
}

export function evalIssues(scores: Record<string, number>): string[] {
  const out: string[] = [];
  for (const i of EVAL_ITEMS) {
    const v = scores[i.key];
    if (v == null || !Number.isFinite(v)) out.push(`${i.label} 점수를 적어 주세요`);
    else if (v < 0 || v > i.max) out.push(`${i.label}은(는) 0~${i.max}점입니다`);
  }
  return out;
}

/**
 * 정기 평가 결과(4.5): 거래 중단 기준(정책값) 미만이 2년 연속이면 거래 중지, 한 해면 개선 요청,
 * 개선 기준 미만이면 개선 요청, 그 위면 유지
 */
export function annualOutcome(total: number, lastYearTotal: number | null, p: { improveBelow: number; stopBelow: number }): "ok" | "improve" | "stop" {
  if (total < p.stopBelow && lastYearTotal != null && lastYearTotal < p.stopBelow) return "stop";
  if (total < p.improveBelow) return "improve";
  return "ok";
}
export const OUTCOME_LABEL = { ok: "유지", improve: "개선 요청", stop: "거래 중지" } as const;

/** 앱 실적으로 정기 평가 참고 점수를 제안: 납기 준수율 → 납기 점수, 불량 입고 → 품질 점수 */
export function suggestScores(stats: { onTimePct: number | null; badLines: number; lines: number; claims: number }): Partial<Record<EvalKey, number>> {
  const out: Partial<Record<EvalKey, number>> = {};
  if (stats.onTimePct != null) out.delivery = Math.round((25 * stats.onTimePct) / 100);
  if (stats.lines > 0) out.quality = Math.max(0, Math.round(30 * (1 - stats.badLines / stats.lines)) - stats.claims * 3);
  return out;
}

// ── 발주 ──
export const PO_KINDS = { repair: "수리 건 부품", stock: "도료·소모품(재고)" } as const;
export type PoKind = keyof typeof PO_KINDS;
export const PO_STATUS = { draft: "작성 중", review: "승인 대기", approved: "승인(발주 전)", sent: "발주함", partial: "일부 입고", received: "입고 끝", cancelled: "취소" } as const;
export type PoStatus = keyof typeof PO_STATUS;
export const PO_TONE: Record<PoStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { draft: "neutral", review: "warn", approved: "accent", sent: "accent", partial: "warn", received: "ok", cancelled: "neutral" };
export const SENT_VIA = { phone: "전화", message: "문자·메신저", email: "메일", fax: "팩스", visit: "방문" } as const;
export type SentVia = keyof typeof SENT_VIA;
export const isSentVia = (s: string): s is SentVia => s in SENT_VIA;

/** 6.1~6.2 검수 확인 항목. paint: 도료가 있을 때만 */
export const RECEIPT_CHECKS = {
  match: { label: "발주서와 품번·수량 대조" },
  look: { label: "외관(파손·변형·도장면 흠)" },
  pack: { label: "포장 상태" },
  expiry: { label: "도료 유효기간·로트 번호", paint: true },
} as const;
export type ReceiptCheck = keyof typeof RECEIPT_CHECKS;

export const VAT = 0.1;
export function poTotals(lines: { qty: number; unitWon: number }[]) {
  const supply = lines.reduce((s, l) => s + l.qty * l.unitWon, 0);
  return { supply, total: supply + Math.round(supply * VAT) };
}

export function poIssues(o: { kind: string; supplierId: string | null; dueOn: string | null }, lines: { name: string; qty: number; unitWon: number; partCode: string | null }[]): string[] {
  const out: string[] = [];
  if (!o.supplierId) out.push("업체를 골라 주세요");
  if (!o.dueOn) out.push("요청 납기를 적어 주세요");
  if (!lines.length) out.push("발주할 품목이 없습니다");
  lines.forEach((l, i) => {
    if (!l.name.trim()) out.push(`${i + 1}번 줄: 품명을 적어 주세요`);
    if (!(l.qty > 0)) out.push(`${i + 1}번 줄(${l.name}): 수량을 적어 주세요`);
    if (!(l.unitWon > 0)) out.push(`${i + 1}번 줄(${l.name}): 단가를 적어 주세요`);
    if (o.kind === "repair" && !l.partCode) out.push(`${i + 1}번 줄(${l.name}): 부품 구분(A·B·C·D·F)이 없습니다`);
  });
  return out;
}

/** 납기 회신이 수리 건 출고 약속일보다 늦은지(5.6) */
export const lateForRepair = (replyDueOn: string | null, roDueOn: string | null) => !!(replyDueOn && roDueOn && replyDueOn > roDueOn);

// ── 재고 ──
export const STOCK_KINDS = { paint: "도료(퍼티·경화제 포함)", consumable: "소모품", part: "상비 부품" } as const;
export type StockKind = keyof typeof STOCK_KINDS;
export const isStockKind = (s: string): s is StockKind => s in STOCK_KINDS;
export const STOCK_UNITS = ["개", "통", "캔", "L", "kg", "롤", "장", "박스", "세트"] as const;
export const MOVE_REASON = { receive: "입고", use: "사용", count: "실사 조정", discard: "폐기(유효기간)" } as const;
/** 유효기간 알림(7절: 30일 전) */
export const EXPIRY_ALERT_DAYS = 30;
export const COUNT_KINDS = { monthly: "월말 실사(도료·고가 소모품)", quarterly: "분기 말 전체 실사" } as const;
export type CountKind = keyof typeof COUNT_KINDS;

export const belowSafety = (i: { qty: number; safetyQty: number }) => i.safetyQty > 0 && i.qty < i.safetyQty;
/** 안전 재고까지 채우고 한 번 더 쓸 만큼(안전 재고의 두 배까지) 발주 제안 */
export const suggestOrderQty = (i: { qty: number; safetyQty: number }) => Math.max(0, i.safetyQty * 2 - i.qty);

/** 선입선출: 유효기간 빠른 로트부터 qty 만큼 뺀다. 남은 로트 수량을 돌려준다 */
export function fifoTake<T extends { id: string; expiresOn: string; qty: number }>(lots: T[], qty: number): { id: string; take: number }[] {
  const out: { id: string; take: number }[] = [];
  let left = qty;
  for (const l of [...lots].filter((x) => x.qty > 0).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))) {
    if (left <= 0) break;
    const take = Math.min(l.qty, left);
    out.push({ id: l.id, take });
    left -= take;
  }
  return out;
}

/** 실사 차이 비율(금액 기준, %) */
export function countDiff(lines: { book: number; actual: number; unitWon: number }[]) {
  const bookWon = lines.reduce((s, l) => s + l.book * l.unitWon, 0);
  const diffWon = lines.reduce((s, l) => s + Math.abs(l.actual - l.book) * l.unitWon, 0);
  return { bookWon, diffWon, pct: bookWon > 0 ? Math.round((diffWon / bookWon) * 1000) / 10 : diffWon > 0 ? 100 : 0 };
}

// ── 외주 ──
export const OUT_TYPES = { frame: "프레임 교정", adas: "첨단운전보조(ADAS) 보정", glass: "유리 교환", electric: "전장 수리", wheel: "휠 복원", diag: "외주 진단(프레임 계측)", other: "기타" } as const;
export type OutType = keyof typeof OUT_TYPES;
export const isOutType = (s: string): s is OutType => s in OUT_TYPES;
export const OS_STATUS = { draft: "작성 중", review: "승인 대기", approved: "승인(의뢰 전)", requested: "의뢰함", out: "차량 반출", returned: "결과 받음(확인 대기)", accepted: "수용(끝)", cancelled: "취소" } as const;
export type OsStatus = keyof typeof OS_STATUS;
export const OS_TONE: Record<OsStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { draft: "neutral", review: "warn", approved: "accent", requested: "accent", out: "warn", returned: "warn", accepted: "ok", cancelled: "neutral" };
export const OS_STEPS: OsStatus[] = ["draft", "review", "approved", "requested", "out", "returned", "accepted"];

// ── 비품·자산(9절) ──
export const FX_CATEGORIES = { tool: "공구", ppe: "보호구", it: "전산(저장장치 있음)", furniture: "집기·가구", vehicle: "운반·차량", other: "기타" } as const;
export type FxCategory = keyof typeof FX_CATEGORIES;
export const isFxCategory = (s: string): s is FxCategory => s in FX_CATEGORIES;
export const FX_STATUS = { in_use: "사용 중", lost: "분실", broken: "파손", disposed: "처분" } as const;
export type FxStatus = keyof typeof FX_STATUS;
export const FX_TONE: Record<FxStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { in_use: "ok", lost: "danger", broken: "warn", disposed: "neutral" };
export const FX_EVENT = { register: "등록", move: "위치·사용자 변경", receive: "수령 확인", check: "실물 확인", lost: "분실", broken: "파손", found: "되찾음·수리", dispose: "처분", label: "라벨 부착" } as const;
export const DISPOSE_METHODS = { sell: "매각", scrap: "폐기", donate: "기증" } as const;
export type DisposeMethod = keyof typeof DISPOSE_METHODS;
export const CHECK_RESULTS = { ok: "있음(이상 없음)", lost: "없음(분실)", broken: "파손" } as const;
export type CheckResult = keyof typeof CHECK_RESULTS;
/** 등록 기한: 받은 날부터 3일(9.2) */
export const FX_REGISTER_DAYS = 3;

/** 다음 관리 번호(FX-001, FX-002 …) */
export function nextFxNo(existing: string[]) {
  const n = existing.map((x) => Number(/^FX-(\d+)$/.exec(x)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0) + 1;
  return `FX-${String(n).padStart(3, "0")}`;
}
