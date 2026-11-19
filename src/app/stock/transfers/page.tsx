import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listBranches } from "@/modules/platform/branch";
import { listStock } from "@/modules/purchase/stock";
import { branchStock, listTransfers, TRANSFER_STATUS } from "@/modules/purchase/transfer";
import { AssistForm } from "../../_assist";
import { NumberField, SelectField, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { sendTransferAction } from "./actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 재고 이동(본점·지점 3단계): 지금 지점에서 다른 지점으로 보내고, 받는 지점이 확인한다 */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const branches = (await listBranches(db)).filter((b) => !b.closedOn);
  const nameOf = (id: string) => branches.find((b) => b.id === id)?.name ?? "?";
  const here = user.branchId ?? branches[0]?.id;
  const manage = can(user, "stock.manage");
  const [list, items] = await Promise.all([listTransfers(db, user.viewBranchId), manage && branches.length > 1 ? listStock(db, "all") : Promise.resolve([])]);
  const bs = items.length ? (await branchStock(db, items.map((i) => i.id))).by : new Map();
  const held = items.filter((i) => (bs.get(i.id)?.get(here)?.qty ?? 0) > 0);
  const others = branches.filter((b) => b.id !== here);
  return (
    <>
      <PageTitle
        help="stock.transfers"
        sub="지점 사이에 자재를 옮길 때 씁니다. 보내면 보낸 지점 재고에서 빠지고, 받는 지점이 '받음 확인'을 누르면 그 지점 재고에 들어갑니다."
        actions={
          <Link href="/stock" className="text-sm text-[var(--accent)]">
            ← 재고
          </Link>
        }
      >
        재고 이동
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {branches.length <= 1 && <Notice>지점이 본점 하나뿐이라 옮길 곳이 없습니다. 지점은 설정 › 본점·지점에서 더합니다.</Notice>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="이동 전표" help={{ kind: "panel", id: "st.transfers" }}>
          {list.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">번호</th>
                    <th className="pr-2">보낸 곳 → 받는 곳</th>
                    <th className="pr-2">품목</th>
                    <th className="pr-2 text-right">금액</th>
                    <th className="pr-2">보낸 때</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {list.map(({ t, by }) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <Link href={`/stock/transfers/${t.id}`} className="font-semibold text-[var(--accent)]">
                          {t.docNo}
                        </Link>
                      </td>
                      <td className="pr-2 whitespace-nowrap">
                        {nameOf(t.fromBranchId)} → {nameOf(t.toBranchId)}
                      </td>
                      <td className="pr-2 text-xs">{t.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join(", ")}</td>
                      <td className="pr-2 text-right whitespace-nowrap">{won(t.amountWon)}</td>
                      <td className="pr-2 text-xs whitespace-nowrap">
                        {fmtTime(t.sentAt)} · {by}
                      </td>
                      <td>
                        <Badge tone={t.status === "sent" ? "warn" : t.status === "received" ? "ok" : "neutral"}>{TRANSFER_STATUS[t.status as keyof typeof TRANSFER_STATUS] ?? t.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>아직 재고 이동이 없습니다.</Empty>
          )}
        </Card>
        {manage && others.length > 0 && (
          <Card title={`${nameOf(here)}에서 보내기`} help={{ kind: "panel", id: "st.transfer.new" }}>
            {held.length ? (
              <AssistForm id={`transfer-new-${here}`} action={sendTransferAction} className="space-y-3">
                <SelectField help="tf.to" name="toBranchId" required defaultValue={others.length === 1 ? others[0].id : undefined} options={others.map((b) => ({ value: b.id, label: b.name }))} />
                <div className="grid gap-2 md:grid-cols-2">
                  {held.map((i) => (
                    <div key={i.id}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <NumberField help="tf.qty" name={`qty_${i.id}`} label={`${i.name}${i.spec ? ` ${i.spec}` : ""}`} min={0} max={bs.get(i.id)?.get(here)?.qty ?? 0} unit={i.unit} current={bs.get(i.id)?.get(here)?.qty ?? 0} />
                    </div>
                  ))}
                </div>
                <TextAreaField help="tf.note" name="note" rows={2} />
                <SubmitButton>보내기</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">{nameOf(here)}에 있는 재고가 없습니다. 보내는 지점은 화면 위 지점 이름을 눌러 바꿉니다.</p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
