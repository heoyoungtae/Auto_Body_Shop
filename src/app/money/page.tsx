import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  AR_DUN_DAYS,
  PAY_IN_METHODS,
  RECEIPT_KINDS,
} from "@/modules/money/rules";
import {
  customerReceivables,
  insurerReceivables,
  listPayments,
  unrecordedDeliveries,
} from "@/modules/money/receipts";
import { addDays, seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 청구·수납(STD-12 12.1·12.3): 수납 기록 안 한 출고, 고객·보험사 미수, 최근 입금 전표 */
export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "money.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        청구·수납은 상담원·공장장·회계 담당·대표가 봅니다.
      </p>
    );
  const db = await getDb();
  const today = seoulDate();
  const [todo, car, iar, pays] = await Promise.all([
    unrecordedDeliveries(db),
    customerReceivables(db),
    insurerReceivables(db),
    listPayments(db, addDays(today, -6), today),
  ]);
  const carSum = car.reduce((a, r) => a + r.remain, 0);
  const iarSum = iar.reduce((a, r) => a + r.claimedWon, 0);
  return (
    <>
      <PageTitle
        help="money"
        sub="받을 돈은 정비명세서(보험 건은 보험 청구의 고객 몫)에서 불러옵니다. 전표는 고치지 않고, 잘못 적었으면 취소 전표를 적습니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, "money.close_day") && (
              <Link href="/money/close" className={buttonClass("secondary")}>
                마감
              </Link>
            )}
            {can(user, "claim.desk") || can(user, "claim.money") ? (
              <Link href="/claims" className={buttonClass("secondary")}>
                보험 청구
              </Link>
            ) : null}
          </div>
        }
      >
        청구·수납
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card
          title="수납 기록 안 한 출고"
          help={{ kind: "panel", id: "money.unrecorded" }}
        >
          <p className="text-2xl font-semibold">{todo.length}건</p>
        </Card>
        <Card title="고객 미수" help={{ kind: "panel", id: "money.ar" }}>
          <p className="text-2xl font-semibold">{won(carSum)}</p>
          <p className="text-xs text-[var(--muted)]">
            {car.length}건 · {AR_DUN_DAYS}일 넘음{" "}
            {car.filter((r) => (r.days ?? 0) >= AR_DUN_DAYS).length}건
          </p>
        </Card>
        <Card title="보험사 미수" help={{ kind: "panel", id: "money.insurer" }}>
          <p className="text-2xl font-semibold">{won(iarSum)}</p>
          <p className="text-xs text-[var(--muted)]">
            청구하고 입금 확인 전 {iar.length}건
          </p>
        </Card>
      </div>

      {todo.length > 0 && (
        <Card
          title="수납 기록 안 한 출고"
          help={{ kind: "panel", id: "money.unrecorded" }}
        >
          <ul className="divide-y divide-[var(--line)] text-sm">
            {todo.map((r) => (
              <li
                key={r.roId}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <Link
                  href={`/money/ro/${r.roId}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {r.docNo} {r.plateNo}
                </Link>
                <Badge tone="warn">
                  출고 때{" "}
                  {PAY_IN_METHODS[r.method as keyof typeof PAY_IN_METHODS]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="고객 미수" help={{ kind: "panel", id: "money.ar" }}>
        {car.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {car.map((r) => (
              <li
                key={r.roId}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <Link
                  href={`/money/ro/${r.roId}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {r.docNo} {r.who}
                </Link>
                <span>남음 {won(r.remain)}</span>
                <span className="text-xs text-[var(--muted)]">
                  받을 {won(r.due)} · 받음 {won(r.paid)}
                </span>
                {r.days != null && (
                  <Badge tone={r.days >= AR_DUN_DAYS ? "danger" : "neutral"}>
                    출고 {r.days}일
                  </Badge>
                )}
                {r.insurance && <Badge>보험 건 고객 몫</Badge>}
                {r.promisedOn && (
                  <span className="text-xs">약속 {r.promisedOn}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>고객 미수가 없습니다.</Empty>
        )}
      </Card>

      <Card title="보험사 미수" help={{ kind: "panel", id: "money.insurer" }}>
        {iar.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {iar.map((r) => (
              <li
                key={r.docNo}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <Link
                  href={`/repairs/${r.roId}/claim`}
                  className="font-medium text-[var(--accent)]"
                >
                  {r.docNo} {r.insurer}
                </Link>
                <span>{won(r.claimedWon)}</span>
                <span className="text-xs text-[var(--muted)]">
                  {r.roDocNo} {r.plateNo} · {r.claimedOn} 청구
                </span>
                <Badge tone={r.days >= AR_DUN_DAYS ? "danger" : "neutral"}>
                  {r.days}일
                </Badge>
                {r.dunnedOn && (
                  <span className="text-xs">독촉 {r.dunnedOn}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>입금 기다리는 보험 청구가 없습니다.</Empty>
        )}
      </Card>

      <Card
        title="최근 7일 입금 전표"
        help={{ kind: "panel", id: "money.recent" }}
      >
        {pays.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {pays.map(({ p, roDocNo, plateNo, customerName }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-xs text-[var(--muted)]">
                  {p.receivedOn}
                </span>
                <Link
                  href={
                    p.payer === "insurer"
                      ? `/repairs/${p.repairOrderId}/claim`
                      : `/money/ro/${p.repairOrderId}`
                  }
                  className="text-[var(--accent)]"
                >
                  {p.docNo}
                </Link>
                {p.payer === "insurer" && (
                  <Badge tone="accent">보험사 {p.payerName}</Badge>
                )}
                <span>
                  {roDocNo} {customerName} {plateNo}
                </span>
                <span
                  className={
                    p.amountWon < 0 ? "text-[var(--danger)]" : "font-medium"
                  }
                >
                  {won(p.amountWon)}
                </span>
                <Badge>
                  {PAY_IN_METHODS[p.method as keyof typeof PAY_IN_METHODS]}
                </Badge>
                <span className="text-xs text-[var(--muted)]">
                  {p.payer === "insurer"
                    ? p.note
                    : RECEIPT_KINDS[
                        p.receiptKind as keyof typeof RECEIPT_KINDS
                      ]}
                </span>
                {p.reversalOf && <Badge tone="danger">취소 전표</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>최근 7일 입금 전표가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
