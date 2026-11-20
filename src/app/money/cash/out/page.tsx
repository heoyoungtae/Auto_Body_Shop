import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { payrollRun } from "@/db/schema";
import { canBooks } from "@/modules/acct/service";
import { can } from "@/modules/auth/permissions";
import { txWithCands } from "@/modules/bank/service";
import { listExpenses } from "@/modules/money/expense";
import { payableGroups } from "@/modules/money/payable";
import { EXP_CATEGORIES, EXP_PAY_METHODS } from "@/modules/money/rules";
import { requireUser } from "../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { CandButton } from "../../bank/cand-button";
import { ClassForm, PickList, TxBox, WhoTabs, won } from "../_pick";

type Q = { who?: string; tx?: string; s?: string; notice?: string; error?: string };
const WHO = [
  { v: "approved", label: "승인된 결의 지급", sub: "결재가 끝나 지급만 남은 지출 결의" },
  { v: "supplier", label: "협력업체 대금", sub: "외상매입금·미지급금을 업체별로 결의" },
  { v: "new", label: "새 지출", sub: "결의서가 아직 없는 지출(결의서 쓰기)" },
  { v: "payroll", label: "급여", sub: "승인된 급여대장 지급" },
  { v: "other", label: "그 밖의 돈", sub: "세금·4대보험·카드 대금·대표 인출 등" },
];
const has = (s: string | undefined, ...xs: (string | null | undefined)[]) => !s || xs.some((x) => x && x.replace(/\s/g, "").toLowerCase().includes(s.replace(/\s/g, "").toLowerCase()));

