import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { getAssessment } from "@/modules/safety/hazard";
import {
  HA_KIND,
  HA_MEASURE_SCORE,
  HA_STATUS,
  hazardTone,
  MEASURE_TYPES,
  type HaKind,
  type MeasureType,
} from "@/modules/safety/rules";
import { AssistForm } from "../../_assist";
import { RadioRow, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { hazardAction } from "../actions";
import { HazardRowFields } from "../_row";

const levels = [
  { value: "1", label: "1", tone: "ok" as const },
  { value: "2", label: "2", tone: "warn" as const },
  { value: "3", label: "3", tone: "danger" as const },
];

/** 위험성평가표 한 건(F-09-01) */
export default async function HazardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getAssessment(db, id).catch(() => null);
  if (!r) notFound();
  const { x, rows, names } = r;
  const manage = can(user, "safety.manage");
  if (x.status === "draft" && !manage) notFound();
  const draft = x.status === "draft";
  const users = manage ? (await listUsers(db)).filter((u) => u.active) : [];
  const need = rows.filter(
    (r) => r.score >= HA_MEASURE_SCORE && !r.measure,
  ).length;
  const hidden = (intent: string, rowId?: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      {rowId && <input type="hidden" name="rowId" value={rowId} />}
    </>
  );
  return (
    <>
      <PageTitle
        help="hazards.detail"
        sub={`${HA_KIND[x.kind as HaKind]} 평가 · 참여 ${x.participants.map((u) => names.get(u) ?? "-").join(", ")}${x.doneAt ? ` · ${fmtTime(x.doneAt)} ${x.doneBy ? names.get(x.doneBy) : ""} 확정` : ""}${x.reason ? ` · ${x.reason}` : ""}`}
        actions={
          <Link href="/hazards" className="text-sm text-[var(--accent)]">
            ← 위험성평가
          </Link>
        }
      >
        {x.docNo}{" "}
        <Badge tone={draft ? "warn" : "ok"}>
          {HA_STATUS[x.status as keyof typeof HA_STATUS]}
        </Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {x.incidentId && (
        <p className="mb-3 text-sm">
          <Link
            href={`/incidents/${x.incidentId}`}
            className="text-[var(--accent)]"
          >
            관련 사고 보고서 보기
          </Link>
        </p>
      )}

      <Card
        title={`평가표 ${rows.length}줄`}
        help={{ kind: "panel", id: "haz.table" }}
      >
        <ul className="divide-y divide-[var(--line)]">
          {rows.map((row) => {
            const res =
              row.residualL && row.residualS
                ? row.residualL * row.residualS
                : null;
            const mayMeasure =
              !draft &&
              row.measure &&
              !row.measureDoneAt &&
              (manage || row.ownerId === user.id);
            return (
              <li key={row.id} id={`row-${row.id}`} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={hazardTone(row.score)}>
                    {row.likelihood}×{row.severity}={row.score}
                  </Badge>
                  <span className="font-medium">{row.process}</span>
                  <span>{row.hazard}</span>
                  {row.score >= HA_MEASURE_SCORE && !row.measure && (
                    <Badge tone="danger">대책 필요</Badge>
                  )}
                  {res != null && (
                    <Badge tone={hazardTone(res)}>잔류 {res}점</Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  현재 관리: {row.current ?? "-"}
                </p>
                {row.measure && (
                  <p className="text-xs">
                    대책({MEASURE_TYPES[row.measureType as MeasureType] ?? "-"}
                    ): {row.measure} ·{" "}
                    {row.ownerId ? names.get(row.ownerId) : "-"} ·{" "}
                    {row.due ?? "-"}
                    {row.measureDoneAt &&
                      ` · ${fmtTime(row.measureDoneAt)} 끝: ${row.measureResult}`}
                  </p>
                )}
                {draft && manage && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--accent)]">
                      고치기
                    </summary>
                    <AssistForm
                      id={`haz-edit-${row.id}`}
                      action={hazardAction}
                      className="mt-2 grid gap-3 md:grid-cols-2"
                    >
                      {hidden("edit", row.id)}
                      <HazardRowFields r={row} users={users} />
                      <div className="flex gap-3 md:col-span-2">
                        <SubmitButton>저장</SubmitButton>
                      </div>
                    </AssistForm>
                    <AssistForm
                      id={`haz-rm-${row.id}`}
                      action={hazardAction}
                      guard={false}
                      className="mt-2"
                    >
                      {hidden("remove", row.id)}
                      <button className="text-xs text-[var(--danger)]">
                        이 줄 지우기
                      </button>
                    </AssistForm>
                  </details>
                )}
                {mayMeasure && (
                  <AssistForm
                    id={`haz-m-${row.id}`}
                    action={hazardAction}
                    className="mt-2 grid gap-3 rounded-md bg-[var(--accent-soft)] p-3 md:grid-cols-3"
                  >
                    {hidden("measure", row.id)}
                    <div className="md:col-span-3">
                      <TextField help="haz.result" name="result" required />
                    </div>
                    <RadioRow
                      help="haz.residualL"
                      name="residualL"
                      required
                      from="평가 점수"
                      defaultValue={String(row.likelihood)}
                      options={levels}
                    />
                    <RadioRow
                      help="haz.residualS"
                      name="residualS"
                      required
                      from="평가 점수"
                      defaultValue={String(row.severity)}
                      options={levels}
                    />
                    <div className="flex items-end">
                      <SubmitButton>대책 끝</SubmitButton>
                    </div>
                  </AssistForm>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {draft && manage && (
        <>
          <Card title="줄 더하기" help={{ kind: "panel", id: "haz.add" }}>
            <AssistForm
              id={`haz-add-${id}`}
              action={hazardAction}
              className="grid gap-3 md:grid-cols-2"
            >
              {hidden("add")}
              <HazardRowFields users={users} />
              <div className="md:col-span-2">
                <SubmitButton>더하기</SubmitButton>
              </div>
            </AssistForm>
          </Card>
          <Card title="확정·공유" help={{ kind: "panel", id: "haz.finish" }}>
            {need ? (
              <p className="text-sm text-[var(--danger)]">
                {HA_MEASURE_SCORE}점 이상인데 대책이 없는 줄이 {need}개
                있습니다. 대책을 정해야 확정할 수 있습니다.
              </p>
            ) : (
              <AssistForm
                id={`haz-finish-${id}`}
                action={hazardAction}
                guard={false}
                className="flex flex-wrap items-center gap-3"
              >
                {hidden("finish")}
                <p className="text-sm">
                  확정하면 고칠 수 없고, 참여자와 대책 담당에게 결과가
                  공유됩니다.
                </p>
                <SubmitButton>확정</SubmitButton>
              </AssistForm>
            )}
          </Card>
        </>
      )}
    </>
  );
}
