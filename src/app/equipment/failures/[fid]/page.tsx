import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { FAIL_CAUSES, FAIL_STATUS, PREVENTIONS } from "@/modules/equipment/rules";
import { getFailure } from "@/modules/equipment/service";
import { AssistForm } from "../../../_assist";
import { CheckGroup, NumberField, RadioRow, TextAreaField, TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../../_ui";
import { failureAction } from "../../actions";

/** 고장 기록(F-08-04 고장 기록란): 조치·정지 시간·원인·재발 방지, 공장장 확인으로 사용 재개 */
export default async function FailurePage({ params, searchParams }: { params: Promise<{ fid: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { fid } = await params;
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getFailure(db, fid).catch(() => null);
  if (!r) notFound();
  const { f, e, names } = r;
  const open = f.status === "open";
  const write = open && can(user, "equip.check");
  const boss = can(user, "equip.manage");
  return (
    <>
      <PageTitle
        help="equip.failure"
        sub={`${e.no} ${e.name} · 발생 ${fmtTime(f.occurredAt)} · 발견 ${names.get(f.foundBy) ?? "-"}`}
        actions={
          <Link href={`/equipment/${e.id}`} className="text-sm text-[var(--accent)]">
            ← {e.name}
          </Link>
        }
      >
        고장 기록 {f.docNo} <Badge tone={open ? "danger" : "ok"}>{FAIL_STATUS[f.status as keyof typeof FAIL_STATUS]}</Badge>
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="고장 기록란" help={{ kind: "panel", id: "fail.form" }}>
          <p className="mb-3 rounded-md bg-[var(--surface-2)] p-2 text-sm">
            <b>증상</b> {f.symptom}
          </p>
          {write ? (
            <AssistForm id={`failure-${fid}`} action={failureAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="fid" value={fid} />
              <div className="md:col-span-2">
                <TextAreaField help="eqf.action" name="action" rows={3} defaultValue={f.action ?? ""} />
              </div>
              <RadioRow help="eqf.external" name="external" defaultValue={f.external ? "1" : "0"} options={[
                { value: "0", label: "자체" },
                { value: "1", label: "외부(제조사·업체)" },
              ]} />
              <NumberField help="eqf.downMinutes" name="downMinutes" unit="분" min={0} defaultValue={f.downMinutes} />
              <TextField help="eqf.parts" name="parts" defaultValue={f.parts ?? ""} />
              <NumberField help="eqf.cost" name="cost" unit="원" min={0} defaultValue={f.cost} />
              <div className="md:col-span-2">
                <RadioRow help="eqf.cause" name="cause" defaultValue={f.cause ?? undefined} options={Object.entries(FAIL_CAUSES).map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="md:col-span-2">
                <CheckGroup help="eqf.prevention" name="prevention" defaultChecked={f.prevention} options={Object.entries(PREVENTIONS).map(([value, label]) => ({ value, label }))} />
              </div>
              <TextField help="eqf.ncRef" name="ncRef" defaultValue={f.ncRef ?? ""} />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <SubmitButton variant="secondary" name="intent" value="save">
                  저장
                </SubmitButton>
                {boss && (
                  <SubmitButton name="intent" value="close">
                    공장장 확인(사용 재개)
                  </SubmitButton>
                )}
              </div>
            </AssistForm>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <div>
                <dt className="inline text-[var(--muted)]">조치 </dt>
                <dd className="inline">
                  {f.action ?? "-"} ({f.external ? "외부" : "자체"})
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--muted)]">정지 시간 </dt>
                <dd className="inline">{f.downMinutes ?? "-"}분</dd>
              </div>
              <div>
                <dt className="inline text-[var(--muted)]">교체 부품·비용 </dt>
                <dd className="inline">
                  {f.parts ?? "-"} · {f.cost != null ? `${f.cost.toLocaleString("ko-KR")}원` : "-"}
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--muted)]">원인 </dt>
                <dd className="inline">{f.cause ? FAIL_CAUSES[f.cause as keyof typeof FAIL_CAUSES] : "-"}</dd>
              </div>
              <div>
                <dt className="inline text-[var(--muted)]">재발 방지 </dt>
                <dd className="inline">
                  {f.prevention.map((p) => PREVENTIONS[p as keyof typeof PREVENTIONS]).join(", ") || "-"}
                  {f.ncRef && ` (F-Q-10 ${f.ncRef})`}
                </dd>
              </div>
              {f.closedAt && (
                <div>
                  <dt className="inline text-[var(--muted)]">확인 </dt>
                  <dd className="inline">
                    {names.get(f.closedBy ?? "") ?? "-"} · {fmtTime(f.closedAt)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Card>
        <Card title="이렇게 처리합니다" help={{ kind: "panel", id: "fail.flow" }}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>설비는 지금 &apos;사용 금지&apos;입니다. 설비에 사용 금지 표를 붙입니다.</li>
            <li>조치한 사람이 조치·정지 시간·교체 부품을 적습니다.</li>
            <li>공장장이 원인과 재발 방지(예방정비 항목 추가, 운전 기준 개정, 교육)를 정합니다.</li>
            <li>공장장 확인을 누르면 설비를 다시 쓸 수 있습니다.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
