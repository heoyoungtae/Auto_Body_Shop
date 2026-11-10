import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  dayClose,
  dayTotals,
  listMonthCloses,
  recentDayCloses,
  unclosedDays,
} from "@/modules/money/close";
import { MONTH_CLOSE_STATUS, prevYm } from "@/modules/money/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { NumberField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../_ui";
import { closeDayAction } from "../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 마감(STD-12 12.4): 일일 마감(카드·현금 맞추기)과 월 마감 목록 */
export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "money.close_day") && !can(user, "money.close_month"))
    return (
      <p className="text-sm text-[var(--muted)]">
        마감은 상담원·회계 담당·대표가 합니다.
      </p>
    );
  const db = await getDb();
  const today = seoulDate();
  const day =
    q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day) && q.day <= today
      ? q.day
      : today;
  const [t, done, recent, months, open] = await Promise.all([
    dayTotals(db, day),
    dayClose(db, day),
    recentDayCloses(db),
    listMonthCloses(db),
    unclosedDays(db, "2000-01-01", today),
  ]);
  const last = prevYm(today.slice(0, 7));
  return (
    <>
      <PageTitle
        help="close"
        sub="하루가 끝나면 카드 단말기 합계와 세어 본 현금을 수납 전표와 맞춥니다. 달이 끝나면 회계 담당이 월 마감 자료를 대표에게 올립니다."
      >
        마감
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {open.filter((d) => d !== day).length > 0 && (
        <p className="text-sm">
          마감 안 한 날:{" "}
          {open
            .filter((d) => d !== day)
            .map((d) => (
              <Link
                key={d}
                href={`/money/close?day=${d}`}
                className="mr-2 text-[var(--accent)]"
              >
                {d}
              </Link>
            ))}
        </p>
      )}
      <Card
        title={`${day} 일일 마감`}
        help={{ kind: "panel", id: "close.day" }}
      >
        <dl className="mb-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--muted)]">카드 전표</dt>
            <dd className="font-semibold">{won(t.card)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">현금 전표</dt>
            <dd className="font-semibold">{won(t.cash)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">계좌 이체</dt>
            <dd className="font-semibold">{won(t.transfer)}</dd>
          </div>
        </dl>
        {done ? (
          <p className="text-sm">
            마감함 · {fmtTime(done.closedAt)} · 단말기{" "}
            {won(done.cardTerminalWon)} · 현금 {won(done.cashCountedWon)}
            {done.cardTerminalWon !== done.cardWon ||
            done.cashCountedWon !== done.cashWon ? (
              <Badge tone="warn">
                차이{" "}
                {won(
                  done.cardTerminalWon -
                    done.cardWon +
                    done.cashCountedWon -
                    done.cashWon,
                )}
              </Badge>
            ) : (
              <Badge tone="ok">맞음</Badge>
            )}
            {done.note && ` · ${done.note}`}
          </p>
        ) : can(user, "money.close_day") ? (
          <AssistForm
            id={`close-${day}`}
            action={closeDayAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="day" value={day} />
            <NumberField
              help="close.cardTerminalWon"
              name="cardTerminalWon"
              required
              unit="원"
              min={0}
              suggested={t.card}
            />
            <NumberField
              help="close.cashCountedWon"
              name="cashCountedWon"
              required
              unit="원"
              min={0}
              suggested={t.cash}
            />
            <div className="md:col-span-2">
              <TextField help="close.note" name="note" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>일일 마감</SubmitButton>
            </div>
          </AssistForm>
        ) : null}
      </Card>

      <Card title="최근 일일 마감" help={{ kind: "panel", id: "close.recent" }}>
        {recent.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {recent.map(({ d, by }) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 py-1.5"
              >
                <Link
                  href={`/money/close?day=${d.day}`}
                  className="text-[var(--accent)]"
                >
                  {d.day}
                </Link>
                <span>
                  카드 {won(d.cardWon)} · 현금 {won(d.cashWon)} · 이체{" "}
                  {won(d.transferWon)}
                </span>
                {d.diffWon !== 0 ||
                d.cardTerminalWon !== d.cardWon ||
                d.cashCountedWon !== d.cashWon ? (
                  <Badge tone="warn">차이</Badge>
                ) : null}
                <span className="text-xs text-[var(--muted)]">{by}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 일일 마감 기록이 없습니다.</Empty>
        )}
      </Card>

      {can(user, "money.close_month") && (
        <Card
          title="월 마감"
          help={{ kind: "panel", id: "close.month" }}
          actions={
            <Link
              href={`/money/close/${last}`}
              className={buttonClass("secondary")}
            >
              {last} 마감 자료
            </Link>
          }
        >
          {months.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {months.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-2 py-1.5"
                >
                  <Link
                    href={`/money/close/${m.ym}`}
                    className="text-[var(--accent)]"
                  >
                    {m.ym}
                  </Link>
                  <Badge
                    tone={
                      m.status === "approved"
                        ? "ok"
                        : m.status === "returned"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {
                      MONTH_CLOSE_STATUS[
                        m.status as keyof typeof MONTH_CLOSE_STATUS
                      ]
                    }
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 월 마감 기록이 없습니다.</Empty>
          )}
        </Card>
      )}
    </>
  );
}