/** 입출금 › 돈 내기: 무엇으로 냈는지 고르면 그 일을 하는 화면이 열린다(통장 출금에서 시작하면 금액·날짜를 채워 둔다) */
export default async function CashOutPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay")) return <p className="text-sm text-[var(--muted)]">돈 내기는 공장장·회계 담당·대표가 합니다.</p>;
  const db = await getDb();
  const canBank = can(user, "bank.view");
  const canPay = can(user, "expense.pay");
  const tx = q.tx && canBank ? await txWithCands(db, user, q.tx).catch(() => null) : null;
  const t = tx?.t.kind === "out" ? tx.t : null;
  const amt = t?.amountWon;
  const done = "/money/cash";
  const who = q.who && WHO.some((w) => w.v === q.who) ? q.who : undefined;

  let body: React.ReactNode = null;
  if (who === "approved") {
    const rows = (await listExpenses(db, "unpaid")).filter((e) => has(q.s, e.docNo, e.payeeName, e.purpose, e.sourceNo));
    body = (
      <PickList
        rows={rows}
        amountOf={(e) => e.amountWon}
        txAmount={amt}
        empty="결재가 끝나 지급만 남은 결의서가 없습니다."
        render={(e) => (
          <>
            <b>
              {e.docNo} {e.payeeName}
            </b>
            <span>{won(e.amountWon)}</span>
            <span className="text-xs text-[var(--muted)]">
              {EXP_CATEGORIES[e.category as keyof typeof EXP_CATEGORIES] ?? e.category} · {e.purpose} · {EXP_PAY_METHODS[e.payMethod as keyof typeof EXP_PAY_METHODS] ?? e.payMethod}
              {e.dueOn ? ` · 지급 예정 ${e.dueOn}` : ""}
            </span>
            <span className="ml-auto">
              {t && canPay && e.amountWon === amt && e.payMethod !== "card" ? (
                <CandButton txId={t.id} c={{ kind: "expense", id: e.id, no: e.docNo, label: "", sure: false, act: "pay" }} back={done} />
              ) : (
                <Link href={`/money/expenses/${e.id}`} className={buttonClass("secondary")}>
                  지급 처리 화면
                </Link>
              )}
            </span>
          </>
        )}
      />
    );
  } else if (who === "supplier") {
    const { groups } = await payableGroups(db);
    const rows = groups.filter((g) => g.toSettle > 0 && has(q.s, g.name));
    body = (
      <>
        <PickList
          rows={rows}
          amountOf={(g) => g.toSettle}
          txAmount={amt}
          empty="결의할 외상매입금·미지급금이 없습니다."
          render={(g) => (
            <>
              <b>{g.name}</b>
              <span>결의할 것 {won(g.toSettle)}</span>
              {g.overdue > 0 && <Badge tone="danger">기한 지남 {won(g.overdue)}</Badge>}
              {g.bankVerified === false && <Badge tone="warn">계좌 확인 전</Badge>}
              <Link href={g.supplierId ? `/money/payables/${g.supplierId}` : "/money/payables"} className={`ml-auto ${buttonClass("secondary")}`}>
                지급 결의 만들기
              </Link>
            </>
          )}
        />
        <p className="mt-2 text-xs text-[var(--muted)]">업체별 지급 결의는 결재가 끝나야 지급합니다. 이미 결재가 끝났으면 '승인된 결의 지급'에서 고릅니다.</p>
      </>
    );
  } else if (who === "new") {
    body = (
      <div className="space-y-2 text-sm">
        <p>결의서가 아직 없는 지출(소모품 현장 구매·공과금·수리비 등)은 지출 결의서를 씁니다.{t ? " 통장 출금의 금액·날짜·받는 분을 채워 엽니다." : ""}</p>
        <Link href={`/money/expenses/new${t ? `?tx=${t.id}` : ""}`} className={buttonClass("primary")}>
          결의서 쓰기
        </Link>
      </div>
    );
  } else if (who === "payroll") {
    const runs = (await db.select().from(payrollRun).where(eq(payrollRun.status, "approved"))).filter((r) => has(q.s, r.docNo, r.ym));
    body = (
      <PickList
        rows={runs}
        amountOf={(r) => r.totalNet}
        txAmount={amt}
        empty="승인돼 지급을 기다리는 급여대장이 없습니다."
        render={(r) => (
          <>
            <b>
              {r.ym} 급여 {r.docNo}
            </b>
            <span>실지급 {won(r.totalNet)}</span>
            <span className="text-xs text-[var(--muted)]">
              {r.headcount}명 · 지급일 {r.payDate}
            </span>
            <span className="ml-auto">
              {t && r.totalNet === amt && can(user, "payroll.prepare") ? (
                <CandButton txId={t.id} c={{ kind: "payroll", id: r.id, no: r.docNo, label: "", sure: false, act: "payroll" }} back={done} />
              ) : (
                <Link href={`/payroll/${r.ym}`} className={buttonClass("secondary")}>
                  급여대장 열기
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
        <p>세금·4대보험료·카드 대금·대출 상환·대표 인출처럼 결의서가 필요 없는 돈은 통장 거래를 분류합니다. 장부에는 회계의 자금 전표로 남깁니다. 비용이 되는 지출이면 '새 지출'에서 결의서를 씁니다.</p>
        {t ? (
          <ClassForm txId={t.id} back={done} inflow={false} />
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
        help="cash.out"
        sub="무엇으로 냈는지 고르고, 그 건을 고르면 내는 일을 하는 화면이 열립니다. 통장 출금에서 시작했으면 단추 한 번으로 끝나는 일(승인된 결의 지급 처리·급여 지급)은 여기서 바로 합니다."
        actions={
          <Link href="/money/cash" className={buttonClass("secondary")}>
            입출금으로
          </Link>
        }
      >
        돈 내기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {q.tx && !t && <ErrorBox message="통장 출금 거래를 찾지 못했습니다(입금이거나 지워졌을 수 있음)" />}
      {t && tx && (
        <div className="mb-4">
          <TxBox t={t} cands={tx.cands} back={done} />
        </div>
      )}
      {!t?.matchKind && (
        <Card title="무엇으로 냈나요?" help={{ kind: "panel", id: "cash.what" }}>
          <WhoTabs base="/money/cash/out" who={who} txId={t?.id} options={WHO} />
          {who && !["new", "other"].includes(who) && (
            <form method="get" action="/money/cash/out" className="mt-3 flex items-center gap-1" role="search">
              <input type="hidden" name="who" value={who} />
              {t && <input type="hidden" name="tx" value={t.id} />}
              <input type="search" name="s" defaultValue={q.s} placeholder="번호·업체·목적 일부" aria-label="고를 건 찾기" className="h-11 w-64 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" />
              <button className={buttonClass("secondary")}>찾기</button>
            </form>
          )}
          {body && <div className="mt-3">{body}</div>}
        </Card>
      )}
    </>
  );
}
