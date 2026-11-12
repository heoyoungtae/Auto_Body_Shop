"use client";
// 발주서 품목 한꺼번에 넣기(대표 지시 2026-11-12 "항목 추가는 한꺼번에").
// 줄을 여러 개 펼쳐 두고 한 번에 저장한다. 재고 품목을 고르면 품명·규격·단가·권장 수량이 채워지고,
// 전에 발주한 품명을 적으면 직전 단가·품번·규격을 불러온다. 엑셀에서 여러 줄을 복사해 품명 칸에 붙여 넣으면 줄마다 나뉜다.
import { useMemo, useRef, useState } from "react";
import type { FieldHelpKey } from "@/modules/help/fields";
import { HelpButton } from "../_help-drawer";
import { SubmitButton } from "../_submit";

export type StockPick = { id: string; name: string; spec: string | null; unit: string; unitWon: number; qty: number; suggest: number; low: boolean; mine: boolean };
export type PastLine = { name: string; partNo: string | null; spec: string | null; unitWon: number; partCode: string | null; on: string };

type Row = { key: number; stockItemId: string; name: string; partNo: string; spec: string; partCode: string; qty: string; unitWon: string; from: string };

const box = "h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-base outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 invalid:[&:not(:placeholder-shown)]:border-[var(--danger)]";
const digits = (v: string) => v.replace(/[^\d]/g, "");
const comma = (v: string) => (digits(v) ? Number(digits(v)).toLocaleString("ko-KR") : "");

// 줄 번호(key)는 칸 이름에 들어가므로 서버·브라우저가 같게 1부터 매긴다(화면 그리기 어긋남 방지)
const empty = (key: number): Row => ({ key, stockItemId: "", name: "", partNo: "", spec: "", partCode: "", qty: "1", unitWon: "", from: "" });

