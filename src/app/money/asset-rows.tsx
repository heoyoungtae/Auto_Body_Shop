"use client";
// 지출 결의서 안의 '대장 등록' 줄(대표 지시 2026-11-12): 산 비품·설비·치공구를 결의와 함께 대장에 올린다(입고 대기).
// 금액·구입일·업체·결의 번호는 결의서 값을 쓰므로 여기서는 품명·수량·한 개 값·구분·위치·관리자만 받는다.
import { useRef, useState } from "react";
import type { FieldHelpKey } from "@/modules/help/fields";
import { guessAsset } from "@/modules/asset/rules";
import { TOOL_KEEP } from "@/modules/equipment/rules";
import { HelpButton } from "../_help-drawer";

const toolKeeps = Object.entries(TOOL_KEEP).map(([value, label]) => ({ value, label }));

type Opt = { value: string; label: string };
type Kind = "fixture" | "equipment" | "tool";
type Row = { key: number; kind: Kind; name: string; cat: string; qty: string; unitWon: string; location: string; managerId: string; subManagerId: string; holderId: string; guessed: boolean };

const box = "h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-base outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";
const digits = (v: string) => v.replace(/[^\d]/g, "");
const comma = (v: string) => (digits(v) ? Number(digits(v)).toLocaleString("ko-KR") : "");
const empty = (key: number): Row => ({ key, kind: "fixture", name: "", cat: "tool", qty: "1", unitWon: "", location: "", managerId: "", subManagerId: "", holderId: "", guessed: false });

