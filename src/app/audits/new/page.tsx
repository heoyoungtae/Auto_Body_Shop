import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { lastAudit, uncovered } from "@/modules/quality/audit";
import { AUDIT_CRITERIA } from "@/modules/quality/risk-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { planAuditAction } from "../actions";
import { AuditFields } from "../_form";

/** 내부심사 계획(F-Q-08 계획란). 올해 아직 범위에 없는 장을 미리 골라 두고, 지난 심사의 기준·심사자를 불러온다 */
export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const users = (await listUsers(db)).filter((u) => u.active);
  const year = Number(seoulDate(new Date()).slice(0, 4));
  const left = await uncovered(db, year);
  const last = await lastAudit(db);
  return (
    <>
      <PageTitle
        help="audits.new"
        sub="심사일·범위(장)·심사자·피심사자를 정합니다. 심사자는 피심사자에 들어갈 수 없습니다. 사내에서 독립성이 어려우면 외부 심사원 이름을 적습니다."
        actions={
          <Link href="/audits" className="text-sm text-[var(--accent)]">
            ← 내부 심사
          </Link>
        }
      >
        내부심사 계획
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "audit.manage") ? (
        <Card
          title="심사 계획(F-Q-08)"
          help={{ kind: "panel", id: "audit.plan" }}
        >
          <AssistForm
            id="audit-new"
            action={planAuditAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <AuditFields
              users={users}
              a={{
                scope: left,
                criteria: last?.criteria ?? AUDIT_CRITERIA,
                auditorId: last?.auditorId ?? null,
              }}
              from={last ? `지난 심사 ${last.docNo}` : undefined}
            />
            <div className="md:col-span-2">
              <SubmitButton>계획 세우기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          심사 계획은 품질 담당·대표가 세웁니다.
        </p>
      )}
    </>
  );
}
