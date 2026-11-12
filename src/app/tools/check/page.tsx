import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { quarterOf, TOOL_CHECK, TOOL_DECISION, TOOL_KEEP, TOOL_STATUS, TOOL_TONE, type ToolKeep, type ToolStatus } from "@/modules/equipment/rules";
import { checkedInQuarter, listTools } from "@/modules/equipment/tools";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { toolAction } from "../actions";

/** 분기 점검(10.4): 대장 순서대로 보고 '양호'를 누르거나, 마모·파손·누락이면 결정과 내용을 적는다 */
export default async function ToolCheckPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const quarter = quarterOf(seoulDate());
  const [{ list: all, names }, done] = await Promise.all([listTools(db, user, "active"), checkedInQuarter(db, quarter)]);
  // 입고 대기(아직 안 들어온 것)는 점검하지 않는다
  const list = all.filter((t) => t.status !== "pending");
  const left = list.filter((t) => !done.has(t.id));
  const label = `${quarter.slice(0, 4)}년 ${quarter.slice(-1)}분기`;
  return (
    <>
      <PageTitle
        help="tools.check"
        sub={`${label} 점검: ${list.length - left.length}/${list.length}개 끝. 분기 마지막 달(3·6·9·12월) 안에 마칩니다. 반출 중인 것은 돌아온 뒤 봅니다.`}
        actions={
          <Link href="/tools" className="text-sm text-[var(--accent)]">
            ← 치공구
          </Link>
        }
      >
        치공구 분기 점검
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!can(user, "equip.manage") ? (
        <p className="text-sm text-[var(--muted)]">분기 점검은 공장장이 합니다.</p>
      ) : (
        <Card title={`남은 치공구 ${left.length}개`} help={{ kind: "panel", id: "tool.check" }}>
          {left.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {left.map((t) => (
                <li key={t.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/tools/${t.id}`} className="font-mono text-xs text-[var(--accent)]">
                      {t.no}
                    </Link>
                    <span>{t.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {TOOL_KEEP[t.keep as ToolKeep]} · {t.keep === "personal" ? (names.get(t.holderId ?? "") ?? "-") : (t.location ?? "-")}
                    </span>
                    <Badge tone={TOOL_TONE[t.status as ToolStatus]}>{TOOL_STATUS[t.status as ToolStatus]}</Badge>
                    {t.outAt && <Badge tone="warn">반출 중</Badge>}
                    <AssistForm id={`tool-ok-${t.id}`} action={toolAction} guard={false} className="ml-auto">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="intent" value="check" />
                      <input type="hidden" name="result" value="ok" />
                      <input type="hidden" name="back" value="/tools/check" />
                      <SubmitButton variant="secondary">{TOOL_CHECK.ok}</SubmitButton>
                    </AssistForm>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-xs text-[var(--accent)]">마모·파손·누락이면</summary>
                    <AssistForm id={`tool-bad-${t.id}`} action={toolAction} className="mt-2 grid gap-2 md:grid-cols-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="intent" value="check" />
                      <input type="hidden" name="back" value="/tools/check" />
                      <RadioRow help="tool.result" name="result" required options={Object.entries(TOOL_CHECK).filter(([k]) => k !== "ok").map(([value, label]) => ({ value, label, tone: value === "worn" ? ("warn" as const) : ("danger" as const) }))} />
                      <RadioRow help="tool.decision" name="decision" options={Object.entries(TOOL_DECISION).map(([value, label]) => ({ value, label }))} />
                      <div className="md:col-span-2">
                        <TextField help="tool.checkNote" name="checkNote" required />
                      </div>
                      <div className="md:col-span-2">
                        <SubmitButton>기록</SubmitButton>
                      </div>
                    </AssistForm>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">이번 분기 점검을 모두 마쳤습니다.</p>
          )}
        </Card>
      )}
    </>
  );
}
