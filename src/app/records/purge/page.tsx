import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { FIVE_S_RETENTION, retentionSheet } from "@/modules/quality/retention";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { requestPurgeAction } from "./actions";

/** 보존·파기(STD-Q 8절): 양식별 보존 기간이 지난 기록을 세고, 지울 수 있는 기록은 대표 승인을 받아 지운다 */
export default async function PurgePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const title = (
    <PageTitle
      help="records.purge"
      std="STD-Q 8절 · 부록 A"
      sub="양식집의 보존 기간이 지난 기록을 대장마다 셉니다. 지울 수 있는 기록은 파기 결재를 올려 대표가 승인하면 지워집니다."
      actions={
        <Link href="/records" className={buttonClass("secondary")}>
          기록 보관함
        </Link>
      }
    >
      보존·파기
    </PageTitle>
  );
  if (!can(user, "records.purge"))
    return (
      <>
        {title}
        <ErrorBox message="보존·파기는 대표·품질 담당이 봅니다(권한표 '보존 기간 지난 기록 보기·파기 결재')" />
      </>
    );
  const s = await retentionSheet(await getDb(), user);
  const n = s.corr + s.fiveS;
  return (
    <>
      {title}
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="파기 결재" help={{ kind: "panel", id: "records.purge" }}>
        <ul className="mb-3 space-y-1 text-sm">
          <li>
            문서 수발신 대장(F-Q-11, 5년, 처리 끝·발송·버림): <b>{s.corr}건</b>
          </li>
          <li>
            {FIVE_S_RETENTION.name}({FIVE_S_RETENTION.form}, {FIVE_S_RETENTION.years}년, {s.fiveSCutoff} 앞): <b>{s.fiveS}건</b>
          </li>
        </ul>
        {s.pending ? (
          <p className="text-sm">
            결재 중인 파기 결재가 있습니다:{" "}
            <Link href={`/approvals/${s.pending.id}`} className="text-[var(--accent)] underline">
              {s.pending.docNo}
            </Link>
          </p>
        ) : n === 0 ? (
          <p className="text-sm text-[var(--muted)]">지금 지울 수 있는 기록이 없습니다.</p>
        ) : (
          <AssistForm id="records-purge" action={requestPurgeAction} className="grid gap-3 md:grid-cols-2" guard={false} draft={false}>
            <TextField help="records.purgeReason" name="reason" defaultValue="" suggestions={[{ value: "보존 기간이 지남(부록 A)" }]} />
            <div className="md:col-span-2">
              <SubmitButton>{user.roles.includes("owner") ? `승인하고 ${n}건 지우기` : `파기 결재 올리기(${n}건)`}</SubmitButton>
            </div>
          </AssistForm>
        )}
      </Card>
      <Card title="대장별 보존 기간" help={{ kind: "panel", id: "records.retention" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--muted)]">
                <th className="py-1 pr-2">양식</th>
                <th className="py-1 pr-2">보존</th>
                <th className="py-1 pr-2">세는 날짜</th>
                <th className="py-1 pr-2">기준일 앞</th>
                <th className="py-1 pr-2 text-right">지난 건수</th>
                <th className="py-1">처리</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.list} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">
                    {r.form && <span className="mr-1 text-xs text-[var(--muted)]">{r.form}</span>}
                    {r.name}
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.years}년<span className="block text-xs text-[var(--muted)]">{r.basis}</span>
                  </td>
                  <td className="py-1.5 pr-2">{r.dateLabel}</td>
                  <td className="py-1.5 pr-2">{r.cutoff}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {r.count === null ? (
                      <span className="text-xs text-[var(--muted)]">볼 권한 없음</span>
                    ) : r.count > 0 && r.href ? (
                      <Link href={r.href} className="font-medium text-[var(--accent)] underline">
                        {r.count.toLocaleString("ko-KR")}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="py-1.5">{r.purge ? <Badge tone="accent">파기 결재로 지움</Badge> : <Badge>세어 보기만</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
