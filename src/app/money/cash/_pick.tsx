// 입출금 › 돈 받기·돈 내기 공통 부품: 통장 거래 상자, '누구와' 고르기 단추, 분류 양식, 줄 모양
import Link from "next/link";
import type { bankTx } from "@/db/schema";
import { TX_CLASSES } from "@/modules/bank/rules";
import type { Cand } from "@/modules/bank/service";
import { SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty } from "../../_ui";
import { txAction } from "../bank/actions";
import { CandButton, TxHidden } from "../bank/cand-button";

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
type Tx = typeof bankTx.$inferSelect;

/** 통장 거래에서 시작했을 때: 거래 한 줄과 앱이 찾은 짝 */
export function TxBox({ t, cands, back }: { t: Tx; cands: Cand[]; back: string }) {
  const inflow = t.kind === "in";
  return (
    <Card title="이 통장 거래를 적습니다" help={{ kind: "panel", id: "cash.tx" }}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums text-[var(--muted)]">
          {t.on}
          {t.at ? ` ${t.at}` : ""}
        </span>
        <Badge tone={inflow ? "ok" : "danger"}>{inflow ? "입금" : "출금"}</Badge>
        <b className="tabular-nums">{won(t.amountWon)}</b>
        <span>{t.party ?? "(상대방 없음)"}</span>
        <span className="text-xs text-[var(--muted)]">{t.accountLabel ?? ""}</span>
      </p>
      {t.matchKind ? (
        <p className="mt-2 text-sm text-[var(--ok)]">이미 {t.matchKind === "class" ? "분류한" : `${t.matchNo ?? ""}와 이은`} 거래입니다. 더 할 일이 없습니다.</p>
      ) : cands.length ? (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold">앱이 찾은 짝</p>
          <ul className="space-y-2">
            {cands.map((c) => (
              <li key={`${c.kind}-${c.id}-${c.note ?? ""}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{c.label}</span>
                {c.cutWon ? <Badge tone="warn">{won(c.cutWon)} 덜 들어옴</Badge> : null}
                <CandButton txId={t.id} c={c} back={back} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">맞는 짝이 없으면 아래에서 누구{inflow ? "에게서 받았는지" : "에게 냈는지"} 고릅니다.</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">금액·이름이 맞는 전표를 찾지 못했습니다. 아래에서 누구{inflow ? "에게서 받았는지" : "에게 냈는지"} 고릅니다.</p>
      )}
    </Card>
  );
}

/** '누구와' 고르기 단추 줄 */
export function WhoTabs({ base, who, txId, options }: { base: string; who: string | undefined; txId?: string; options: { v: string; label: string; sub: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {options.map((o) => {
        const on = who === o.v;
        const qs = new URLSearchParams({ who: o.v, ...(txId ? { tx: txId } : {}) });
        return (
          <Link key={o.v} href={`${base}?${qs}`} aria-current={on ? "true" : undefined} className={`rounded-md border px-3 py-2 ${on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`}>
            <span className="block font-semibold">{o.label}</span>
            <span className="block text-xs text-[var(--muted)]">{o.sub}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** 전표가 없는 돈(이자·대표 출자·세금 등)은 통장 거래를 분류한다 */
export function ClassForm({ txId, back, inflow }: { txId: string; back: string; inflow: boolean }) {
  const opts = Object.entries(TX_CLASSES)
    .filter(([k]) => (inflow ? !["card_bill", "social", "fee"].includes(k) : true))
    .map(([value, c]) => ({ value, label: c.label }));
  return (
    <form action={txAction} className="flex flex-wrap items-end gap-2">
      <TxHidden txId={txId} intent="class" back={back} />
      <SelectField help="bank.cls" name="cls" required placeholder="분류 고르기" options={opts} />
      <TextField help="bank.note" name="note" />
      <div>
        <SubmitButton>분류</SubmitButton>
      </div>
    </form>
  );
}

/** 고를 건 목록(금액이 통장 거래와 같으면 맨 위·표시) */
export function PickList<R>({ rows, amountOf, txAmount, render, empty }: { rows: R[]; amountOf: (r: R) => number; txAmount?: number; render: (r: R, same: boolean) => React.ReactNode; empty: string }) {
  const sorted = txAmount != null ? [...rows].sort((a, b) => Number(amountOf(b) === txAmount) - Number(amountOf(a) === txAmount)) : rows;
  return sorted.length ? (
    <ul className="divide-y divide-[var(--line)] text-sm">
      {sorted.map((r, i) => {
        const same = txAmount != null && amountOf(r) === txAmount;
        return (
          <li key={i} className={`flex flex-wrap items-center gap-2 py-2 ${same ? "bg-[var(--ok-soft)] px-2" : ""}`}>
            {render(r, same)}
            {same && <Badge tone="ok">통장 금액과 같음</Badge>}
          </li>
        );
      })}
    </ul>
  ) : (
    <Empty>{empty}</Empty>
  );
}
