import Link from "next/link";
import { getDb } from "@/db/runtime";
import { confirmedRevisionRequests, getDoc } from "@/modules/approval/service";
import { POLICY_HELP } from "@/modules/help/glossary";
import { DEFAULT_POLICY, isPolicyKey, policyHistory, policyOverview, type PolicyKey } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { changePolicyAction } from "../actions";
import { PolicyTable } from "./policy-table";

type Def = { value: number; unit: string; label: string; clause: string; min?: number; max?: number };

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ key?: string; from?: string; error?: string; notice?: string }> }) {
  const { key, from, error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await policyOverview(db);
  const owner = user.roles.includes("owner");
  const sel: PolicyKey | null = key && isPolicyKey(key) ? key : null;
  const history = sel ? await policyHistory(db, sel) : [];
  const requests = sel ? await confirmedRevisionRequests(db) : [];
  const applied = new Set(history.map((h) => h.revisionRequestNo).filter(Boolean));
  // 이 정책값을 대상으로 확정됐고 아직 반영하지 않은 요청서: 고르면 값·근거·사유가 채워진다
  const pending = requests.filter((d) => (d.data as Record<string, unknown>).policyKey === sel && !applied.has(d.docNo));
  let src: { docNo: string; value?: number; reason: string } | null = null;
  if (sel && from) {
    try {
      const d = await getDoc(db, from);
      const x = d.data as Record<string, unknown>;
      if (requests.some((r) => r.id === d.id)) src = { docNo: d.docNo, value: typeof x.proposedValue === "number" ? x.proposedValue : undefined, reason: `${d.docNo} 확정에 따름: ${d.title}` };
    } catch {
      /* 없는 문서 */
    }
  }
  const def: Def | null = sel ? DEFAULT_POLICY[sel] : null;
  const cur = sel ? rows.find((r) => r.key === sel)! : null;
  return (
    <>
      <PageTitle help="settings.policies" sub="사내 표준서 부록 D. 처음 값은 표준서의 제안값이며, 바꾸면 시행일부터 적용됩니다.">
        정책값
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {sel && def && cur && (
        <div className="my-4">
          <Card title={`${def.label}`} actions={<Link href="/settings/policies" className="text-sm text-[var(--accent)]">닫기</Link>}>
            <p className="mb-1 text-sm">{POLICY_HELP[sel]}</p>
            <p className="mb-3 text-xs text-[var(--muted)]">
              지금 {cur.value.toLocaleString("ko-KR")} {def.unit} · 표준서 제안 {def.value.toLocaleString("ko-KR")} · 범위 {def.min ?? 0}~{def.max ?? "제한 없음"} · 근거 부록 D({def.clause})
            </p>
            {owner ? (
              <>
                {pending.length > 0 && !src && (
                  <div className="mb-3 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3 text-sm">
                    <p className="mb-2 font-medium">확정된 개정 요청서가 있습니다. 고르면 값·근거 번호·사유가 채워집니다.</p>
                    <ul className="space-y-1">
                      {pending.map((d) => (
                        <li key={d.id}>
                          <Link className="text-[var(--accent)]" href={`/settings/policies?key=${sel}&from=${d.id}`}>
                            {d.docNo} {d.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!src && pending.length === 0 && (
                  <p className="mb-3 text-xs text-[var(--muted)]">
                    근거가 될 요청서가 아직 없습니다.{" "}
                    <Link className="text-[var(--accent)]" href={`/approvals/new?policy=${sel}`}>
                      이 값으로 개정 요청서 쓰기
                    </Link>
                    (대상·현재 값이 채워집니다). 급하면 근거 없이 바꿀 수도 있습니다.
                  </p>
                )}
                <AssistForm id={`policy-${sel}`} action={changePolicyAction} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="key" value={sel} />
                  <NumberField help="policy.value" name="value" required unit={def.unit} min={def.min ?? 0} max={def.max} current={cur.value} suggested={def.value} defaultValue={src?.value} from={src?.value != null ? src.docNo : undefined} />
                  <DateField help="policy.effectiveFrom" name="effectiveFrom" defaultValue={seoulDate()} min={seoulDate()} required />
                  <TextField
                    help="policy.revisionRequestNo"
                    name="revisionRequestNo"
                    defaultValue={src?.docNo}
                    from={src?.docNo}
                    suggestions={requests.map((d) => ({ value: d.docNo, label: d.title }))}
                  />
                  <TextField help="policy.reason" name="reason" required defaultValue={src?.reason} from={src?.docNo} />
                  <div className="sm:col-span-2">
                    <SubmitButton>바꾸기</SubmitButton>
                  </div>
                </AssistForm>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                정책값은 대표만 바꿀 수 있습니다. 바꾸자고 제안하려면{" "}
                <Link className={buttonClass("secondary")} href={`/approvals/new?policy=${sel}`}>
                  개정 요청서 쓰기
                </Link>
              </p>
            )}
            <h3 className="mt-4 mb-1 text-sm font-semibold">변경 이력</h3>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                바꾼 적 없음(제안값 {def.value.toLocaleString("ko-KR")} {def.unit})
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {history.map((h, i) => (
                  <li key={i}>
                    {h.effectiveFrom} 시행 → <b>{Number(h.value).toLocaleString("ko-KR")}</b> · {h.changedBy} · {h.reason}
                    {h.revisionRequestNo && ` · ${h.revisionRequestNo}`} <span className="text-xs text-[var(--muted)]">({fmtTime(h.createdAt)})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <PolicyTable
        owner={owner}
        rows={rows.map((r) => ({
          key: r.key,
          label: r.label,
          unit: r.unit,
          clause: r.clause,
          value: r.value,
          defaultValue: r.defaultValue,
          scheduled: r.scheduled.map((p) => ({ effectiveFrom: p.effectiveFrom, value: Number(p.value) })),
          help: POLICY_HELP[r.key as PolicyKey],
        }))}
      />
    </>
  );
}