export function AssetRows({ fxCats, eqKinds, users, defaultManager, optional, defaults }: { fxCats: Opt[]; eqKinds: Opt[]; users: Opt[]; defaultManager?: { fixture?: string; equipment?: string }; optional?: boolean; defaults?: { name: string; kind?: Kind; qty?: number; unitWon?: number | null } }) {
  // 치공구 안전재고 부족에서 왔으면(?tool=) 치공구 줄로 품명·수량을 채워 둔다
  const [rows, setRows] = useState<Row[]>(() => [
    defaults?.kind === "tool"
      ? { ...empty(1), kind: "tool", cat: "board", name: defaults.name, qty: String(defaults.qty || 1), unitWon: defaults.unitWon ? String(defaults.unitWon) : "", managerId: defaultManager?.equipment || "", guessed: true }
      : { ...empty(1), name: defaults?.name ?? "" },
  ]);
  const seed = useRef(1);
  const root = useRef<HTMLDivElement>(null);
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const supply = () => {
    const el = root.current?.closest("form")?.querySelector<HTMLInputElement>('input[type=hidden][name="supplyWon"]');
    return Number(el?.value || 0);
  };
  const onName = (r: Row, v: string) => {
    // 품명으로 비품·설비와 구분을 먼저 골라 둔다(직접 바꾸면 그대로 둠)
    if (r.guessed || !v.trim()) return set(r.key, { name: v });
    const g = guessAsset(v);
    set(r.key, g.kind === "equipment" ? { name: v, kind: "equipment", cat: g.eqKind, qty: "1", managerId: r.managerId || defaultManager?.equipment || "" } : { name: v, kind: "fixture", cat: g.fxCategory, managerId: r.managerId || defaultManager?.fixture || "" });
  };
  const fillRest = (r: Row) => {
    const others = rows.filter((x) => x.key !== r.key && x.name.trim()).reduce((t, x) => t + (Number(digits(x.qty)) || 0) * (Number(digits(x.unitWon)) || 0), 0);
    const q = Number(digits(r.qty)) || 1;
    const rest = Math.max(0, supply() - others);
    set(r.key, { unitWon: String(Math.floor(rest / q)) });
  };
  const filled = rows.filter((r) => r.name.trim());
  const total = filled.reduce((t, r) => t + (Number(digits(r.qty)) || 0) * (Number(digits(r.unitWon)) || 0), 0);
  const head = (id: FieldHelpKey, label: string, cls = "") => (
    <th className={`py-1.5 pr-2 font-medium ${cls}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <HelpButton topic={{ kind: "field", id }} name={label} />
      </span>
    </th>
  );
  const body = (
    <div ref={root} className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              {head("asset.kind", "대장", "w-24")}
              {head("asset.name", "품명", "min-w-[12rem]")}
              {head("asset.cat", "구분·종류", "w-36")}
              {head("asset.qty", "수량", "w-16")}
              {head("asset.unitWon", "한 개 공급가", "w-36")}
              {head("asset.location", "위치·구역", "w-32")}
              {head("asset.manager", "관리자(정)", "w-32")}
              {head("asset.subManager", "관리자(부)", "w-32")}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const need = !!r.name.trim();
              const n = (k: string) => `a${r.key}_${k}`;
              return (
                <tr key={r.key} className="align-top">
                  <td className="py-1 pr-2">
                    <select data-assist="grid" aria-label={`${i + 1}번째 줄 대장`} name={n("kind")} value={r.kind} className={box} onChange={(e) => {
                        const k = e.target.value as Kind;
                        set(r.key, { kind: k, cat: k === "equipment" ? "other" : k === "tool" ? "board" : "tool", qty: k === "equipment" ? "1" : r.qty, subManagerId: k === "tool" ? "" : r.subManagerId, managerId: r.managerId || (k === "fixture" ? defaultManager?.fixture : defaultManager?.equipment) || "", guessed: true });
                      }}>
                      <option value="fixture">비품</option>
                      <option value="equipment">설비</option>
                      <option value="tool">치공구</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 품명`} name={n("name")} value={r.name} className={box} placeholder={i === 0 ? "예: 전동 샌더" : ""} onChange={(e) => onName(r, e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <select data-assist="grid" aria-label={`${i + 1}번째 줄 구분`} name={n("cat")} value={r.cat} className={box} onChange={(e) => set(r.key, { cat: e.target.value, guessed: true })}>
                      {(r.kind === "fixture" ? fxCats : r.kind === "tool" ? toolKeeps : eqKinds).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 수량`} name={n("qty")} value={r.qty} inputMode="numeric" required={need} readOnly={r.kind === "equipment"} title={r.kind === "equipment" ? "설비는 한 줄에 한 대" : undefined} className={`${box} text-right`} onChange={(e) => set(r.key, { qty: digits(e.target.value) })} />
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 한 개 공급가`} name={n("unitWon")} value={comma(r.unitWon)} inputMode="numeric" required={need} className={`${box} text-right`} onChange={(e) => set(r.key, { unitWon: digits(e.target.value) })} />
                    <button type="button" className="mt-0.5 text-xs text-[var(--accent)]" onClick={() => fillRest(r)}>
                      결의 금액에서 채우기
                    </button>
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 위치`} name={n("location")} value={r.location} className={box} placeholder={r.kind === "equipment" ? "구역 A~H" : r.kind === "tool" ? "보드 B-3" : "공구함 1"} onChange={(e) => set(r.key, { location: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <select data-assist="grid" aria-label={`${i + 1}번째 줄 관리자 정`} name={n("managerId")} value={r.managerId} className={box} onChange={(e) => set(r.key, { managerId: e.target.value })}>
                      <option value="">나중에</option>
                      {users.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select data-assist="grid" aria-label={`${i + 1}번째 줄 관리자 부`} name={n("subManagerId")} value={r.subManagerId} disabled={r.kind === "tool"} title={r.kind === "tool" ? "치공구는 관리자(정)만 둡니다" : undefined} className={box} onChange={(e) => set(r.key, { subManagerId: e.target.value })}>
                      <option value="">나중에</option>
                      {users
                        .filter((u) => u.value !== r.managerId)
                        .map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="py-1">
                    <button type="button" aria-label={`${i + 1}번째 줄 비우기`} title="이 줄 비우기" className="size-10 rounded-md text-[var(--muted)] hover:text-[var(--danger)]" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [empty(++seed.current)]))}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 hover:border-[var(--accent)]" onClick={() => setRows((rs) => [...rs, empty(++seed.current)])}>
          + 줄 더
        </button>
        <span>
          대장에 올릴 것 <b>{filled.reduce((t, r) => t + (Number(digits(r.qty)) || 0), 0)}</b>개 · 공급가 합계 <b>{total.toLocaleString("ko-KR")}원</b>
        </span>
        <span className="text-xs text-[var(--muted)]">결재에 올리면 바로 대장에 &apos;입고 대기&apos;로 올라가고 번호가 붙습니다. 물건이 오면 관리자가 &apos;들어옴 확인&apos;만 누릅니다. 결의를 취소하면 함께 지워집니다.</span>
      </div>
    </div>
  );
  if (!optional) return body;
  return (
    <details className="rounded-md border border-[var(--line)] p-2">
      <summary className="cursor-pointer text-sm text-[var(--accent)]">비품·설비·치공구로 대장에 올릴 것이 있으면 펼치기</summary>
      <div className="mt-2">{body}</div>
    </details>
  );
}
