import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { AOS_MATCH_LABEL, loadAosUpload, matchAosPaid, type AosMatchStatus } from "@/modules/repair/aos-paid";
import { AssistForm } from "../../_assist";
import { HelpButton } from "../../_help-drawer";
import { SheetFile } from "../../money/bank/sheet-file";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { aosPaidAction } from "./actions";

const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);
const TONE: Record<AosMatchStatus, "ok" | "warn" | "danger" | "neutral"> = { ok: "ok", cut: "warn", over: "danger", paid: "neutral", dup: "neutral", none: "danger" };
const box = "w-full min-w-40 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1 text-sm";

/** AOS 지급 조회 엑셀로 보험 입금 맞추기(AOS 1묶음 1번). AOS 를 쓰지 않으면 이 화면은 쓰지 않아도 된다 */
export default async function AosPaidPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const money = can(user, "claim.money");
  const up = money ? await loadAosUpload(db, user.id) : null;
  const rows = up ? await matchAosPaid(db, up.rows) : [];
  const ready = rows.filter((r) => r.ready);
  return (
    <>
      <PageTitle
        help="claims.aosPaid"
        std="STD-03 6절"
        sub="AOS '보험금 종결/지급 조회'에서 저장한 엑셀을 올리면 청구한 건과 맞춰 입금 확인을 한꺼번에 합니다."
        actions={
          <Link href="/claims" className={buttonClass("secondary")}>
            보험 청구 목록
          </Link>
        }
      >
        AOS 지급 엑셀 맞추기
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      {!money ? (
        <Empty>보험 입금 확인은 회계 담당·대표가 합니다.</Empty>
      ) : (
        <div className="space-y-4">
          <Card title="지급 조회 엑셀 올리기" help={{ kind: "panel", id: "aosPaid.upload" }}>
            <AssistForm id="aos-paid-upload" action={aosPaidAction} className="space-y-3" guard={false}>
              <input type="hidden" name="intent" value="upload" />
              <SheetFile help="aosPaid.file" />
              <p className="text-xs text-[var(--muted)]">AOS 에서: 보험금 종결/지급 조회 → 기간 넣고 조회 → 엑셀 저장. 같은 파일을 다시 올려도 이미 확인한 건은 &lsquo;이미 입금 확인함&rsquo;으로 나와 두 번 적히지 않습니다.</p>
              <SubmitButton>올려서 맞춰 보기</SubmitButton>
            </AssistForm>
          </Card>
          {up && (
            <Card title={`맞춘 결과 · ${up.fileName}`} help={{ kind: "panel", id: "aosPaid.preview" }}>
              <AssistForm id="aos-paid-apply" action={aosPaidAction} className="space-y-3" guard={false}>
                <input type="hidden" name="intent" value="apply" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-[var(--muted)]">
                      <tr>
                        <th className="py-1.5 pr-2">확인</th>
                        <th className="py-1.5 pr-2">엑셀 줄</th>
                        <th className="py-1.5 pr-2">찾은 청구</th>
                        <th className="py-1.5 pr-2 text-right">청구액</th>
                        <th className="py-1.5 pr-2 text-right">지급액</th>
                        <th className="py-1.5 pr-2">지급일</th>
                        <th className="py-1.5 pr-2">결과</th>
                        <th className="py-1.5 pr-2">
                          감액 사유 <HelpButton topic={{ kind: "field", id: "aosPaid.cutReason" }} name="감액 사유" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {rows.map((r) => (
                        <tr key={r.line} className={r.ready ? "" : "opacity-70"}>
                          <td className="py-1.5 pr-2">{r.ready && <input type="checkbox" data-assist="grid" name="pick" value={r.line} defaultChecked={r.status === "ok"} aria-label={`${r.line}번째 줄 입금 확인`} />}</td>
                          <td className="py-1.5 pr-2 text-xs">
                            {r.line}번째 · {r.claimNo || "접수번호 없음"}
                            <br />
                            {r.plate} {r.insurer}
                          </td>
                          <td className="py-1.5 pr-2">
                            {r.claim ? (
                              <Link href={`/repairs/${r.claim.roId}/claim${r.claim.seq > 1 ? `?c=${r.claim.seq}` : ""}`} className="text-[var(--accent)]">
                                {r.claim.docNo}
                              </Link>
                            ) : (
                              "—"
                            )}
                            {r.claim && <div className="text-xs text-[var(--muted)]">{r.claim.roNo} · {r.claim.insurer}</div>}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{won(r.claim?.claimedWon)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{won(r.paidWon)}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.paidOn ?? "오늘로"}</td>
                          <td className="py-1.5 pr-2">
                            <Badge tone={TONE[r.status]}>{AOS_MATCH_LABEL[r.status]}</Badge>
                            {r.status === "cut" && r.claim?.claimedWon != null && <div className="text-xs text-[var(--warn)]">{won(r.claim.claimedWon - r.paidWon)} 덜 들어옴</div>}
                          </td>
                          <td className="py-1.5 pr-2">{r.status === "cut" && <input data-assist="grid" name={`cut:${r.line}`} defaultValue={r.memo} aria-label={`${r.line}번째 줄 감액 사유`} className={box} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  맞는 청구가 없는 줄은 보험 청구 화면에서 접수번호를 확인해 주세요. 청구액보다 많은 줄은 보험사에 확인한 뒤 보험 청구 화면에서 직접 입금 확인합니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ready.length > 0 && <SubmitButton>고른 줄 입금 확인</SubmitButton>}
                </div>
              </AssistForm>
              <form action={aosPaidAction} className="mt-2">
                <input type="hidden" name="intent" value="clear" />
                <SubmitButton variant="secondary">올린 파일 지우기</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
