import { getDb } from "@/db/runtime";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { DEFAULT_DELEGATION, DELEGATION_TASKS, isDelegationTask, loadBands } from "@/modules/platform/delegation";
import { seoulDate } from "@/modules/platform/time";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, Field, Notice, PageTitle } from "../../_ui";
import { changeBandsAction } from "../actions";

const fmt = (n: number | null, unit: string | null) => (n == null ? "그 이상" : `${n.toLocaleString("ko-KR")}${unit === "%" ? "%" : "원"} 이하`);

export default async function DelegationPage({ searchParams }: { searchParams: Promise<{ task?: string; error?: string; notice?: string }> }) {
  const { task, error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const owner = user.roles.includes("owner");
  const rows = await Promise.all(DELEGATION_TASKS.map(async (t) => ({ task: t, def: DEFAULT_DELEGATION[t], bands: await loadBands(db, t) })));
  const sel = task && isDelegationTask(task) ? rows.find((r) => r.task === task)! : null;
  return (
    <>
      <PageTitle sub="사내 표준서 부록 B. 금액은 부가세 포함. 기안자 본인이 승인 역할이면 한 단계 위로 올라갑니다.">전결 규정</PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.task} title={r.def.label} actions={owner && r.def.unit ? <a className="text-sm text-[var(--accent)]" href={`/settings/delegation?task=${r.task}`}>바꾸기</a> : undefined}>
            <ul className="flex flex-wrap gap-2 text-sm">
              {r.bands.map((b, i) => (
                <li key={i} className="rounded-md border border-[var(--line)] px-2 py-1">
                  {r.def.unit ? `${fmt(b.upTo, r.def.unit)} → ` : ""}
                  <b>{ROLE_LABEL[b.role]}</b>
                </li>
              ))}
              {"note" in r.def && r.def.note && <li className="px-2 py-1 text-[var(--muted)]">{r.def.note}</li>}
            </ul>
            {sel?.task === r.task && (
              <form action={changeBandsAction} className="mt-4 space-y-3">
                <input type="hidden" name="task" value={r.task} />
                <p className="text-xs text-[var(--muted)]">낮은 구간부터 적습니다. 마지막 줄은 상한을 비웁니다. 쓰지 않는 줄은 역할을 비워 둡니다.</p>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <Field label={`구간 ${i + 1} 상한(${r.def.unit})`} name={`upTo${i}`} defaultValue={r.bands[i]?.upTo ?? ""} inputMode="numeric" />
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium">최종 승인</span>
                      <select name={`role${i}`} defaultValue={r.bands[i]?.role ?? ""} className="h-11 w-full rounded-md border border-[var(--line-strong)] px-2">
                        <option value="">(안 씀)</option>
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="시행일" name="effectiveFrom" type="date" defaultValue={seoulDate()} required />
                  <Field label="근거 개정요청 번호" name="revisionRequestNo" placeholder="R-2611-0001" />
                </div>
                <SubmitButton>저장</SubmitButton>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
