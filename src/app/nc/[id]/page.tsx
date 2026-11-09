import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { getNc } from "@/modules/quality/nc";
import { NC_SOURCES, NC_STATUS, NC_TONE, ROOT_CAUSES, type NcStatus } from "@/modules/quality/rules";
import { seoulDate } from "@/modules/platform/time";
import { addDays } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { ncAction, removeNcPhotoAction, uploadNcPhotoAction } from "../actions";

const STEPS: NcStatus[] = ["open", "planned", "done", "closed"];

function refHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "repair_order") return `/repairs/${id}`;
  if (type === "equipment") return `/equipment/${id}`;
  if (type === "equipment_failure") return `/equipment/failures/${id}`;
  if (type === "five_s_zone") return `/five-s/${id.slice(0, 1)}`;
  if (type === "complaint") return `/complaints/${id}`;
  if (type === "purchase_order") return `/purchases/${id}`;
  if (type === "stock_count") return "/stock/count";
  return null;
}

/** 부적합·시정 조치 보고서(F-Q-10) */
export default async function NcPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getNc(db, id).catch(() => null);
  if (!r) notFound();
  const { n, names } = r;
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const handler = can(user, "nc.handle");
  const isAssignee = n.assigneeId === user.id;
  const closed = n.status === "closed";
  const today = seoulDate();
  const users = handler ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name) : [];
  const href = refHref(n.refType, n.refId);
  const effectOk = n.status === "done" && n.effectOn && n.recurred === false;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="nc.detail"
        sub={`${NC_SOURCES[n.source as keyof typeof NC_SOURCES]} · 발생 ${fmtTime(n.occurredAt)} · 발견 ${nm(n.foundBy)}`}
        actions={
          <span className="flex gap-3">
            <Link href={`/tasks/new?${new URLSearchParams({ refType: "nonconformance", refId: n.id, refLabel: `${n.docNo} ${n.content.slice(0, 20)}` }).toString()}`} className="text-sm text-[var(--accent)]">
              업무지시
            </Link>
            <Link href="/nc" className="text-sm text-[var(--accent)]">
              ← 부적합 목록
            </Link>
          </span>
        }
      >
        {n.docNo} <Badge tone={NC_TONE[n.status as NcStatus]}>{NC_STATUS[n.status as NcStatus]}</Badge> {n.major && <Badge tone="danger">중대</Badge>}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <ol className="mb-4 flex flex-wrap gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${STEPS.indexOf(n.status as NcStatus) >= i ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
            {i + 1}. {["발행", "원인 분석·시정 계획", "조치", "효과 확인·종결"][i]}
          </li>
        ))}
      </ol>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="발생 내용" help={{ kind: "panel", id: "nc.issue" }}>
          <dl className="text-sm">
            {row("관련 건", href ? <Link href={href} className="text-[var(--accent)]">{n.refLabel}</Link> : n.refLabel)}
            {row("내용", n.content)}
            {row("즉시 조치", n.immediate)}
          </dl>
          <div className="mt-2">
            <PhotoStrip fields={{ id, kind: "issue" }} upload={uploadNcPhotoAction} remove={removeNcPhotoAction} photos={n.photos} editable={!closed && (handler || isAssignee || n.foundBy === user.id)} label="발생" />
          </div>
        </Card>

        <Card title="원인 분석·시정 조치" help={{ kind: "panel", id: "nc.plan" }}>
          {handler && (n.status === "open" || n.status === "planned") ? (
            <AssistForm id={`nc-plan-${id}`} action={ncAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="plan" />
              <TextAreaField help="nc.immediate" name="immediate" rows={2} defaultValue={n.immediate ?? ""} />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <TextField key={i} help="nc.why" label={`왜 ${i}`} name={`why${i}`} required={i <= 2} defaultValue={n.whys[i - 1] ?? ""} />
                ))}
              </div>
              <RadioRow help="nc.rootCause" name="rootCause" required defaultValue={n.rootCause ?? undefined} options={Object.entries(ROOT_CAUSES).map(([value, label]) => ({ value, label }))} />
              <TextAreaField help="nc.corrective" name="corrective" required rows={3} defaultValue={n.corrective ?? ""} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField help="nc.assignee" name="assigneeId" required defaultValue={n.assigneeId ?? ""} placeholder="고르세요" options={users.map((u) => ({ value: u.id, label: u.name }))} />
                <DateField help="nc.dueOn" name="dueOn" required min={today} defaultValue={n.dueOn ?? addDays(today, 7)} from={n.dueOn && n.status === "open" ? "출처 기준 기한" : undefined} quick={["week", "nextMonth"]} />
                <RadioRow help="nc.stdRevision" name="stdRevision" required defaultValue={n.stdRevision ? "1" : "0"} options={[
                  { value: "0", label: "아니오" },
                  { value: "1", label: "예" },
                ]} />
                <TextField help="nc.revisionRef" name="revisionRef" defaultValue={n.revisionRef ?? ""} />
                <RadioRow help="nc.major" name="major" required defaultValue={n.major ? "1" : "0"} options={[
                  { value: "0", label: "일반" },
                  { value: "1", label: "중대(대표 승인)", tone: "danger" },
                ]} />
              </div>
              {n.stdRevision === false && (
                <p className="text-xs text-[var(--muted)]">
                  표준·양식을 고쳐야 하면{" "}
                  <Link href="/approvals/new" className="text-[var(--accent)]">
                    문서 개정 요청
                  </Link>
                  을 올리고 번호를 적습니다.
                </p>
              )}
              <SubmitButton>{n.status === "open" ? "시정 조치 정하기" : "고쳐 저장"}</SubmitButton>
            </AssistForm>
          ) : n.plannedAt ? (
            <dl className="text-sm">
              {row("원인 분석", n.whys.map((w, i) => `왜${i + 1} ${w}`).join(" → "))}
              {row("근본 원인", n.rootCause ? ROOT_CAUSES[n.rootCause as keyof typeof ROOT_CAUSES] : "")}
              {row("시정 조치", n.corrective)}
              {row("담당·기한", `${nm(n.assigneeId)} · ${n.dueOn}`)}
              {row("표준 개정", n.stdRevision ? `예(${n.revisionRef})` : "아니오")}
              {row("정한 사람", `${nm(n.plannedBy)} · ${fmtTime(n.plannedAt)}`)}
            </dl>
          ) : (
            <p className="text-sm text-[var(--muted)]">품질 담당·공장장이 원인 분석과 시정 조치를 정합니다.</p>
          )}
        </Card>

        <Card title="조치" help={{ kind: "panel", id: "nc.action" }}>
          {n.status === "planned" && (isAssignee || handler) ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs text-[var(--muted)]">개선 후 사진{n.source === "five_s" ? "(5S 미달은 필수)" : ""}</p>
                <PhotoStrip fields={{ id, kind: "action" }} upload={uploadNcPhotoAction} remove={removeNcPhotoAction} photos={n.actionPhotos} editable label="개선 후" />
              </div>
              <AssistForm id={`nc-action-${id}`} action={ncAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="action" />
                <TextAreaField help="nc.actionDone" name="actionDone" required rows={3} defaultValue={n.actionDone ?? n.corrective ?? ""} from={!n.actionDone && n.corrective ? "시정 조치" : undefined} />
                <SubmitButton>조치 끝</SubmitButton>
              </AssistForm>
            </div>
          ) : n.actionAt || n.actionDone ? (
            <>
              <dl className="text-sm">
                {row("한 조치", n.actionDone)}
                {row("끝낸 때", n.actionAt ? fmtTime(n.actionAt) : "")}
              </dl>
              <PhotoStrip fields={{ id, kind: "action" }} upload={uploadNcPhotoAction} remove={removeNcPhotoAction} photos={n.actionPhotos} editable={false} label="개선 후" />
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">시정 조치를 정하면 조치 담당이 여기에 한 일을 적습니다.</p>
          )}
        </Card>

        <Card title="효과 확인·종결" help={{ kind: "panel", id: "nc.effect" }}>
          {n.effectOn && (
            <dl className="mb-3 text-sm">
              {row("확인", `${n.effectOn} · ${nm(n.effectBy)} · ${n.recurred ? "재발" : "재발 없음"}`)}
              {row("확인 내용", n.effectNote)}
            </dl>
          )}
          {handler && n.status === "done" && !effectOk && (
            <AssistForm id={`nc-verify-${id}`} action={ncAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="verify" />
              <DateField help="nc.effectOn" name="effectOn" required defaultValue={today} quick={["today"]} />
              <RadioRow help="nc.recurred" name="recurred" required options={[
                { value: "0", label: "재발 없음", tone: "ok" },
                { value: "1", label: "재발(다시 조치)", tone: "danger" },
              ]} />
              <TextAreaField help="nc.effectNote" name="effectNote" required rows={2} />
              <SubmitButton>효과 확인</SubmitButton>
            </AssistForm>
          )}
          {handler && effectOk && (
            <form action={ncAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="close" />
              {n.major && !can(user, "nc.approve") ? <p className="text-sm">중대 부적합입니다. 대표가 종결합니다.</p> : <SubmitButton>종결</SubmitButton>}
            </form>
          )}
          {closed && (
            <p className="text-sm">
              <Badge tone="ok">종결</Badge> {nm(n.closedBy)} · {n.closedAt && fmtTime(n.closedAt)}
            </p>
          )}
          {!handler && !closed && !n.effectOn && <p className="text-sm text-[var(--muted)]">조치가 끝나면 품질 담당·공장장이 효과를 확인하고 종결합니다.</p>}
        </Card>
      </div>
    </>
  );
}