export function LineRows({
  kind,
  stock,
  past,
  partCodes,
  start = 5,
}: {
  kind: "repair" | "stock";
  stock: StockPick[];
  past: PastLine[];
  partCodes: { value: string; label: string }[];
  start?: number;
}) {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: start }, (_, i) => empty(i + 1)));
  const seed = useRef(start);
  const blank = () => empty(++seed.current);
  const pastBy = useMemo(() => new Map(past.map((p) => [p.name, p])), [past]);
  const stockBy = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const low = stock.filter((s) => s.low);
  const used = new Set(rows.map((r) => r.stockItemId).filter(Boolean));

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const fromStock = (s: StockPick): Partial<Row> => ({ stockItemId: s.id, name: s.name, spec: s.spec ?? "", qty: String(Math.max(1, s.suggest)), unitWon: s.unitWon ? String(s.unitWon) : "", from: "재고 품목" });
  /** 빈 줄부터 채우고 모자라면 줄을 늘린다 */
  const fill = (patches: Partial<Row>[]) =>
    setRows((rs) => {
      const out = [...rs];
      let i = 0;
      for (const p of patches) {
        while (i < out.length && out[i].name.trim()) i++;
        if (i < out.length) out[i] = { ...out[i], ...p };
        else out.push({ ...blank(), ...p });
        i++;
      }
      return out;
    });

  const onName = (r: Row, v: string) => {
    const p = pastBy.get(v.trim());
    // 전에 발주한 품명이면 직전 값을 불러온다(빈 칸만)
    if (p && !r.stockItemId)
      set(r.key, { name: v, partNo: r.partNo || p.partNo || "", spec: r.spec || p.spec || "", unitWon: r.unitWon || String(p.unitWon), partCode: r.partCode || p.partCode || "", from: `직전 발주(${p.on})` });
    else set(r.key, { name: v, from: v.trim() ? r.from : "" });
  };

  /** 엑셀·표에서 여러 줄을 붙여 넣으면 품명·품번·규격·수량·단가 순으로 나눈다 */
  const onPaste = (r: Row, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.split("\t").map((c) => c.trim())).filter((c) => c[0]);
    setRows((rs) => {
      const out = [...rs];
      let i = out.findIndex((x) => x.key === r.key);
      for (const [name, partNo = "", spec = "", qty = "", unitWon = ""] of lines) {
        const p = pastBy.get(name);
        const row: Partial<Row> = { name, partNo: partNo || p?.partNo || "", spec: spec || p?.spec || "", qty: digits(qty) || "1", unitWon: digits(unitWon) || (p ? String(p.unitWon) : ""), partCode: p?.partCode ?? "", from: "붙여 넣음" };
        while (i < out.length && out[i].name.trim() && out[i].key !== r.key) i++;
        if (i < out.length) out[i] = { ...out[i], ...row };
        else out.push({ ...blank(), ...row });
        i++;
      }
      return out;
    });
  };

  const filled = rows.filter((r) => r.name.trim());
  const total = filled.reduce((a, r) => a + (Number(digits(r.qty)) || 0) * (Number(digits(r.unitWon)) || 0), 0);
  const head = (id: FieldHelpKey, label: string, cls = "") => (
    <th className={`py-1.5 pr-2 font-medium ${cls}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <HelpButton topic={{ kind: "field", id }} name={label} />
      </span>
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {kind === "stock" && low.length > 0 && (
          <button type="button" className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => fill(low.filter((s) => !used.has(s.id)).map(fromStock))}>
            안전 재고 미달 {low.length}개 모두 넣기
          </button>
        )}
        <button type="button" className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 hover:border-[var(--accent)]" onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 5 }, blank)])}>
          + 줄 5개 더
        </button>
        <span className="text-xs text-[var(--muted)]">품명이 빈 줄은 넣지 않습니다. 엑셀에서 여러 줄(품명·품번·규격·수량·단가 순)을 복사해 품명 칸에 붙여 넣으면 줄마다 나뉩니다.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="w-8 py-1.5 pr-2">#</th>
              {kind === "stock" && head("po.stockItem", "재고 품목", "w-44")}
              {head("po.lineName", "품명", "min-w-[14rem]")}
              {head("po.partNo", "품번", "w-32")}
              {head("po.spec", "규격", "w-32")}
              {kind === "repair" && head("po.partCode", "부품 구분", "w-36")}
              {head("po.qty", "수량", "w-24")}
              {head("po.unitWon", "단가(원)", "w-32")}
              <th className="w-28 pr-2 text-right font-medium">금액</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const it = r.stockItemId ? stockBy.get(r.stockItemId) : undefined;
              const need = !!r.name.trim();
              const amt = (Number(digits(r.qty)) || 0) * (Number(digits(r.unitWon)) || 0);
              return (
                <tr key={r.key} className="align-top">
                  <td className="py-1 pr-2 pt-3 text-xs text-[var(--muted)]">{i + 1}</td>
                  {kind === "stock" && (
                    <td className="py-1 pr-2">
                      <select data-assist="grid"
                        aria-label={`${i + 1}번째 줄 재고 품목`}
                        name={`r${r.key}_stockItemId`}
                        value={r.stockItemId}
                        className={box}
                        onChange={(e) => {
                          const s = stockBy.get(e.target.value);
                          set(r.key, s ? fromStock(s) : { stockItemId: "", from: "" });
                        }}
                      >
                        <option value="">(재고 품목 아님)</option>
                        {stock.map((s) => (
                          <option key={s.id} value={s.id} disabled={used.has(s.id) && s.id !== r.stockItemId}>
                            {s.mine ? "★ " : ""}
                            {s.name}
                            {s.spec ? ` ${s.spec}` : ""} · 지금 {s.qty}
                            {s.unit}
                            {s.low ? " (미달)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 품명`} name={`r${r.key}_name`} value={r.name} list="po-past-names" className={box} placeholder={i === 0 ? "예: 앞범퍼 커버" : ""} onChange={(e) => onName(r, e.target.value)} onPaste={(e) => onPaste(r, e)} />
                    {r.from && need && <p className="mt-0.5 text-xs text-[var(--accent)]">↳ {r.from}에서 불러옴</p>}
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 품번`} name={`r${r.key}_partNo`} value={r.partNo} className={box} autoCapitalize="characters" spellCheck={false} onChange={(e) => set(r.key, { partNo: e.target.value.toUpperCase() })} />
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 규격`} name={`r${r.key}_spec`} value={r.spec} className={box} onChange={(e) => set(r.key, { spec: e.target.value })} />
                  </td>
                  {kind === "repair" && (
                    <td className="py-1 pr-2">
                      <select data-assist="grid" aria-label={`${i + 1}번째 줄 부품 구분`} name={`r${r.key}_partCode`} value={r.partCode} required={need} className={box} onChange={(e) => set(r.key, { partCode: e.target.value })}>
                        <option value="">고르기</option>
                        {partCodes.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-1">
                      <input data-assist="grid" aria-label={`${i + 1}번째 줄 수량`} name={`r${r.key}_qty`} value={r.qty} inputMode="numeric" required={need} pattern="[1-9][0-9]*" className={`${box} text-right`} onChange={(e) => set(r.key, { qty: digits(e.target.value) })} />
                      <span className="shrink-0 text-xs text-[var(--muted)]">{it?.unit ?? "개"}</span>
                    </div>
                  </td>
                  <td className="py-1 pr-2">
                    <input data-assist="grid" aria-label={`${i + 1}번째 줄 단가`} name={`r${r.key}_unitWon`} value={comma(r.unitWon)} inputMode="numeric" required={need} className={`${box} text-right`} onChange={(e) => set(r.key, { unitWon: digits(e.target.value) })} />
                  </td>
                  <td className="py-1 pr-2 pt-3 text-right tabular-nums">{amt ? amt.toLocaleString("ko-KR") : ""}</td>
                  <td className="py-1">
                    <button type="button" aria-label={`${i + 1}번째 줄 비우기`} title="이 줄 비우기" className="size-10 rounded-md text-[var(--muted)] hover:text-[var(--danger)]" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="po-past-names">
        {past.map((p) => (
          <option key={p.name} value={p.name}>
            {[p.partNo, p.spec, `${p.unitWon.toLocaleString("ko-KR")}원`].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2">
        <p className="text-sm">
          넣을 줄 <b>{filled.length}</b>개 · 공급가 합계 <b className="tabular-nums">{total.toLocaleString("ko-KR")}원</b> <span className="text-xs text-[var(--muted)]">(부가세 별도)</span>
        </p>
        <SubmitButton variant="secondary" disabled={!filled.length}>
          {filled.length ? `${filled.length}줄 한꺼번에 넣기` : "품명을 적으면 넣을 수 있습니다"}
        </SubmitButton>
      </div>
    </div>
  );
}
