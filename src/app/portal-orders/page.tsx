import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { PORTAL_STEPS } from "@/modules/money/credit-rules";
import { portalCustomers, portalOrders, techbayOrders, techbayStatus } from "@/modules/partner/service";
import type { TechbayOrder } from "@/modules/partner/techbay";
import { AssistForm } from "../_assist";
import { CheckGroup, SelectField, TextField } from "../_input";
import { requireUser, userMessage } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";
import { importAction, techbayAction } from "./actions";
import { PortalSteps } from "./portal-steps";

type Q = { customer?: string; load?: string; error?: string; notice?: string };

/** 업체 주문 앱: 테크베이에 로그인해 주문을 확인·불러오고, 그쪽 앱에 등록할 진행 상태를 챙긴다 */
export default async function PortalOrdersPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "portal.order")) return <p className="text-sm text-[var(--muted)]">업체 주문 앱은 대표·공장장·상담원이 씁니다.</p>;
  const db = await getDb();
  const [st, custs, list] = await Promise.all([techbayStatus(db), portalCustomers(db), portalOrders(db)]);
  const techbayCusts = custs.filter((c) => c.portal === "techbay");
  const custId = q.customer && techbayCusts.some((c) => c.id === q.customer) ? q.customer : (techbayCusts[0]?.id ?? "");
  let loaded: { connected: boolean; rows: TechbayOrder[] } | null = null;
  let loadError = "";
  if (q.load && st.connected && custId) {
    try {
      loaded = await techbayOrders(db, user);
    } catch (e) {
      loadError = userMessage(e);
    }
  }
  const back = `/portal-orders${custId ? `?customer=${custId}` : ""}`;
  const todo = list.filter((o) => o.todo.length && o.ro);
  return (
    <>
      <PageTitle
        help="portal"
        sub="테크베이처럼 업체 고객이 자기 앱으로 주문하는 경우입니다. 이 화면에서 주문을 읽어 와 상담으로 만들고, 수리가 진행되면 그쪽 앱에 진행 상태를 등록했는지 챙깁니다."
        actions={
          <a href={st.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
            테크베이 열기 ↗
          </a>
        }
      >
        업체 주문 앱
      </PageTitle>
      <ErrorBox message={q.error || loadError} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="테크베이 주문 불러오기" help={{ kind: "panel", id: "portal.import" }}>
            {!techbayCusts.length ? (
              <Empty action={<Link href="/customers/new" className={buttonClass()}>업체 고객 등록</Link>}>테크베이로 주문하는 업체 고객이 없습니다. 업체 고객을 등록하고 '주문 앱'을 테크베이로 고르세요.</Empty>
            ) : !st.connected ? (
              <p className="text-sm text-[var(--muted)]">먼저 오른쪽 '테크베이 연결'에서 인증번호로 로그인하세요.</p>
            ) : (
              <div className="space-y-3">
                <form method="get" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="load" value="1" />
                  <div className="min-w-56">
                    <SelectField help="portal.customer" name="customer" required defaultValue={custId} options={techbayCusts.map((c) => ({ value: c.id, label: c.name }))} />
                  </div>
                  <button className={buttonClass()}>입고완료 주문 읽어 오기</button>
                </form>
                {loaded && !loaded.connected && <p className="text-sm text-[var(--danger)]">테크베이 연결이 끝났습니다. 인증번호로 다시 로그인하세요.</p>}
                {loaded?.connected &&
                  (loaded.rows.length ? (
                    <AssistForm id="portal-import" action={importAction} className="space-y-3">
                      <input type="hidden" name="customerId" value={custId} />
                      <CheckGroup
                        help="portal.orders"
                        name="order"
                        defaultChecked={loaded.rows.map((r) => r.hashId)}
                        options={loaded.rows.map((r) => ({
                          value: r.hashId,
                          label: `${r.plateNo || "번호 없음"} ${[r.make, r.model, r.year && `${r.year}년`, r.mileage && `${r.mileage.toLocaleString("ko-KR")}km`].filter(Boolean).join(" ")} · ${r.items.length ? r.items.map((i) => i.content).join(", ").slice(0, 80) : "항목 없음"}${r.requestedAt ? ` · 요청 ${r.requestedAt.slice(0, 10)}` : ""}`,
                        }))}
                      />
                      <SubmitButton>고른 주문을 상담으로 만들기</SubmitButton>
                    </AssistForm>
                  ) : (
                    <Empty>새로 불러올 주문이 없습니다(이미 불러온 주문은 빼고 보입니다).</Empty>
                  ))}
              </div>
            )}
          </Card>

          <Card title={`그쪽 앱에 등록할 진행 상태 ${todo.length}건`} help={{ kind: "panel", id: "portal.todo" }}>
            {list.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {list.map((o) => (
                  <li key={o.o.id} className="space-y-1 py-2">
                    <p className="flex flex-wrap items-center gap-2">
                      <b>{o.o.plateNo ?? "-"}</b>
                      <span>{o.customerName}</span>
                      <span className="text-xs text-[var(--muted)]">주문 {o.o.extNo ?? o.o.extId}</span>
                      {o.ro ? (
                        <Link href={`/repairs/${o.ro.id}#portal`} className="text-[var(--accent)] hover:underline">
                          {o.ro.docNo}
                        </Link>
                      ) : (
                        o.o.consultationId && (
                          <Link href={`/consults/${o.o.consultationId}`} className="text-[var(--accent)] hover:underline">
                            상담(입고 전)
                          </Link>
                        )
                      )}
                      {o.todo.length ? <Badge tone="warn">등록할 것: {o.todo.map((s) => PORTAL_STEPS[s]).join("·")}</Badge> : o.posted.length ? <Badge tone="ok">등록 끝</Badge> : null}
                    </p>
                    {o.todo.length > 0 && <PortalSteps v={o} back={back} />}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>아직 불러온·이은 주문이 없습니다.</Empty>
            )}
          </Card>
        </div>

        <Card title="테크베이 연결" help={{ kind: "panel", id: "portal.connect" }}>
          <div className="space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={st.connected ? "ok" : "neutral"}>{st.connected ? "연결됨" : "연결 안 됨"}</Badge>
              {st.connected && (
                <span className="text-xs text-[var(--muted)]">
                  {st.shop} · {st.phone} · {st.at.slice(0, 16).replace("T", " ")} 로그인
                </span>
              )}
            </p>
            {st.connected ? (
              <form action={techbayAction}>
                <input type="hidden" name="intent" value="logout" />
                <input type="hidden" name="back" value={back} />
                <SubmitButton variant="secondary">연결 끊기</SubmitButton>
              </form>
            ) : (
              <>
                <AssistForm id="tb-code" action={techbayAction} className="space-y-2" guard={false}>
                  <input type="hidden" name="intent" value="code" />
                  <input type="hidden" name="back" value={back} />
                  <TextField help="portal.phone" name="phone" required inputMode="tel" defaultValue={st.savedPhone} from={st.savedPhone ? "연결 설정" : undefined} />
                  <SubmitButton variant="secondary">인증번호 받기</SubmitButton>
                </AssistForm>
                {st.waitingCode && (
                  <AssistForm id="tb-login" action={techbayAction} className="space-y-2" guard={false}>
                    <input type="hidden" name="intent" value="login" />
                    <input type="hidden" name="back" value={back} />
                    <TextField help="portal.code" name="code" required inputMode="numeric" autoComplete="one-time-code" />
                    <SubmitButton>로그인</SubmitButton>
                  </AssistForm>
                )}
              </>
            )}
            <details className="rounded-md border border-[var(--line)]">
              <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--accent)]">연결 설정(웹 주소·로그인 휴대폰)</summary>
              <AssistForm id="tb-settings" action={techbayAction} className="space-y-2 border-t border-[var(--line)] p-3">
                <input type="hidden" name="intent" value="settings" />
                <input type="hidden" name="back" value={back} />
                <TextField help="portal.url" name="url" type="url" defaultValue={st.url} />
                <TextField help="portal.phone" name="phone" inputMode="tel" defaultValue={st.savedPhone} />
                <SubmitButton variant="secondary">설정 저장</SubmitButton>
              </AssistForm>
            </details>
          </div>
        </Card>
      </div>
    </>
  );
}
