import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { getFixture } from "@/modules/purchase/fixture";
import { CHECK_RESULTS, DISPOSE_METHODS, FX_CATEGORIES, FX_EVENT, FX_STATUS, FX_TONE, type FxCategory, type FxStatus } from "@/modules/purchase/rules";
import { supplierOptions } from "@/modules/purchase/supplier";
import { loadPolicy } from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { fixtureAction } from "../actions";
import { FixtureFields } from "../_form";

/** 비품 한 개(F-07-04): 정보·지급(수령 확인)·이동·실물 확인·분실·파손·처분·이력 */
export default async function FixturePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getFixture(db, id).catch(() => null);
  if (!r) notFound();
  const { f, events, holder, supplier: sup, checkedThisYear } = r;
  const manage = can(user, "fixture.manage");
  const mine = f.holderId === user.id;
  const status = f.status as FxStatus;
  const live = status !== "disposed";
  const [users, sups, p] = await Promise.all([listUsers(db), manage ? supplierOptions(db) : Promise.resolve([]), loadPolicy(db)]);
  const active = users.filter((u) => u.active);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="fixtures.detail"
        sub={`${FX_CATEGORIES[f.category as FxCategory]}${f.spec ? ` · ${f.spec}` : ""} · ${f.priceWon.toLocaleString("ko-KR")}원${f.asset ? " · 자산 비품" : ""}`}
        actions={
          <Link href="/fixtures" className="text-sm text-[var(--accent)]">
            ← 비품·자산
          </Link>
        }
      >
        {f.no} {f.name} <Badge tone={FX_TONE[status]}>{FX_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {mine && !f.receivedAt && live && (
        <AssistForm id={`fx-rcv-${id}`} action={fixtureAction} guard={false} className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-[var(--warn-soft)] p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="intent" value="receive" />
          <p className="text-sm">나에게 지급된 비품입니다. 실물을 받았으면 수령을 확인해 주세요.</p>
          <SubmitButton>받았음(수령 확인)</SubmitButton>
        </AssistForm>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="비품 정보" help={{ kind: "panel", id: "fx.info" }}>
          <dl className="text-sm">
            {row("위치", f.location)}
            {row("사용자", holder ? `${holder.name}${f.receivedAt ? ` · 수령 ${fmtTime(f.receivedAt)}` : " · 수령 확인 전"}` : "공용")}
            {row("구입", [f.purchasedOn, sup?.name, f.expenseRef].filter(Boolean).join(" · "))}
            {row("보증 기간", f.warrantyUntil ? `${f.warrantyUntil}까지` : null)}
            {row("라벨", f.labeledAt ? `부착 ${fmtTime(f.labeledAt)}` : <span className="text-[var(--warn)]">아직 안 붙임</span>)}
            {row("메모", f.note)}
            {status === "disposed" && row("처분", `${f.disposedOn} · ${DISPOSE_METHODS[f.disposeMethod as keyof typeof DISPOSE_METHODS] ?? ""} · ${f.disposeNote ?? ""}${f.dataWiped ? " · 자료 삭제 확인" : ""}`)}
          </dl>
          {manage && live && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/fixtures/labels?ids=${id}`} className={buttonClass("secondary")}>
                라벨 인쇄
              </Link>
              {!f.labeledAt && (
                <AssistForm id={`fx-label-${id}`} action={fixtureAction} guard={false}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="label" />
                  <SubmitButton variant="secondary">라벨 붙였음</SubmitButton>
                </AssistForm>
              )}
            </div>
          )}
          {manage && live && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">정보 고치기</summary>
              <AssistForm id={`fx-edit-${id}`} action={fixtureAction} className="mt-3 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="update" />
                <FixtureFields f={f} users={active} suppliers={sups} assetMin={p["asset.register_min"]} />
                <div className="md:col-span-2">
                  <SubmitButton>저장</SubmitButton>
                </div>
              </AssistForm>
            </details>
          )}
        </Card>

        {live && (manage || mine) && (
          <Card title="위치·사용자 바꾸기" help={{ kind: "panel", id: "fx.move" }}>
            <AssistForm id={`fx-move-${id}`} action={fixtureAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="move" />
              <TextField help="fx.location" name="location" defaultValue={f.location ?? ""} />
              <SelectField help="fx.holderId" name="holderId" defaultValue={f.holderId ?? ""} placeholder="공용(사용자 없음)" options={active.map((u) => ({ value: u.id, label: u.name }))} />
              <div className="md:col-span-2">
                <SubmitButton variant="secondary">바꾸기</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}

        {live && (manage || mine) && (
          <Card title={manage ? "실물 확인·분실·파손" : "분실·파손 신고"} help={{ kind: "panel", id: "fx.check" }} actions={checkedThisYear && <Badge tone="ok">올해 확인함</Badge>}>
            <AssistForm id={`fx-check-${id}`} action={fixtureAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="check" />
              <RadioRow help="fx.checkResult" name="result" required options={[
                ...(manage ? [{ value: "ok", label: CHECK_RESULTS.ok, tone: "ok" as const }] : []),
                { value: "lost", label: CHECK_RESULTS.lost, tone: "danger" as const },
                { value: "broken", label: CHECK_RESULTS.broken, tone: "warn" as const },
                ...(manage && (status === "lost" || status === "broken") ? [{ value: "found", label: "되찾음·수리함", tone: "ok" as const }] : []),
              ]} />
              <TextAreaField help="fx.checkNote" name="checkNote" rows={2} />
              <SubmitButton>기록</SubmitButton>
            </AssistForm>
          </Card>
        )}

        {live && manage && (
          <Card title="처분" help={{ kind: "panel", id: "fx.dispose" }}>
            {f.asset && !user.roles.includes("owner") ? (
              <p className="text-sm text-[var(--muted)]">자산 비품은 대표가 처분합니다.</p>
            ) : (
              <AssistForm id={`fx-dispose-${id}`} action={fixtureAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="dispose" />
                <RadioRow help="fx.disposeMethod" name="method" required options={Object.entries(DISPOSE_METHODS).map(([value, label]) => ({ value, label }))} />
                <TextAreaField help="fx.disposeNote" name="disposeNote" required rows={2} />
                {f.category === "it" && (
                  <RadioRow help="fx.dataWiped" name="dataWiped" required options={[
                    { value: "1", label: "자료 완전 삭제함", tone: "ok" },
                    { value: "0", label: "아직 안 함", tone: "danger" },
                  ]} />
                )}
                <SubmitButton variant="danger">처분</SubmitButton>
              </AssistForm>
            )}
          </Card>
        )}

        <Card title="이력" help={{ kind: "panel", id: "fx.events" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {events.map(({ e, by }) => (
              <li key={e.id} className="flex flex-wrap gap-2 py-1.5">
                <span className="text-xs text-[var(--muted)]">{fmtTime(e.at)}</span>
                <Badge tone={e.kind === "lost" || e.kind === "broken" ? "danger" : e.kind === "dispose" ? "neutral" : "accent"}>{FX_EVENT[e.kind as keyof typeof FX_EVENT] ?? e.kind}</Badge>
                {e.detail && <span>{e.detail}</span>}
                <span className="text-xs text-[var(--muted)]">{by ?? ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
