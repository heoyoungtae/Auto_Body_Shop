import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { inspectionContext, inspectionsOf } from "@/modules/repair/inspect";
import { itemsFor } from "@/modules/repair/inspect-rules";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { processLabel } from "@/modules/repair/work-rules";
import { AssistForm } from "../../../_assist";
import { CheckGroup, TextAreaField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { requireUser } from "../../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { PhotoStrip } from "../../../photo-strip";
import { inspectAction, removeInspectionPhotoAction, uploadInspectionPhotoAction } from "../../qc-actions";

/** 최종 검사(F-05-01, STD-05 5·6절) */
export default async function InspectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const ctx = await inspectionContext(db, id);
  const rounds = await inspectionsOf(db, id);
  const open = rounds.find((r) => !r.result) ?? null;
  const canInspect = can(user, "inspect.do");
  const worked = ctx.workers.includes(user.id);
  const items = itemsFor(ctx.processes);
  const L = ctx.limits;

  return (
    <div>
      <PageTitle
        help="repairs.inspect"
        sub={
          <>
            F-05-01 최종 검사표 ·{" "}
            <Link href={`/repairs/${id}`} className="text-[var(--accent)]">
              수리 건 {ctx.ro.docNo}
            </Link>{" "}
            ·{" "}
            <Link href={`/work/${ctx.wo.id}`} className="text-[var(--accent)]">
              작업 {ctx.wo.docNo}
            </Link>
          </>
        }
        actions={<Badge tone={ctx.ro.status === "inspecting" ? "warn" : "neutral"}>{RO_STATUS_LABEL[ctx.ro.status]}</Badge>}
      >
        최종 검사
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          {ctx.ro.status === "inspecting" && !open && (
            <Card title="검사 시작" help={{ kind: "panel", id: "qc.start" }}>
              {canInspect ? (
                <AssistForm id={`qs-${id}`} action={inspectAction} className="space-y-3">
                  <input type="hidden" name="roId" value={id} />
                  <input type="hidden" name="intent" value="start" />
                  {worked && <TextAreaField help="qc.independenceNote" name="independenceNote" rows={2} required />}
                  <p className="text-sm text-[var(--muted)]">이 차의 공정: {ctx.processes.map(processLabel).join(" · ")}</p>
                  <SubmitButton>검사 시작</SubmitButton>
                </AssistForm>
              ) : (
                <p className="text-sm text-[var(--muted)]">품질 담당(또는 공장장)이 검사합니다.</p>
              )}
            </Card>
          )}
          {open && (
            <Card title={`${open.round}차 검사 — ${open.inspectorName}`} help={{ kind: "panel", id: "qc.judge" }}>
              {open.inspector === user.id || user.roles.includes("owner") ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-sm font-medium">
                      작업 후 사진 <span className={open.photos.length >= L.photos ? "text-[var(--ok)]" : "text-[var(--warn)]"}>{open.photos.length}/{L.photos}장</span> — 입고 때와 같은 각도로
                    </p>
                    <PhotoStrip fields={{ roId: id, inspectionId: open.id }} upload={uploadInspectionPhotoAction} remove={removeInspectionPhotoAction} photos={open.photos} editable label="작업 후" />
                  </div>
                  <AssistForm id={`qj-${open.id}`} action={inspectAction} className="space-y-4">
                    <input type="hidden" name="roId" value={id} />
                    <input type="hidden" name="inspectionId" value={open.id} />
                    <input type="hidden" name="intent" value="judge" />
                    <CheckGroup help="qc.passed" name="passed" options={items.map((i) => ({ value: i.key, label: `${i.group}: ${i.label} — ${i.pass}` }))} />
                    <div className="grid gap-3 md:grid-cols-2">
                      {items.some((i) => i.key === "gap") && <TextField help="qc.gapMm" name="gapMm" inputMode="decimal" />}
                      {items.some((i) => i.key === "film") && <TextField help="qc.filmUm" name="filmUm" inputMode="numeric" />}
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      기준: 간극 좌우 차 {L.gapMm}mm 이내 · 도막 {L.filmMin}~{L.filmMax}μm · 사진 {L.photos}장 이상(설정 › 정책값). 체크하지 않은 항목이나 기준 밖의 값이 있으면 불합격입니다.
                    </p>
                    <TextAreaField help="qc.failNote" name="failNote" rows={2} />
                    <SubmitButton>판정 저장</SubmitButton>
                  </AssistForm>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {open.inspectorName}이(가) {fmtTime(open.startedAt)}부터 검사 중입니다.
                </p>
              )}
            </Card>
          )}
          {ctx.ro.status === "working" && <p className="text-sm text-[var(--muted)]">작업(재작업 포함)이 끝나면 검사 대기가 됩니다.</p>}
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          <Card title="검사 기록" help={{ kind: "panel", id: "qc.history" }}>
            {rounds.length ? (
              <ul className="space-y-3 text-sm">
                {rounds.map((r) => (
                  <li key={r.id}>
                    <p>
                      {r.round}차 · {r.inspectorName} · {r.result ? <Badge tone={r.result === "pass" ? "ok" : "danger"}>{r.result === "pass" ? "합격" : "불합격"}</Badge> : <Badge tone="warn">검사 중</Badge>} {r.judgedAt && fmtTime(r.judgedAt)}
                    </p>
                    {r.independenceNote && <p className="text-xs text-[var(--warn)]">검사 독립성 예외: {r.independenceNote}</p>}
                    {r.fails.length > 0 && <p className="text-xs text-[var(--danger)]">{r.fails.map((f) => f.why).join(" / ")}</p>}
                    {r.failNote && <p className="text-xs">결함: {r.failNote}</p>}
                    {(r.gap != null || r.filmUm.length > 0) && (
                      <p className="text-xs text-[var(--muted)]">
                        {r.gap != null && `간극 ${r.gap}mm `}
                        {r.filmUm.length > 0 && `도막 ${r.filmUm.join("/")}μm`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 검사 기록이 없습니다.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
