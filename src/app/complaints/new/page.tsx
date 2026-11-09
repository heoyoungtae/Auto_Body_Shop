import Link from "next/link";
import { getDb } from "@/db/runtime";
import { recentDelivered, roContext } from "@/modules/cs/service";
import { CATEGORIES, CHANNELS } from "@/modules/cs/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, PageTitle } from "../../_ui";
import { receiveAction } from "../actions";

/** 불만·보증 수리 요청 접수(F-06-02 5.1). 수리 건 화면에서 열면 ?ro= 로 고객·차량·명세서가 채워진다 */
export default async function NewComplaintPage({ searchParams }: { searchParams: Promise<{ ro?: string; error?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const [ctx, ros] = await Promise.all([q.ro ? roContext(db, q.ro, today) : null, recentDelivered(db)]);
  const opts = ros.map((r) => ({ value: r.roId, label: `${r.plateNo} ${r.customerName} · ${r.roNo} · 출고 ${r.deliveredAt ? seoulDate(r.deliveredAt) : "-"}` }));
  if (ctx && !opts.some((o) => o.value === ctx.id)) opts.unshift({ value: ctx.id, label: `${ctx.plateNo} ${ctx.customerName} · ${ctx.docNo}` });
  return (
    <>
      <PageTitle
        help="complaints.new"
        sub="불만을 들은 사람이 바로 등록합니다. 개인이 판단해 덮지 않습니다. 접수하면 담당 상담원에게 알림이 갑니다(STD-06 5.1)."
        actions={
          <Link href="/complaints" className="text-sm text-[var(--accent)]">
            ← 불만·보증 목록
          </Link>
        }
      >
        불만·보증 수리 접수
      </PageTitle>
      <ErrorBox message={q.error} />
      {ctx && (
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
          <b>{ctx.plateNo}</b> {ctx.model} · {ctx.customerName} · {ctx.docNo}
          {ctx.statement && ` · 명세서 ${ctx.statement.docNo} · 출고 ${ctx.statement.deliveredOn ?? "-"}`}
          <div className="mt-1">
            {ctx.warranty.all.length ? (
              ctx.warranty.all.map((w) => (
                <Badge key={w.kind} tone={w.until >= today ? "ok" : "neutral"}>
                  {w.kind} {w.until}까지{w.until >= today ? "" : "(지남)"}
                </Badge>
              ))
            ) : (
              <span className="text-[var(--muted)]">명세서에 적힌 보증이 없습니다</span>
            )}
          </div>
        </div>
      )}
      <Card title="불만 내용" help={{ kind: "panel", id: "complaints.new" }}>
        <AssistForm id={`cp-new-${q.ro ?? "x"}`} action={receiveAction} className="grid gap-3 md:grid-cols-2">
          <RadioRow help="cp.channel" name="channel" required options={Object.entries(CHANNELS).filter(([k]) => k !== "survey").map(([value, label]) => ({ value, label }))} />
          <RadioRow help="cp.category" name="category" required options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
          <SelectField help="cp.ro" name="repairOrderId" defaultValue={ctx?.id ?? ""} from={ctx ? "수리 건" : undefined} placeholder="고객 수리 건이 아님(주민·거래처 등)" options={opts} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField help="cp.who" name="who" />
            <TextField help="cp.phone" name="phone" inputMode="tel" />
          </div>
          <div className="md:col-span-2">
            <TextAreaField help="cp.content" name="content" required rows={3} />
          </div>
          <TextAreaField help="cp.wish" name="wish" rows={2} />
          <RadioRow help="cp.urgent" name="urgent" required defaultValue="0" options={[
            { value: "0", label: "보통" },
            { value: "1", label: "긴급(안전 관련)", tone: "danger" },
          ]} />
          <div className="md:col-span-2">
            <SubmitButton>접수</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
