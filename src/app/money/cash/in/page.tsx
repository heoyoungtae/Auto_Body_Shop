import Link from "next/link";
import { getDb } from "@/db/runtime";
import { canBooks } from "@/modules/acct/service";
import { can } from "@/modules/auth/permissions";
import { txWithCands, type Cand } from "@/modules/bank/service";
import { openBills } from "@/modules/money/credit";
import { customerReceivables, insurerReceivables, unrecordedDeliveries } from "@/modules/money/receipts";
import { PAY_IN_METHODS } from "@/modules/money/rules";
import { requireUser } from "../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { CandButton } from "../../bank/cand-button";
import { ClassForm, PickList, TxBox, WhoTabs, won } from "../_pick";

type Q = { who?: string; tx?: string; s?: string; notice?: string; error?: string };
const WHO = [
  { v: "customer", label: "고객", sub: "수리비(카드·현금·이체) 수납" },
  { v: "insurer", label: "보험사", sub: "보험 청구 입금 확인" },
  { v: "business", label: "업체(외상)", sub: "거래처 청구서 입금" },
  { v: "other", label: "그 밖의 돈", sub: "이자·대표 입금·대출·환불 등" },
];
const has = (s: string | undefined, ...xs: (string | null | undefined)[]) => !s || xs.some((x) => x && x.replace(/\s/g, "").toLowerCase().includes(s.replace(/\s/g, "").toLowerCase()));

