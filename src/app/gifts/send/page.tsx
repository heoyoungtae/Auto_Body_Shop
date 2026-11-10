import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  findGiftCustomers,
  GIFT_PURPOSES,
  giftGoods,
  giftTarget,
  monthSpent,
} from "@/modules/messaging/gift-send";
import { giftConfig } from "@/modules/messaging/service";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  PageTitle,
} from "../../_ui";
import { sendGiftAction } from "../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 기프티콘 보내기: 고객 찾기 → 동의·최근 발송 확인 → 목적·상품 → 발송 */
export default async function SendGiftPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  if (!can(user, "gift.send"))
    return (
      <p className="text-sm text-[var(--muted)]">
        기프티콘은 대표·공장장·상담 담당이 보냅니다.
      </p>
    );
  const { data } = await giftConfig(db);
  const found = q.q ? await findGiftCustomers(db, q.q) : [];
  const t = q.customer ? await giftTarget(db, q.customer) : null;
  const goods = t ? await giftGoods(db) : null;
  const spent = await monthSpent(db);
  const owner = user.roles.includes("owner");
  const purposes = (
    Object.entries(GIFT_PURPOSES) as [keyof typeof GIFT_PURPOSES, string][]
  ).filter(([k]) => k !== "complaint" || can(user, "complaint.compensate"));
  return (
    <>
      <PageTitle
        help="gifts.send"
        sub={`${data.provider === "demo" ? "데모 모드(실제 발송 안 됨) · " : ""}이번 달 ${won(spent)}${data.monthLimit ? ` / 예산 ${won(data.monthLimit)}` : ""}${data.unitLimit ? ` · 건당 상한 ${won(data.unitLimit)}` : ""}`}
        actions={
          <Link href="/gifts" className="text-sm text-[var(--accent)]">
            ← 기프티콘 이력
          </Link>
        }
      >
        기프티콘 보내기
      </PageTitle>
      <ErrorBox message={q.error} />

      <Card title="1. 받는 고객" help={{ kind: "panel", id: "gift.target" }}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1">
            <TextField help="gift.q" name="q" defaultValue={q.q ?? ""} />
          </div>
          <button className={buttonClass("secondary")}>찾기</button>
        </form>
        {q.q && (
          <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
            {found.length ? (
              found.map((c) => (
                <li key={c.id} className="py-1.5">
                  <Link
                    href={`/gifts/send?customer=${c.id}`}
                    className="text-[var(--accent)]"
                  >
                    {c.name}
                  </Link>{" "}
                  <span className="text-xs text-[var(--muted)]">
                    {c.phoneMasked ?? "번호 없음"}
                  </span>
                </li>
              ))
            ) : (
              <li className="py-1.5 text-[var(--muted)]">
                찾는 고객이 없습니다.
              </li>
            )}
          </ul>
        )}
        {t && (
          <div className="mt-3 rounded-md bg-[var(--accent-soft)] p-3 text-sm">
            <p className="font-medium">
              {t.name}{" "}
              <span className="text-xs text-[var(--muted)]">
                {t.phoneMasked ?? "번호 없음"}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={t.required ? "ok" : "danger"}>
                개인정보 동의 {t.required ? "있음" : "없음"}
              </Badge>
              <Badge tone={t.marketing ? "ok" : "warn"}>
                광고 수신 {t.marketing ? "동의" : "미동의"}
              </Badge>
            </div>
            {!t.marketing && t.required && (
              <p className="mt-1 text-xs">
                광고 수신에 동의하지 않아 이벤트 경품·감사 기프티콘은 보낼 수
                없습니다. 불만 보상은 보낼 수 있습니다.
              </p>
            )}
            {t.recent.length > 0 && (
              <p className="mt-1 text-xs text-[var(--danger)]">
                ⚠ {t.dupDays}일 안에 보낸 기프티콘:{" "}
                {t.recent
                  .map((r) => `${fmtTime(r.sentAt)} ${r.goodsName}`)
                  .join(", ")}
              </p>
            )}
          </div>
        )}
      </Card>

      {t && goods && (
        <Card title="2. 목적·상품" help={{ kind: "panel", id: "gift.send" }}>
          {goods.error && (
            <p className="mb-2 text-sm text-[var(--danger)]">
              상품 목록을 가져오지 못했습니다: {goods.error}
            </p>
          )}
          {goods.list.length ? (
            <AssistForm
              id={`gift-send-${t.id}`}
              action={sendGiftAction}
              className="grid gap-3 md:grid-cols-2"
            >
              <input type="hidden" name="customerId" value={t.id} />
              <div className="md:col-span-2">
                <RadioRow
                  help="gift.purpose"
                  name="purpose"
                  required
                  defaultValue={
                    t.marketing
                      ? "event"
                      : t.complaints.length && can(user, "complaint.compensate")
                        ? "complaint"
                        : undefined
                  }
                  options={purposes.map(([value, label]) => ({ value, label }))}
                />
              </div>
              {t.complaints.length > 0 && can(user, "complaint.compensate") && (
                <SelectField
                  help="gift.complaintId"
                  name="complaintId"
                  placeholder="불만 보상일 때 고르기"
                  options={t.complaints.map((c) => ({
                    value: c.id,
                    label: `${c.docNo}`,
                  }))}
                />
              )}
              <TextField help="gift.reason" name="reason" required />
              <div className="md:col-span-2">
                <SelectField
                  help="gift.goodsCode"
                  name="goodsCode"
                  required
                  placeholder="상품 고르기"
                  options={goods.list
                    .filter(
                      (g) =>
                        owner || !data.unitLimit || g.price <= data.unitLimit,
                    )
                    .sort((a, b) => a.price - b.price)
                    .map((g) => ({
                      value: g.code,
                      label: `${g.brand ? `${g.brand} · ` : ""}${g.name} — ${won(g.price)}${data.unitLimit && g.price > data.unitLimit ? " (상한 초과·대표)" : ""}`,
                    }))}
                />
              </div>
              <div className="md:col-span-2">
                <TextAreaField help="gift.message" name="message" rows={2} />
              </div>
              {t.recent.length > 0 && (
                <div className="md:col-span-2">
                  <RadioRow
                    help="gift.dupOk"
                    name="dupOk"
                    required
                    options={[
                      { value: "1", label: "알고 보냄", tone: "warn" },
                      { value: "0", label: "보내지 않음" },
                    ]}
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <SubmitButton>보내기</SubmitButton>
              </div>
            </AssistForm>
          ) : (
            <Empty>
              보낼 수 있는 상품이 없습니다. 설정 › 기프티콘 공급사를 확인하세요.
            </Empty>
          )}
        </Card>
      )}
    </>
  );
}
