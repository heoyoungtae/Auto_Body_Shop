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


/** 견적 승인 묶음(진단 줄 id 로 묶임) → 승인 그림 구역. 진단 줄이 없는 묶음(직접 넣은 줄)은 그림에 없다 */
export const approvalZones = (groups: { key: string }[], list: Damage[]) =>
  groups.flatMap((g) => {
    const d = list.find((x) => x.id === g.key);
    return d ? [{ key: g.key, seq: d.seq, part: d.part, view: viewOf(d), cells: d.cells, label: partName(d.part, d.subPart) }] : [];
  });

/** 작업 진행 색(대기·작업 중·끝·안 고침) */
export const PROGRESS = {
  wait: { label: "작업 전", color: "#9aa3ab" },
  doing: { label: "작업 중", color: "#f59e0b" },
  done: { label: "끝", color: "#16a34a" },
  skip: { label: "안 고침(승인 안 됨)", color: "#d1d5db" },
} as const;
type Prog = { state: keyof typeof PROGRESS; process: string | null };

export const progressFills = (list: Damage[], prog: Map<string, Prog>): MapFill[] =>
  list.map((d) => {
    const p = prog.get(d.id)?.state ?? "wait";
    return { part: d.part, view: viewOf(d), cells: d.cells, color: PROGRESS[p].color, strength: p === "skip" ? 0.25 : 0.6 };
  });
export const progressPins = (list: Damage[], prog: Map<string, Prog>, processName: (p: string) => string): MapPin[] =>
  list.flatMap((d) => {
    const view = viewOf(d);
    if (!view) return [];
    const p = prog.get(d.id) ?? { state: "wait" as const, process: null };
    const cell = d.cells.length ? d.cells[Math.floor(d.cells.length / 2)] : 4;
    const now = p.state === "doing" && p.process ? ` · 지금 ${processName(p.process)}` : p.state === "wait" && p.process ? ` · 첫 공정 ${processName(p.process)}` : "";
    return [{ key: d.id, part: d.part, view, cell, color: PROGRESS[p.state].color, text: String(d.seq), title: `${d.seq}. ${partName(d.part, d.subPart)} · ${PROGRESS[p.state].label}${now}` }];
  });

export function ProgressLegend({ list, prog, processName }: { list: Damage[]; prog: Map<string, Prog>; processName: (p: string) => string }) {
  return (
    <div className="mt-1 space-y-1 text-xs text-[var(--muted)]">
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        {(Object.keys(PROGRESS) as (keyof typeof PROGRESS)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: PROGRESS[k].color }} />
            {PROGRESS[k].label} {list.filter((d) => (prog.get(d.id)?.state ?? "wait") === k).length}
          </span>
        ))}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {list.map((d) => {
          const p = prog.get(d.id) ?? { state: "wait" as const, process: null };
          return (
            <li key={d.id}>
              {d.seq}. {partName(d.part, d.subPart)} — <span style={{ color: p.state === "skip" ? undefined : PROGRESS[p.state].color }}>{PROGRESS[p.state].label}</span>
              {p.state === "doing" && p.process ? `(${processName(p.process)})` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
