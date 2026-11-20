"use client";
// 견적서 줄 확인 표: 줄마다 '단가만 갱신 / 새 품목 / 건너뜀'을 고르고 고친다.
// 같은 품목은 단가만 갱신으로, 같은 견적서 안 중복은 건너뜀으로 미리 정해 두고, 비슷한 품목은 사람이 고르게 한다(고르기 전에는 등록 못 함).
import { useMemo, useState } from "react";
import type { QuoteLine } from "@/db/schema";
import type { FieldHelpKey } from "@/modules/help/fields";
import { changePct, PRICE_RISE_ALERT_PCT } from "@/modules/purchase/quote-rules";
import { PACK_UNITS, STOCK_KINDS, STOCK_UNITS, TRACK_MODES, type TrackMode } from "@/modules/purchase/rules";
import { HelpButton } from "../../_help-drawer";
import { SubmitButton } from "../../_submit";

type Item = { id: string; name: string; spec: string | null; unit: string; kind: string };
type Act = "" | "update" | "new" | "skip";
type Row = { idx: number; action: Act; itemId: string; name: string; kind: string; spec: string; unit: string; packAmount: string; packUnit: string; unitWon: string; trackMode: string; buyQty: string; baseUnit: string };

const box = "h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";
const digits = (v: string) => v.replace(/[^\d]/g, "");
const won = (n: number) => n.toLocaleString("ko-KR");
const MATCH: Record<QuoteLine["match"], { label: string; cls: string }> = {
  same: { label: "같은 품목", cls: "bg-[var(--ok)]/15 text-[var(--ok)]" },
  similar: { label: "비슷함 · 확인", cls: "bg-[var(--warn)]/15 text-[var(--warn)]" },
  new: { label: "새 품목", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  dup: { label: "중복", cls: "bg-[var(--surface-2)] text-[var(--muted)]" },
};
type Filter = "all" | "todo" | "update" | "new" | "skip";

export function QuoteReview({ lines, items, nowPrice, readTotalWon, vatLabel, disabled, noSupplier = false }: { lines: QuoteLine[]; items: Item[]; nowPrice: Record<string, number | null>; readTotalWon: number | null; vatLabel: string; disabled: boolean; noSupplier?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() =>
    lines.map((l, idx) => ({
      idx,
      action: l.match === "same" ? "update" : l.match === "new" ? "new" : l.match === "dup" ? "skip" : "",
      itemId: l.itemId ?? "",
      name: l.name,
      kind: l.kind,
      spec: l.spec ?? "",
      unit: l.unit,
      packAmount: l.packAmount != null ? String(l.packAmount) : "",
      packUnit: l.packUnit ?? "",
      unitWon: String(l.unitWon),
      trackMode: l.track ?? "",
      buyQty: l.buyQty ? String(l.buyQty) : "",
      baseUnit: l.baseUnit ?? "",
    })),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const set = (idx: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.idx === idx ? { ...r, ...p } : r)));

  const packBad = (r: Row) => r.action === "new" && Number(digits(r.buyQty)) > 1 && (!r.baseUnit || r.baseUnit === r.unit);
  const todo = rows.filter((r) => !r.action || (r.action === "update" && !r.itemId) || (r.action === "new" && !r.name.trim()) || packBad(r));
  const pickedTwice = (() => {
    const seen = new Map<string, number>();
    const twice = new Set<number>();
    for (const r of rows)
      if (r.action === "update" && r.itemId) {
        if (seen.has(r.itemId)) {
          twice.add(r.idx);
          twice.add(seen.get(r.itemId)!);
        } else seen.set(r.itemId, r.idx);
      }
    return twice;
  })();
  const count = (a: Act) => rows.filter((r) => r.action === a).length;
  const total = lines.reduce((a, l, i) => a + l.qty * (Number(digits(rows[i].unitWon)) || 0), 0);
  const rises = rows.filter((r) => {
    if (r.action !== "update" || !r.itemId) return false;
    const p = changePct(nowPrice[r.itemId] ?? null, Number(digits(r.unitWon)) || 0);
    return p != null && p >= PRICE_RISE_ALERT_PCT;
  }).length;
  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "todo" ? todo.includes(r) || pickedTwice.has(r.idx) : r.action === filter,
  );
  const head = (id: FieldHelpKey, label: string, cls = "") => (
    <th className={`py-1.5 pr-2 font-medium ${cls}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <HelpButton topic={{ kind: "field", id }} name={label} />
      </span>
    </th>
  );
  const payload = JSON.stringify(
    rows.map((r) => ({ idx: r.idx, action: r.action || "skip", itemId: r.itemId, name: r.name, kind: r.kind, spec: r.spec, unit: r.unit, packAmount: r.packAmount ? Number(r.packAmount) : null, packUnit: r.packUnit, unitWon: Number(digits(r.unitWon)) || 0, trackMode: r.trackMode, buyQty: Number(digits(r.buyQty)) || null, baseUnit: r.baseUnit })),
  );
  const blocked = noSupplier || todo.length > 0 || pickedTwice.size > 0;

  return (
    <div className="space-y-2">
      <input type="hidden" name="rows" value={payload} />
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {(
          [
            ["all", `전체 ${rows.length}`],
            ["todo", `확인 필요 ${todo.length + pickedTwice.size}`],
            ["update", `단가만 갱신 ${count("update")}`],
            ["new", `새 품목 ${count("new")}`],
            ["skip", `건너뜀 ${count("skip")}`],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${filter === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
            {label}
          </button>
        ))}
        {todo.some((r) => !r.action) && !disabled && (
          <button type="button" className="ml-auto rounded-md border border-[var(--line-strong)] px-3 py-1 hover:border-[var(--accent)]" onClick={() => setRows((rs) => rs.map((r) => (r.action ? r : { ...r, action: "new" })))}>
            확인 필요 줄을 모두 새 품목으로
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[86rem] text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="w-8 py-1.5 pr-2">#</th>
              <th className="min-w-[13rem] py-1.5 pr-2 font-medium">견적서(원문)</th>
              {head("qt.action", "처리", "w-36")}
              {head("qt.item", "우리 품목 · 새 품명", "min-w-[15rem]")}
              {head("qt.kind", "구분", "w-32")}
              {head("qt.spec", "규격", "w-24")}
              {head("qt.unit", "단위", "w-24")}
              {head("qt.pack", "용량", "w-36")}
              {head("qt.buyQty", "입수 · 낱개", "w-40")}
              {head("qt.track", "관리 방식", "w-36")}
              {head("qt.unitWon", "단가(원)", "w-28")}
              <th className="w-36 pr-2 text-right font-medium">지금 → 변동</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const l = lines[r.idx];
              const cur = r.action === "update" && r.itemId ? (nowPrice[r.itemId] ?? null) : null;
              const pct = r.action === "update" ? changePct(cur, Number(digits(r.unitWon)) || 0) : null;
              const it = r.itemId ? byId.get(r.itemId) : undefined;
              const off = r.action === "skip";
              const isNew = r.action === "new";
              const warn = !r.action || pickedTwice.has(r.idx);
              return (
                <tr key={r.idx} className={`border-t border-[var(--line)] align-top ${off ? "opacity-50" : ""} ${warn ? "bg-[var(--warn)]/5" : ""}`}>
                  <td className="py-1.5 pr-2 pt-2.5 text-xs text-[var(--muted)]">{r.idx + 1}</td>
                  <td className="py-1.5 pr-2">
                    <p className="font-medium">
                      {l.supName}
                      {l.spec ? <span className="text-[var(--muted)]"> {l.spec}</span> : null}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {l.supUnit ?? "-"} · {l.qty} × {won(l.unitWon)}원
                    </p>
                    <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] ${MATCH[l.match].cls}`}>{MATCH[l.match].label}</span>
                    {l.note && <p className="mt-0.5 text-xs text-[var(--muted)]">{l.note}</p>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 처리`} value={r.action} disabled={disabled} className={box} onChange={(e) => set(r.idx, { action: e.target.value as Act })}>
                      <option value="">고르기(확인 필요)</option>
                      <option value="update">단가만 갱신</option>
                      <option value="new">새 품목으로 등록</option>
                      <option value="skip">건너뜀</option>
                    </select>
                    {l.candidates.length > 0 && !disabled && (
                      <div className="mt-1 space-y-0.5">
                        {l.candidates.map((c) => (
                          <button key={c.id} type="button" className="block w-full rounded border border-[var(--line)] px-1.5 py-0.5 text-left text-xs hover:border-[var(--accent)]" onClick={() => set(r.idx, { action: "update", itemId: c.id })}>
                            = {c.name}
                            {c.spec ? ` ${c.spec}` : ""} <span className="text-[var(--muted)]">({Math.round(c.score * 100)}%)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.action === "update" ? (
                      <>
                        <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 우리 품목`} value={r.itemId} disabled={disabled} className={box} onChange={(e) => set(r.idx, { itemId: e.target.value })}>
                          <option value="">우리 품목 고르기</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                              {i.spec ? ` ${i.spec}` : ""} ({i.unit})
                            </option>
                          ))}
                        </select>
                        {pickedTwice.has(r.idx) && <p className="mt-0.5 text-xs text-[var(--danger)]">다른 줄과 같은 품목을 골랐습니다. 하나는 건너뛰세요</p>}
                      </>
                    ) : (
                      <input data-assist="grid" aria-label={`${r.idx + 1}번째 줄 새 품명`} value={r.name} disabled={disabled || !isNew} className={box} onChange={(e) => set(r.idx, { name: e.target.value })} />
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isNew ? (
                      <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 구분`} value={r.kind} disabled={disabled} className={box} onChange={(e) => set(r.idx, { kind: e.target.value })}>
                        {Object.entries(STOCK_KINDS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">{it ? STOCK_KINDS[it.kind as keyof typeof STOCK_KINDS] : ""}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isNew ? <input data-assist="grid" aria-label={`${r.idx + 1}번째 줄 규격`} value={r.spec} disabled={disabled} className={box} onChange={(e) => set(r.idx, { spec: e.target.value })} /> : <span className="text-xs text-[var(--muted)]">{it?.spec ?? ""}</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isNew ? (
                      <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 단위`} value={r.unit} disabled={disabled} className={box} onChange={(e) => set(r.idx, { unit: e.target.value })}>
                        {STOCK_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">{it?.unit ?? ""}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isNew && (
                      <div className="flex gap-1">
                        <input data-assist="grid" aria-label={`${r.idx + 1}번째 줄 용량`} value={r.packAmount} inputMode="decimal" disabled={disabled} className={`${box} text-right`} onChange={(e) => set(r.idx, { packAmount: e.target.value.replace(/[^\d.]/g, "") })} />
                        <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 용량 단위`} value={r.packUnit} disabled={disabled} className={`${box} w-16`} onChange={(e) => set(r.idx, { packUnit: e.target.value })}>
                          <option value="">-</option>
                          {PACK_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {(isNew || r.action === "update") && (
                      <div className="flex items-center gap-1">
                        <input data-assist="grid" aria-label={`${r.idx + 1}번째 줄 입수`} value={r.buyQty} inputMode="numeric" placeholder="-" disabled={disabled} className={`${box} w-14 text-right`} onChange={(e) => set(r.idx, { buyQty: digits(e.target.value) })} />
                        {isNew ? (
                          <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 낱개 단위`} value={r.baseUnit} disabled={disabled || !r.buyQty} className={`${box} w-20`} onChange={(e) => set(r.idx, { baseUnit: e.target.value })}>
                            <option value="">낱개</option>
                            {STOCK_UNITS.filter((u) => u !== r.unit).map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">{it?.unit ?? ""}</span>
                        )}
                      </div>
                    )}
                    {Number(digits(r.buyQty)) > 1 && (r.baseUnit || (!isNew && it)) && (
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        1{r.unit} = {r.buyQty}
                        {isNew ? r.baseUnit : it?.unit} · 낱개 {won(Math.round((Number(digits(r.unitWon)) || 0) / Number(digits(r.buyQty))))}원
                      </p>
                    )}
                    {packBad(r) && <p className="mt-0.5 text-[11px] text-[var(--danger)]">낱개 단위를 고르세요(사는 단위와 달라야 함)</p>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isNew ? (
                      <>
                        <select data-assist="grid" aria-label={`${r.idx + 1}번째 줄 관리 방식`} value={r.trackMode} disabled={disabled} className={box} onChange={(e) => set(r.idx, { trackMode: e.target.value })}>
                          {Object.entries(TRACK_MODES).map(([k, v]) => (
                            <option key={k} value={k} disabled={k === "none" && r.kind === "paint"}>
                              {v}
                            </option>
                          ))}
                        </select>
                        {l.track && r.trackMode !== l.track ? (
                          <p className="mt-0.5 text-[11px] text-[var(--warn)]">추천: {TRACK_MODES[l.track as TrackMode]}</p>
                        ) : (
                          l.trackReason && <p className="mt-0.5 text-[11px] text-[var(--muted)]">추천 이유: {l.trackReason}</p>
                        )}
                      </>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input data-assist="grid" aria-label={`${r.idx + 1}번째 줄 단가`} value={r.unitWon ? won(Number(digits(r.unitWon))) : ""} inputMode="numeric" disabled={disabled || off} className={`${box} text-right`} onChange={(e) => set(r.idx, { unitWon: digits(e.target.value) })} />
                  </td>
                  <td className="py-1.5 pr-2 pt-2.5 text-right text-xs tabular-nums">
                    {r.action === "update" && r.itemId ? (
                      cur == null ? (
                        <span className="text-[var(--muted)]">이 업체 첫 단가</span>
                      ) : (
                        <>
                          {won(cur)}원{" "}
                          {pct != null && pct !== 0 && (
                            <b className={pct >= PRICE_RISE_ALERT_PCT ? "text-[var(--danger)]" : pct > 0 ? "text-[var(--warn)]" : "text-[var(--ok)]"}>
                              {pct > 0 ? "+" : ""}
                              {pct}%
                            </b>
                          )}
                          {pct === 0 && <span className="text-[var(--muted)]">같음</span>}
                        </>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t border-[var(--line)] pt-2 text-sm">
        <p>
          새 품목 <b>{count("new")}</b> · 단가만 갱신 <b>{count("update")}</b> · 건너뜀 <b>{count("skip")}</b> · 견적 합계 <b className="tabular-nums">{won(total)}원</b> <span className="text-xs text-[var(--muted)]">({vatLabel})</span>
        </p>
        {readTotalWon != null && readTotalWon !== total && (
          <p className="text-[var(--warn)]">
            견적서에 적힌 합계 {won(readTotalWon)}원과 {won(Math.abs(readTotalWon - total))}원 다릅니다. 빠진 줄이나 잘못 읽은 단가가 없는지 보세요.
          </p>
        )}
        {readTotalWon != null && readTotalWon === total && <p className="text-[var(--ok)]">견적서 합계 {won(readTotalWon)}원과 맞습니다.</p>}
        {rises > 0 && <p className="text-[var(--danger)]">{PRICE_RISE_ALERT_PCT}% 넘게 오른 품목 {rises}개: 등록하면 대표에게 알림이 갑니다.</p>}
        {todo.length > 0 && <p className="text-[var(--warn)]">확인 필요 {todo.length}줄: 처리를 고르거나(비슷한 품목은 후보를 누름), 우리 품목·새 품명을 채워 주세요.</p>}
      </div>
      {!disabled && (
        <SubmitButton disabled={blocked}>{noSupplier ? "견적 업체를 먼저 고르세요" : blocked ? "확인 필요 줄을 먼저 정해 주세요" : `${count("new")}개 등록 · ${count("update")}개 단가 갱신`}</SubmitButton>
      )}
    </div>
  );
}
