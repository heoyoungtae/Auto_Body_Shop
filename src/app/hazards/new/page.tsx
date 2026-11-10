import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { listAssessments } from "@/modules/safety/hazard";
import { getIncident } from "@/modules/safety/incident";
import { HA_KIND } from "@/modules/safety/rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, RadioRow, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { startAssessmentAction } from "../actions";

/** 위험성평가 시작: 종류·이유·참여 작업자. 지난 확정 평가(없으면 최초 초안)를 불러온다 */
export default async function NewHazardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kind?: string; incident?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const users = (await listUsers(db)).filter((u) => u.active);
  const { list } = await listAssessments(db);
  const last = list.find((x) => x.status === "done");
  const inc = q.incident
    ? await getIncident(db, user, q.incident).catch(() => null)
    : null;
  const kind =
    q.kind && q.kind in HA_KIND ? q.kind : last ? "regular" : "initial";
  const reason = inc
    ? `사고 ${inc.x.docNo}(${inc.x.place}): ${inc.x.description.slice(0, 80)}`
    : "";
  return (
    <>
      <PageTitle
        help="hazards.new"
        sub="평가에는 작업자가 참여해야 합니다. 지난 평가의 줄을 불러오면 바뀐 것만 고치면 됩니다."
        actions={
          <Link href="/hazards" className="text-sm text-[var(--accent)]">
            ← 위험성평가
          </Link>
        }
      >
        위험성평가 시작
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "safety.manage") ? (
        <Card title="평가(F-09-01)" help={{ kind: "panel", id: "haz.start" }}>
          <AssistForm
            id={`haz-new-${kind}`}
            action={startAssessmentAction}
            className="grid gap-3"
          >
            {inc && <input type="hidden" name="incident" value={q.incident} />}
            <RadioRow
              help="haz.kind"
              name="kind"
              required
              defaultValue={kind}
              options={Object.entries(HA_KIND).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <TextAreaField
              help="haz.reason"
              name="reason"
              rows={2}
              defaultValue={reason}
              from={inc ? `사고 보고서 ${inc.x.docNo}` : undefined}
            />
            <CheckGroup
              help="haz.participants"
              name="participants"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
            <RadioRow
              help="haz.copy"
              name="copy"
              required
              defaultValue="1"
              options={[
                {
                  value: "1",
                  label: last
                    ? `지난 평가 ${last.docNo} 줄 불러오기`
                    : "최초 초안 7줄 불러오기",
                  tone: "ok",
                },
                { value: "0", label: "빈 표로 시작" },
              ]}
            />
            <div>
              <SubmitButton>시작</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          위험성평가는 안전환경 담당·대표가 작성합니다.
        </p>
      )}
    </>
  );
}
