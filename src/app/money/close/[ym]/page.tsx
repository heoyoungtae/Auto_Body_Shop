import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  getMonthClose,
  monthSummary,
  type MonthSummary,
} from "@/modules/money/close";
import { isYm, MONTH_CLOSE_STATUS, ymRange } from "@/modules/money/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import {
  Badge,
  Card,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../../_ui";
import { monthAction } from "../../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{k}</dt>
      <dd className="font-semibold">{v}</dd>
      {sub && <dd className="text-xs text-[var(--muted)]">{sub}</dd>}
    </div>
  );
}

/** 월 마감 자료(STD-12 12.4): 매출·수납·미수·매입·지출·미지급, 대표 본인 결재, 일일 마감 차이 */
export default async function MonthClosePage({
  params,
  searchParams,
}: {
  params: Promise<{ ym: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { ym } = await params;
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "money.close_month"))
    return (
      <p className="text-sm text-[var(--muted)]">
        월 마감은 회계 담당·대표가 봅니다.
      </p>
    );
  if (!isYm(ym)) return <ErrorBox message="달을 확인해 주세요(YYYY-MM)" />;
  const db = await getDb();
  const m = await getMonthClose(db, ym);
  const frozen = m && m.status !== "returned";
  const s = (frozen
    ? m.snapshot
    : await monthSummary(db, ym)) as unknown as MonthSummary;
  const ended = ymRange(ym).to < seoulDate();
  return (
    <>
      <PageTitle
        help="close.month"
        sub={
          frozen
            ? `${fmtTime(m.preparedAt)}에 올린 자료(그때 기준)`
            : "지금 기준으로 모은 자료입니다. 미수·미지급은 지금 남은 금액입니다."
        }
        actions={
          m ? (
            <Badge
              tone={
                m.status === "approved"
                  ? "ok"
                  : m.status === "returned"
                    ? "danger"
                    : "warn"
              }
            >
              {MONTH_CLOSE_STATUS[m.status as keyof typeof MONTH_CLOSE_STATUS]}
            </Badge>
          ) : undefined
        }
      >
        {ym} 월 마감
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {m?.status === "returned" && (
        <p className="text-sm text-[var(--danger)]">
          대표가 돌려보냄: {m.returnNote}
        </p>
      )}

      <Card
        title="매출(정비명세서 발급 기준)"
        help={{ kind: "panel", id: "close.sales" }}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <Row
            k="매출 합계"
            v={won(s.sales.total)}
            sub={`${s.sales.count}건`}
          />
          <Row k="자비" v={won(s.sales.selfTotal)} />
          <Row k="보험 건" v={won(s.sales.insuranceTotal)} />
          <Row
            k="부품 · 공임 · 부가세"
            v={`${won(s.sales.parts)} · ${won(s.sales.labor)}`}
            sub={`부가세 ${won(s.sales.vat)}`}
          />
        </dl>
      </Card>
      <Card title="수납" help={{ kind: "panel", id: "close.collected" }}>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <Row k="받은 돈 합계" v={won(s.collected.total)} />
          <Row
            k="카드 · 현금 · 이체"
            v={`${won(s.collected.card)} · ${won(s.collected.cash)}`}
            sub={`이체 ${won(s.collected.transfer)}`}
          />
          <Row
            k="보험사 입금"
            v={won(s.collected.insurer)}
            sub={
              s.collected.insurerCut
                ? `감액 ${won(s.collected.insurerCut)}`
                : undefined
            }
          />
          <Row
            k="미수(고객 · 보험사)"
            v={`${won(s.receivables.customer)} · ${won(s.receivables.insurer)}`}
            sub={`고객 ${s.receivables.customerCount}건(30일 넘음 ${s.receivables.customerOld}) · 보험사 ${s.receivables.insurerCount}건`}
          />
        </dl>
      </Card>
      <Card title="매입·지출" help={{ kind: "panel", id: "close.expenses" }}>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <Row
            k="매입(입고·외주 수용)"
            v={won(s.purchases.total)}
            sub={`발주 ${s.purchases.poCount}건 · 외주 ${s.purchases.outsourceCount}건`}
          />
          <Row
            k="지출 지급"
            v={won(s.expenses.paid)}
            sub={`${s.expenses.paidCount}건`}
          />
          <Row k="급여(지급일 기준, 지급 총액)" v={won(s.expenses.payroll)} />
          <Row
            k="미지급(결의할 · 지급할)"
            v={`${won(s.payables.toDraft)} · ${won(s.payables.toPay)}`}
          />
        </dl>
        {s.expenses.byCategory.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {s.expenses.byCategory.map((c) => (
              <li key={c.category}>
                <Badge>
                  {c.label} {won(c.won)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="다시 볼 것" help={{ kind: "panel", id: "close.review" }}>
        <ul className="space-y-1 text-sm">
          {s.selfApproved.map((x) => (
            <li key={x.docNo}>
              <Badge tone="warn">대표 본인 결재</Badge> {x.kind} {x.docNo}{" "}
              {x.title} {won(x.won)}
            </li>
          ))}
          {s.dayIssues.unclosed.map((d) => (
            <li key={d}>
              <Badge tone="danger">일일 마감 안 함</Badge>{" "}
              <Link
                href={`/money/close?day=${d}`}
                className="text-[var(--accent)]"
              >
                {d}
              </Link>
            </li>
          ))}
          {s.dayIssues.diffs.map((d) => (
            <li key={d.day}>
              <Badge tone="warn">일일 마감 차이</Badge> {d.day} {won(d.diff)}{" "}
              {d.note}
            </li>
          ))}
          {!s.selfApproved.length &&
            !s.dayIssues.unclosed.length &&
            !s.dayIssues.diffs.length && (
              <li className="text-[var(--muted)]">따로 볼 것이 없습니다.</li>
            )}
        </ul>
      </Card>

      {m?.note && <p className="text-sm">올린 사람 메모: {m.note}</p>}
      {(!m || m.status === "returned") && ended && (
        <Card
          title="대표에게 올리기"
          help={{ kind: "panel", id: "close.prepare" }}
        >
          <AssistForm
            id={`month-${ym}`}
            action={monthAction}
            className="space-y-3"
          >
            <input type="hidden" name="ym" value={ym} />
            <input type="hidden" name="intent" value="prepare" />
            <TextField
              help="close.monthNote"
              name="note"
              required={s.selfApproved.length > 0}
            />
            <SubmitButton>월 마감 올리기</SubmitButton>
          </AssistForm>
        </Card>
      )}
      {m?.status === "submitted" && can(user, "money.close_approve") && (
        <Card title="승인" help={{ kind: "panel", id: "close.approve" }}>
          <AssistForm
            id={`month-ok-${ym}`}
            action={monthAction}
            className="space-y-3"
          >
            <input type="hidden" name="ym" value={ym} />
            <TextField help="close.returnNote" name="returnNote" />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="approve">
                승인(마감)
              </SubmitButton>
              <SubmitButton
                name="intent"
                value="return"
                variant="danger"
                noValidate
              >
                돌려보내기
              </SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
