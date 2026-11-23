import { can } from "@/modules/auth/permissions";
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
import { changePolicyAction, syncMinWageAction } from "../actions";
import { MIN_WAGE_SOURCE } from "@/modules/staff/min-wage";
import { PolicyTable } from "./policy-table";
import { isPolicyGroup, LEGAL_BASIS, lawLink, POLICY_GROUPS, policyGroup, type PolicyGroup } from "@/modules/platform/policy-meta";
import { lastChecks } from "@/modules/platform/policy-check";
import { lawWatchStatus } from "@/modules/money/law-watch";
import { CheckGroup } from "../../_input";
import { policyCandidateAction, policyCheckAction } from "../actions";

type Def = { value: number; unit: string; label: string; clause: string; min?: number; max?: number };

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ key?: string; from?: string; error?: string; notice?: string; g?: string }> }) {
  const { key, from, error, notice, g } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await policyOverview(db);
  const owner = can(user, "settings.edit");
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
  const group: PolicyGroup | null = g && isPolicyGroup(g) ? g : sel ? policyGroup(sel) : null;
  const checks = await lastChecks(db);
  const law = await lawWatchStatus(db);
  const cand = sel ? law.candidates.find((c) => c.key === sel) : undefined;
  const accounting = user.roles.includes("accounting");
  const basis = sel ? LEGAL_BASIS[sel] : undefined;
  const groupHasLegal = group ? rows.some((r) => policyGroup(r.key as PolicyKey) === group && LEGAL_BASIS[r.key as PolicyKey]) : false;
  const tabs = (Object.keys(POLICY_GROUPS) as PolicyGroup[]).map((k) => {
    const rs = rows.filter((r) => policyGroup(r.key as PolicyKey) === k);
    return { k, n: rs.length, changed: rs.filter((r) => r.value !== r.defaultValue).length, scheduled: rs.filter((r) => r.scheduled.length).length, cand: law.candidates.filter((c) => rs.some((r) => r.key === c.key)).length };
  });
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
          <Card title={`${def.label}`} help={{ kind: "policy", id: sel, title: def.label, note: `부록 D ${def.clause} · 표준서 제안 ${def.value.toLocaleString("ko-KR")} ${def.unit}` }} actions={<Link href="/settings/policies" className="text-sm text-[var(--accent)]">닫기</Link>}>
            <p className="mb-1 text-sm">{POLICY_HELP[sel]}</p>
            {basis && (
              <p className="mb-1 text-xs">
                <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[var(--accent)]">{basis.via === "law" ? "법정 값" : basis.via === "notice" ? "법정 값(고시)" : "법정 값(자동 갱신)"}</span> 근거:{" "}
                <a href={lawLink(basis.law)} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                  {basis.article}
                </a>
              </p>
            )}
            {cand && (
              <div className="mb-3 rounded-md border border-[var(--warn)] p-3 text-sm">
                <p className="font-medium">
                  {cand.value != null
                    ? `새 값 후보: ${cand.current.toLocaleString("ko-KR")} → ${cand.value.toLocaleString("ko-KR")} ${def?.unit ?? ""}`
                    : "법령이 바뀌었는데 조문에서 숫자를 읽지 못했습니다. 조문을 보고 값을 적어 주세요"}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {cand.law} {cand.effective} 시행(감지 {cand.on}). 적용하면 시행일(지났으면 오늘)부터 바뀌고 이력이 남습니다.
                </p>
                {owner || accounting ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    {owner && (
                      <AssistForm id={`cand-${sel}`} action={policyCandidateAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="key" value={sel ?? ""} />
                        {cand.value == null && <NumberField help="policy.value" name="value" required unit={def?.unit ?? ""} current={cur?.value} />}
                        <SubmitButton>{cand.value != null ? "이 값으로 적용" : "적용"}</SubmitButton>
                      </AssistForm>
                    )}
                    <AssistForm id={`cand-x-${sel}`} action={policyCandidateAction} guard={false}>
                      <input type="hidden" name="key" value={sel ?? ""} />
                      <input type="hidden" name="intent" value="dismiss" />
                      <SubmitButton variant="secondary">값 그대로(넘기기)</SubmitButton>
                    </AssistForm>
                  </div>
                ) : null}
              </div>
            )}
            <p className="mb-3 text-xs text-[var(--muted)]">
              지금 {cur.value.toLocaleString("ko-KR")} {def.unit} · 표준서 제안 {def.value.toLocaleString("ko-KR")} · 범위 {def.min ?? 0}~{def.max ?? "제한 없음"} · 근거 부록 D({def.clause})
            </p>
            {sel === "wage.minimum_hourly" && (
              <div className="mb-3 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm">
                <p>
                  매년 8월 말일부터 앱이{" "}
                  <a href={MIN_WAGE_SOURCE} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                    최저임금위원회 결정현황
                  </a>
                  에서 고시된 다음 해 시간급을 읽어 다음 해 1월 1일 시행으로 넣고 대표에게 알립니다. 시행 전까지 아래에서 고칠 수 있고, 가져오지 못하면 직접 넣으라고 알립니다.
                </p>
                {owner && (
                  <form action={syncMinWageAction} className="mt-2">
                    <SubmitButton variant="secondary">고시된 다음 해 값 지금 가져오기</SubmitButton>
                  </form>
                )}
              </div>
            )}
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
                    {h.effectiveFrom} 시행 → <b>{Number(h.value).toLocaleString("ko-KR")}</b> · {h.changedBy ?? "자동(최저임금위원회)"} · {h.reason}
                    {h.revisionRequestNo && ` · ${h.revisionRequestNo}`} <span className="text-xs text-[var(--muted)]">({fmtTime(h.createdAt)})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {/* 넓은 PC: 분류를 왼쪽 세로 목록으로, 정책값은 오른쪽 표로(대표 결정 2026-11-23 PC 화면 개선) */}
      <div className="xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start xl:gap-5">
      <nav className="mb-3 flex flex-wrap gap-1.5 text-sm xl:sticky xl:top-[4.5rem] xl:flex-col xl:flex-nowrap" aria-label="정책값 분류">
        <Link href="/settings/policies" aria-current={!group ? "page" : undefined} className={`rounded-md border px-2.5 py-1.5 xl:border-transparent ${!group ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}>
          전체 {rows.length}
        </Link>
        {tabs.map((t) => (
          <Link key={t.k} href={`/settings/policies?g=${t.k}`} aria-current={group === t.k ? "page" : undefined} className={`rounded-md border px-2.5 py-1.5 xl:border-transparent ${group === t.k ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}>
            {POLICY_GROUPS[t.k]} {t.n}
            {t.changed > 0 && <span className="ml-1 text-xs text-[var(--accent)]">변경 {t.changed}</span>}
            {t.scheduled > 0 && <span className="ml-1 text-xs text-[var(--warn)]">예정 {t.scheduled}</span>}
            {t.cand > 0 && <span className="ml-1 text-xs text-[var(--danger)]">후보 {t.cand}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">
      {group && groupHasLegal && (
        <div className="mb-3 rounded-md border border-[var(--line)] p-3 text-sm">
          <p>
            {POLICY_GROUPS[group]} 마지막 점검:{" "}
            {checks[group] ? `${checks[group]!.on} ${checks[group]!.byName}${checks[group]!.agent ? " · 세무사 확인" : ""}${checks[group]!.note ? ` · ${checks[group]!.note}` : ""}` : "아직 없음"}
          </p>
          <p className="text-xs text-[var(--muted)]">법정 값은 법령이 바뀌면 근거 조문에서 숫자를 읽어 새 값 후보로 올립니다(매달 1일, 세금·절세 화면의 법제처 OC 값 필요). 1월·7월에는 점검 할 일이 뜹니다{group === "payroll" ? ", 12월에는 내년 4대보험·산재 요율 확인 할 일이 뜹니다" : ""}.</p>
          {(owner || accounting) && (
            <AssistForm id={`policy-check-${group}`} action={policyCheckAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="g" value={group} />
              <CheckGroup help="policy.checkAgent" name="agent" options={[{ value: "1", label: "세무사 확인" }]} />
              <TextField help="policy.checkNote" name="note" />
              <SubmitButton variant="secondary">점검 완료</SubmitButton>
            </AssistForm>
          )}
        </div>
      )}
      <PolicyTable
        group={group}
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
          group: policyGroup(r.key as PolicyKey),
          legal: LEGAL_BASIS[r.key as PolicyKey] ? { via: LEGAL_BASIS[r.key as PolicyKey]!.via, article: LEGAL_BASIS[r.key as PolicyKey]!.article, href: lawLink(LEGAL_BASIS[r.key as PolicyKey]!.law) } : null,
          cand: law.candidates.some((c) => c.key === r.key),
        }))}
      />
      </div>
      </div>
    </>
  );
}
