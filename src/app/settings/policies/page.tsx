import { getDb } from "@/db/runtime";
import { DEFAULT_POLICY, isPolicyKey, policyHistory, policyOverview } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Field, fmtTime, Notice, PageTitle } from "../../_ui";
import { changePolicyAction } from "../actions";

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ key?: string; error?: string; notice?: string }> }) {
  const { key, error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await policyOverview(db);
  const owner = user.roles.includes("owner");
  const sel = key && isPolicyKey(key) ? key : null;
  const history = sel ? await policyHistory(db, sel) : [];
  return (
    <>
      <PageTitle sub="사내 표준서 부록 D. 처음 값은 표준서의 제안값이며, 바꾸면 시행일부터 적용됩니다.">정책값</PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {sel && (
        <div className="my-4">
          <Card title={`${DEFAULT_POLICY[sel].label} 바꾸기`}>
            {owner ? (
              <form action={changePolicyAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="key" value={sel} />
                <Field label={`새 값(${DEFAULT_POLICY[sel].unit})`} name="value" inputMode="numeric" required />
                <Field label="시행일" name="effectiveFrom" type="date" defaultValue={seoulDate()} required />
                <Field label="근거 개정요청 번호" name="revisionRequestNo" placeholder="R-2611-0001" hint="문서 개정 요청서(F-Q-05) 확정 번호" />
                <Field label="변경 사유" name="reason" required />
                <div className="sm:col-span-2">
                  <SubmitButton>바꾸기</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="text-sm text-[var(--muted)]">정책값은 대표만 바꿀 수 있습니다.</p>
            )}
            <h3 className="mt-4 mb-1 text-sm font-semibold">변경 이력</h3>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">바꾼 적 없음(제안값 {DEFAULT_POLICY[sel].value}{DEFAULT_POLICY[sel].unit})</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {history.map((h, i) => (
                  <li key={i}>
                    {h.effectiveFrom} 시행 → <b>{String(h.value)}</b> · {h.changedBy} · {h.reason}
                    {h.revisionRequestNo && ` · ${h.revisionRequestNo}`} <span className="text-xs text-[var(--muted)]">({fmtTime(h.createdAt)})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="py-2 pr-2">정책값</th>
              <th className="py-2 pr-2">현재 값</th>
              <th className="py-2 pr-2">근거</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 pr-2">{r.label}</td>
                <td className="py-2 pr-2">
                  <b>{r.value.toLocaleString("ko-KR")}</b> {r.unit} {r.value !== r.defaultValue && <Badge tone="accent">변경됨</Badge>}
                  {r.scheduled.map((p, i) => (
                    <span key={i} className="ml-1 text-xs text-[var(--warn)]">
                      {p.effectiveFrom}부터 {String(p.value)}
                    </span>
                  ))}
                </td>
                <td className="py-2 pr-2 text-xs text-[var(--muted)]">{r.clause}</td>
                <td className="py-2 text-right">
                  <a href={`/settings/policies?key=${encodeURIComponent(r.key)}`} className="text-[var(--accent)]">
                    {owner ? "바꾸기·이력" : "이력"}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
