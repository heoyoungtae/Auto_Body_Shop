import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  GIFT_PURPOSES,
  listGifts,
  type GiftPurpose,
} from "@/modules/messaging/gift-send";
import { giftConfig } from "@/modules/messaging/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { TextField } from "../_input";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../_ui";
import { cancelGiftAction } from "./actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const shift = (ym: string, d: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};
const STATUS = {
  sent: ["보냄", "ok"],
  failed: ["실패", "danger"],
  cancelled: ["취소", "neutral"],
} as const;

/** 기프티콘 이력: 월별 발송·목적별 금액·취소 */
export default async function GiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "gift.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        기프티콘 이력은 대표·공장장·상담·회계 담당이 봅니다.
      </p>
    );
  const db = await getDb();
  const thisYm = seoulDate(new Date()).slice(0, 7);
  const ym =
    q.ym && /^\d{4}-\d{2}$/.test(q.ym) && q.ym <= thisYm ? q.ym : thisYm;
  const { rows, total, count, byPurpose } = await listGifts(db, ym);
  const { data } = await giftConfig(db);
  return (
    <>
      <PageTitle
        help="gifts"
        sub={`${ym} · ${count}건 ${won(total)}${data.monthLimit ? ` / 예산 ${won(data.monthLimit)}` : ""} · ${(
          Object.keys(GIFT_PURPOSES) as GiftPurpose[]
        )
          .filter((p) => byPurpose[p])
          .map((p) => `${GIFT_PURPOSES[p]} ${won(byPurpose[p])}`)
          .join(" · ")}`}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/gifts?ym=${shift(ym, -1)}`}
              className="text-[var(--accent)]"
            >
              ← {shift(ym, -1)}
            </Link>
            {ym < thisYm && (
              <Link
                href={`/gifts?ym=${shift(ym, 1)}`}
                className="text-[var(--accent)]"
              >
                {shift(ym, 1)} →
              </Link>
            )}
            {can(user, "gift.send") && (
              <Link href="/gifts/send" className={buttonClass()}>
                기프티콘 보내기
              </Link>
            )}
          </div>
        }
      >
        기프티콘 이력
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title={`${ym} 발송`} help={{ kind: "panel", id: "gift.list" }}>
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map(({ g, by }) => (
              <li key={g.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.docNo}</span>
                  <Badge tone={STATUS[g.status as keyof typeof STATUS][1]}>
                    {STATUS[g.status as keyof typeof STATUS][0]}
                  </Badge>
                  <span>
                    {g.customerName}{" "}
                    <span className="text-xs text-[var(--muted)]">
                      {g.toMasked}
                    </span>
                  </span>
                  <span>
                    {g.goodsName} {won(g.price)}
                  </span>
                  <Badge>{GIFT_PURPOSES[g.purpose as GiftPurpose]}</Badge>
                  {g.provider === "demo" && <Badge tone="warn">데모</Badge>}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {fmtTime(g.sentAt)} · {by ?? "-"} · {g.reason}
                  {g.error && ` · 오류: ${g.error}`}
                  {g.cancelledAt &&
                    ` · ${fmtTime(g.cancelledAt)} 취소: ${g.cancelReason}`}
                </p>
                {g.status === "sent" &&
                  (g.sentBy === user.id || user.roles.includes("owner")) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-[var(--accent)]">
                        취소
                      </summary>
                      <AssistForm
                        id={`gift-cancel-${g.id}`}
                        action={cancelGiftAction}
                        className="mt-1 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="ym" value={ym} />
                        <div className="min-w-60 flex-1">
                          <TextField
                            help="gift.cancelReason"
                            name="reason"
                            required
                          />
                        </div>
                        <SubmitButton variant="secondary">
                          취소하기
                        </SubmitButton>
                      </AssistForm>
                    </details>
                  )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>이달 보낸 기프티콘이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
