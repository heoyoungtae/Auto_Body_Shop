// 진단 줄을 차 그림에 올리는 공통 값(진단·견적 화면이 같이 쓴다). 상태·이벤트가 없어 서버·브라우저 어디서나 부른다.
import type { roDamage } from "@/db/schema";
import { cellsLabel, isView } from "@/modules/repair/body-map";
import { damageSeverity, METHOD_COLORS, METHODS, partName } from "@/modules/repair/rules";
import type { MapFill, MapPin } from "./car-map";

type Damage = typeof roDamage.$inferSelect;

export const viewOf = (d: Damage) => (d.view && isView(d.view) ? d.view : null);
export const methodColor = (m: string) => METHOD_COLORS[m as keyof typeof METHOD_COLORS] ?? "#8a949b";
/** 진단 줄 → 그림 칠(수리 방법 색, 정도가 셀수록 진하게) */
export const damageFills = (list: Damage[], faint = false): MapFill[] =>
  list.map((d) => ({ part: d.part, view: viewOf(d), cells: d.cells, color: faint ? "#8a949b" : methodColor(d.method), strength: faint ? 0.3 : 0.3 + damageSeverity(d) * 0.15 }));
/** 진단 줄 → 번호 기호(고른 칸 가운데, 칸이 없으면 부위 가운데) */
export const damagePins = (list: Damage[]): MapPin[] =>
  list.flatMap((d) => {
    const view = viewOf(d);
    if (!view) return [];
    const cell = d.cells.length ? d.cells[Math.floor(d.cells.length / 2)] : 4;
    return [{ key: d.id, part: d.part, view, cell, color: methodColor(d.method), text: String(d.seq), title: `${d.seq}. ${partName(d.part, d.subPart)} · ${cellsLabel(view, d.cells)} · ${METHODS[d.method as keyof typeof METHODS] ?? d.method}` }];
  });

export function MethodLegend() {
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
      {(Object.keys(METHODS) as (keyof typeof METHODS)[]).map((m) => (
        <span key={m} className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ background: METHOD_COLORS[m] }} />
          {METHODS[m]}
        </span>
      ))}
      <span>· 칸이 진할수록 손상 정도가 심함(경·중·심)</span>
    </p>
  );
}

