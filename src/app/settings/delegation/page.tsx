import Link from "next/link";
import { getDb } from "@/db/runtime";
import { confirmedRevisionRequests, getDoc } from "@/modules/approval/service";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { DELEGATION_HELP } from "@/modules/help/glossary";
import { DEFAULT_DELEGATION, DELEGATION_TASKS, isDelegationTask, loadBands } from "@/modules/platform/delegation";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { changeBandsAction } from "../actions";
import { BandEditor } from "./band-editor";

const fmt = (n: number | null, unit: string | null) => (n == null ? "그 이상" : `${n.toLocaleString("ko-KR")}${unit === "%" ? "%" : "원"} 이하`);

export default async function DelegationPage({ searchParams }: { searchParams: Promise<{ task?: string; from?: string; error?: string; notice?: string }> }) {
  const { task, from, error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const owner = user.roles.includes("owner");
  const rows = await Promise.all(DELEGATION_TASKS.map(async (t) => ({ task: t, def: DEFAULT_DELEGATION[t], bands: await loadBands(db, t) })));
  const sel = task && isDelegationTask(task) ? rows.find((r) => r.task === task)! : null;
  const requests = sel ? await confirmedRevisionRequests(db) : [];
  const pending = requests.filter((d) => (d.data as Record<string, unknown>).delegationTask === sel?.task);
  let src: { id: string; docNo: string; proposed: string } | null = null;
  if (sel && from) {
    try {
      const d = await getDoc(db, from);
      if (requests.some((r) => r.id === d.id)) src = { id: d.id, docNo: d.docNo, proposed: String((d.data as Record<string, unknown>).proposed ?? "") };
    } catch {
      /* 없는 문서 */
    }
  }
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  return (
    <>
      <PageTitle help="settings.delegation" sub="사내 표준서 부록 B. 금액은 부가세 포함. 기안자 본인이 승인 역할이면 한 단계 위로 올라갑니다.">
        전결 규정
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card
            key={r.task}
            title={r.def.label}
            help={{ kind: "delegation", id: r.task, title: r.def.label }}
            actions={
              <span className="flex gap-3 text-sm">
                {owner && r.def.unit && sel?.task !== r.task && (
                  <Link className="text-[var(--accent)]" href={`/settings/delegation?task=${r.task}`}>
                    바꾸기
                  </Link>
                )}
                <Link className="text-[var(--accent)]" href={`/approvals/new?task=${r.task}`}>
                  개정 요청
                </Link>
              </span>
            }
          >
            <p className="mb-2 text-xs text-[var(--muted)]">{DELEGATION_HELP[r.task]}</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {r.bands.map((b, i) => (
                <li key={i} className="rounded-md border border-[var(--line)] px-2 py-1">
                  {r.def.unit ? `${fmt(b.upTo, r.def.unit)} → ` : ""}
                  <b>{ROLE_LABEL[b.role]}</b>
                </li>
              ))}
              {"note" in r.def && r.def.note && <li className="px-2 py-1 text-[var(--muted)]">{r.def.note}</li>}
            </ul>
            {sel?.task === r.task && owner && r.def.unit && (
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                {src ? (
                  <Notice>
                    {src.docNo}에서 근거 번호를 불러왔습니다. 요청서의 바꿀 내용: <b className="whitespace-pre-wrap text-[var(--fg)]">{src.proposed}</b>
                  </Notice>
                ) : pending.length > 0 ? (
                  <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3 text-sm">
                    <p className="mb-1 font-medium">확정된 개정 요청서가 있습니다. 고르면 근거 번호가 채워지고 바꿀 내용이 옆에 보입니다.</p>
                    {pending.map((d) => (
                      <Link key={d.id} className="block text-[var(--accent)]" href={`/settings/delegation?task=${r.task}&from=${d.id}`}>
                        {d.docNo} {d.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <AssistForm id={`bands-${r.task}`} action={changeBandsAction} className="mt-3 space-y-3">
                  <input type="hidden" name="task" value={r.task} />
                  <BandEditor bands={r.bands} unit={r.def.unit} roles={roleOptions} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DateField help="delegation.effectiveFrom" name="effectiveFrom" defaultValue={seoulDate()} min={seoulDate()} required />
                    <TextField
                      help="delegation.revisionRequestNo"
                      name="revisionRequestNo"
                      defaultValue={src?.docNo}
                      from={src?.docNo}
                      suggestions={requests.map((d) => ({ value: d.docNo, label: d.title }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton>저장</SubmitButton>
                    <Link href="/settings/delegation" className="inline-flex h-11 items-center px-3 text-sm text-[var(--muted)]">
                      닫기
                    </Link>
                  </div>
                </AssistForm>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
