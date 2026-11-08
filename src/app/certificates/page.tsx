import Link from "next/link";
import { getDb } from "@/db/runtime";
import { CERT_PURPOSES, listCertificates } from "@/modules/staff/attendance";
import { AssistForm } from "../_assist";
import { NumberField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { requireUser } from "../_lib/session";
import { Card, Empty, ErrorBox, Notice, PageTitle, StatusBadge } from "../_ui";
import { requestCertificateAction } from "../attendance/actions";

/** 재직증명서 발급 신청 → 대표 승인 → 직인 찍힌 증명서 인쇄 */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await listCertificates(db, user);
  const mine = rows.filter((r) => r.doc.drafterId === user.id);
  const last = mine[0]?.doc.data as { purpose?: string; submitTo?: string } | undefined;
  return (
    <>
      <PageTitle help="certificates" sub="신청하면 대표가 승인하고, 승인되면 직인이 찍힌 재직증명서를 인쇄합니다. 이름·입사일·종사 업무는 근로자 명부에서 불러옵니다.">
        재직증명서
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="발급 신청" help={{ kind: "panel", id: "cert.new" }}>
          <AssistForm id="cert-new" action={requestCertificateAction} className="space-y-3">
            <TextField help="cert.purpose" name="purpose" required defaultValue={last?.purpose ?? ""} suggestions={CERT_PURPOSES.map((v) => ({ value: v }))} from={last?.purpose ? "지난 신청에서 불러옴" : undefined} />
            <TextField help="cert.submitTo" name="submitTo" defaultValue={last?.submitTo ?? ""} />
            <NumberField help="cert.copies" name="copies" unit="부" min={1} max={5} defaultValue={1} />
            <SubmitButton>신청(상신)</SubmitButton>
          </AssistForm>
        </Card>
        <Card title="신청 내역" help={{ kind: "panel", id: "cert.list" }}>
          {rows.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {rows.map((r) => {
                const ok = (r.doc.status === "confirmed" || r.doc.status === "checked") && !!r.doc.confirmedAt;
                return (
                  <li key={r.doc.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/approvals/${r.doc.id}`} className="font-medium text-[var(--accent)]">
                      {r.doc.docNo}
                    </Link>
                    <span className="min-w-0 flex-1">
                      {r.name} · {(r.doc.data as { purpose?: string }).purpose}
                    </span>
                    <StatusBadge status={r.doc.status} />
                    {ok && (
                      <Link href={`/certificates/${r.doc.id}/print`} className="font-semibold text-[var(--accent)]">
                        인쇄
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>신청한 재직증명서가 없습니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
