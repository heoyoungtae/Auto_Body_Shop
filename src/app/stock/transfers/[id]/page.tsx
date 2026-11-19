import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listBranches } from "@/modules/platform/branch";
import { getTransfer, TRANSFER_STATUS } from "@/modules/purchase/transfer";
import { AssistForm } from "../../../_assist";
import { NumberField, TextAreaField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../../_ui";
import { cancelTransferAction, receiveTransferAction } from "../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 재고 이동 전표 한 장: 받음 확인(받은 수량·사유)과 취소 */
export default async function TransferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const [t, branches] = await Promise.all([getTransfer(db, id), listBranches(db)]);
  const nameOf = (b: string) => branches.find((x) => x.id === b)?.name ?? "?";
  const manage = can(user, "stock.manage");
  const open = t.status === "sent";
  const atTo = user.branchId === t.toBranchId || user.roles.includes("owner");
  return (
    <>
      <PageTitle
        help="stock.transfer"
        sub={`${nameOf(t.fromBranchId)} → ${nameOf(t.toBranchId)} · ${fmtTime(t.sentAt)} ${t.sentByName} 보냄`}
        actions={
          <Link href="/stock/transfers" className="text-sm text-[var(--accent)]">
            ← 재고 이동
          </Link>
        }
      >
        {t.docNo} <Badge tone={open ? "warn" : t.status === "received" ? "ok" : "neutral"}>{TRANSFER_STATUS[t.status as keyof typeof TRANSFER_STATUS] ?? t.status}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="품목" help={{ kind: "panel", id: "st.transfers" }}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="py-1.5 pr-2">품목</th>
                <th className="pr-2 text-right">보낸 수량</th>
                <th className="pr-2 text-right">받은 수량</th>
                <th className="text-right">금액(보낼 때 평균 단가)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {t.lines.map((l) => (
                <tr key={l.itemId}>
                  <td className="py-2 pr-2">
                    <Link href={`/stock/${l.itemId}`} className="text-[var(--accent)]">
                      {l.name}
                    </Link>
                  </td>
                  <td className="pr-2 text-right">
                    {l.qty}
                    {l.unit}
                  </td>
                  <td className={`pr-2 text-right ${l.got != null && l.got < l.qty ? "font-bold text-[var(--danger)]" : ""}`}>{l.got != null ? `${l.got}${l.unit}` : "-"}</td>
                  <td className="text-right">{won(l.qty * l.unitWon)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.note && <p className="mt-2 text-sm">메모: {t.note}</p>}
          {t.receivedAt && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {fmtTime(t.receivedAt)} {t.receivedByName} {t.status === "cancelled" ? "취소" : "받음 확인"}
              {t.receivedNote ? ` — ${t.receivedNote}` : ""}
            </p>
          )}
        </Card>
        {open && manage && (
          <div className="space-y-4">
            {atTo ? (
              <Card title="받음 확인" help={{ kind: "panel", id: "st.transfer.receive" }}>
                <AssistForm id={`transfer-recv-${t.id}`} action={receiveTransferAction} className="space-y-3">
                  <input type="hidden" name="id" value={t.id} />
                  {t.lines.map((l) => (
                    <NumberField key={l.itemId} help="tf.got" name={`got_${l.itemId}`} label={l.name} min={0} max={l.qty} unit={l.unit} defaultValue={l.qty} />
                  ))}
                  <TextAreaField help="tf.receiveNote" name="receivedNote" rows={2} />
                  <SubmitButton>받음 확인</SubmitButton>
                </AssistForm>
              </Card>
            ) : (
              <Notice>받는 지점({nameOf(t.toBranchId)})에서 받음 확인을 합니다. 화면 위에서 지점을 바꾸면 여기서도 할 수 있습니다.</Notice>
            )}
            <Card title="취소" help={{ kind: "panel", id: "st.transfer.receive" }}>
              <AssistForm id={`transfer-cancel-${t.id}`} action={cancelTransferAction} className="space-y-3">
                <input type="hidden" name="id" value={t.id} />
                <TextAreaField help="tf.cancelReason" name="cancelReason" rows={2} />
                <SubmitButton variant="secondary">이동 취소(보낸 지점으로 되돌림)</SubmitButton>
              </AssistForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