/** 입출금 › 돈 받기: 누구에게서 받았는지 고르면 그 일을 하는 화면이 열린다(통장 입금에서 시작하면 금액·날짜를 채워 둔다) */
export default async function CashInPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "money.view")) return <p className="text-sm text-[var(--muted)]">돈 받기는 상담원·공장장·회계 담당·대표가 합니다.</p>;
  const db = await getDb();
  const canBank = can(user, "bank.view");
  const tx = q.tx && canBank ? await txWithCands(db, user, q.tx).catch(() => null) : null;
  const t = tx?.t.kind === "in" ? tx.t : null;
  const amt = t?.amountWon;
  const done = `/money/cash`;
  const txQs = t ? `?tx=${t.id}` : "";
  const who = q.who && WHO.some((w) => w.v === q.who) ? q.who : undefined;

  let body: React.ReactNode = null;
  if (who === "customer") {
    const [todo, ar] = await Promise.all([unrecordedDeliveries(db), customerReceivables(db)]);
    const rows = [
      ...todo.map((r) => ({ roId: r.roId, title: `${r.docNo} ${r.plateNo}`, note: `출고 때 ${PAY_IN_METHODS[r.method as keyof typeof PAY_IN_METHODS] ?? r.method} · 수납 기록 없음`, amount: -1 })),
      ...ar.filter((a) => !a.credit && !todo.some((x) => x.roId === a.roId)).map((a) => ({ roId: a.roId, title: `${a.docNo} ${a.who}`, note: `받을 ${won(a.due)} · 받음 ${won(a.paid)}${a.insurance ? " · 보험 건 고객 몫" : ""}`, amount: a.remain })),
    ].filter((r) => has(q.s, r.title, r.note));
    body = (
      <PickList
        rows={rows}
        amountOf={(r) => r.amount}
        txAmount={amt}
        empty="받을 돈이 남은 고객 수리 건이 없습니다. 출고 전이면 수리 건의 출고 화면에서 받습니다."
        render={(r) => (
          <>
            <b>{r.title}</b>
            {r.amount > 0 && <span>남음 {won(r.amount)}</span>}
            <span className="text-xs text-[var(--muted)]">{r.note}</span>
            <Link href={`/money/ro/${r.roId}${txQs}#pay`} className={`ml-auto ${buttonClass("secondary")}`}>
              수납 적기
            </Link>
          </>
        )}
      />
    );
  } else if (who === "insurer") {
    const rows = (await insurerReceivables(db)).filter((r) => has(q.s, r.docNo, r.insurer, r.roDocNo, r.plateNo));
    body = (
      <PickList
        rows={rows}
        amountOf={(r) => r.claimedWon}
        txAmount={amt}
        empty="입금을 기다리는 보험 청구가 없습니다."
        render={(r) => {
          const c: Cand = { kind: "claim", id: r.roId, no: r.docNo, label: "", sure: false, act: "claim", cutWon: amt != null ? r.claimedWon - amt : 0 };
          return (
            <>
              <b>
                {r.docNo} {r.insurer}
              </b>
              <span>청구 {won(r.claimedWon)}</span>
              <span className="text-xs text-[var(--muted)]">
                {r.roDocNo} {r.plateNo} · {r.claimedOn} 청구 · {r.days}일
              </span>
              {amt != null && amt < r.claimedWon && <Badge tone="warn">{won(r.claimedWon - amt)} 덜 들어옴</Badge>}
              <span className="ml-auto">
                {t && (amt ?? 0) <= r.claimedWon ? (
                  <CandButton txId={t.id} c={c} back={done} />
                ) : (
                  <Link href={`/repairs/${r.roId}/claim`} className={buttonClass("secondary")}>
                    입금 확인 화면
                  </Link>
                )}
              </span>
            </>
          );
        }}
      />
    );
  } else if (who === "business") {
    const rows = (await openBills(db)).filter((b) => has(q.s, b.docNo, b.name));
    body = (
      <PickList
        rows={rows}
        amountOf={(b) => b.remain}
        txAmount={amt}
        empty="받을 돈이 남은 거래처 청구서가 없습니다. 청구서는 업체 외상 화면에서 만듭니다."
        render={(b) => (
          <>
            <b>
              {b.docNo} {b.name}
            </b>
            <span>남음 {won(b.remain)}</span>
            <span className="text-xs text-[var(--muted)]">
              청구 {won(b.totalWon)} · 받을 날 {b.dueOn}
            </span>
            <span className="ml-auto">
              {t && (amt ?? 0) <= b.remain ? (
                <CandButton txId={t.id} c={{ kind: "bill", id: b.id, no: b.docNo, label: "", sure: false, act: "bill" }} back={done} />
              ) : (
                <Link href={`/money/accounts/bills/${b.id}#pay`} className={buttonClass("secondary")}>
                  입금 적기
                </Link>
              )}
            </span>
          </>
        )}
      />
    );
  } else if (who === "other") {
    body = (
      <div className="space-y-3 text-sm">
        <p>이자·대표 출자·대출·환불·세금 환급처럼 수리 건이나 청구서가 없는 돈은 입금 전표를 쓰지 않고, 통장 거래를 분류합니다. 장부에는 회계의 자금 전표로 남깁니다.</p>
        {t ? (
          <ClassForm txId={t.id} back={done} inflow />
        ) : (
          <p className="flex flex-wrap gap-2">
            {canBank && (
              <Link href="/money/bank?kind=bank" className={buttonClass("secondary")}>
                통장 내역에서 분류
              </Link>
            )}
            {canBooks(user) && (
              <Link href="/money/books#fund" className={buttonClass("secondary")}>
                자금 전표 적기
              </Link>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <PageTitle
        help="cash.in"
        sub="누구에게서 받았는지 고르고, 그 건을 고르면 받는 일을 하는 화면이 열립니다. 통장 입금에서 시작했으면 단추 한 번으로 끝나는 일(보험 입금 확인·청구서 입금)은 여기서 바로 합니다."
        actions={
          <Link href="/money/cash" className={buttonClass("secondary")}>
            입출금으로
          </Link>
        }
      >
        돈 받기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {q.tx && !t && <ErrorBox message="통장 입금 거래를 찾지 못했습니다(출금이거나 지워졌을 수 있음)" />}
      {t && tx && (
        <div className="mb-4">
          <TxBox t={t} cands={tx.cands} back={done} />
        </div>
      )}
      {!t?.matchKind && (
        <Card title="누구에게서 받았나요?" help={{ kind: "panel", id: "cash.who" }}>
          <WhoTabs base="/money/cash/in" who={who} txId={t?.id} options={WHO} />
          {who && who !== "other" && (
            <form method="get" action="/money/cash/in" className="mt-3 flex items-center gap-1" role="search">
              <input type="hidden" name="who" value={who} />
              {t && <input type="hidden" name="tx" value={t.id} />}
              <input type="search" name="s" defaultValue={q.s} placeholder="번호·이름·차량번호 일부" aria-label="고를 건 찾기" className="h-11 w-64 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" />
              <button className={buttonClass("secondary")}>찾기</button>
            </form>
          )}
          {body && <div className="mt-3">{body}</div>}
        </Card>
      )}
    </>
  );
}
