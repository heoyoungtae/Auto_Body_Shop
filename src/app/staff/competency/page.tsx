import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { LEVELS, MENTOR_LEVEL, SKILLS, type Skill } from "@/modules/staff/rules";
import { canAssess, listStaff, pendingAssessments } from "@/modules/staff/service";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { assessAction, confirmAction } from "../actions";

const SKILL_KEYS = Object.keys(SKILLS) as Skill[];
const TONE: Record<number, "neutral" | "warn" | "accent" | "ok"> = { 1: "warn", 2: "accent", 3: "ok", 4: "ok" };

/** 역량 표(F-11-02, STD-11 6절): 사람 × 직무 단계, 평가·대표 확인 */
export default async function CompetencyPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; u?: string }> }) {
  const { error, notice, u } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const [rows, pending, pol] = await Promise.all([listStaff(db, user), pendingAssessments(db), loadPolicy(db, today)]);
  const people = rows.filter((r) => r.active && !r.leftOn);
  const minSolo = pol["competency.min_solo_level"];
  const owner = can(user, "staff.confirm");
  return (
    <>
      <PageTitle help="staff.competency" sub={`단독 배정은 ${minSolo}단계 이상, 지도자·최종 검사자는 ${MENTOR_LEVEL}단계 이상입니다(STD-11 6절).`} actions={<Link href="/staff" className="text-sm text-[var(--accent)]">← 직원 명부</Link>}>
        역량 표
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 space-y-4">
        {owner && pending.length > 0 && (
          <Card title={`대표 확인 대기 ${pending.length}건`} help={{ kind: "panel", id: "comp.pending" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {pending.map(({ c, name }) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{name}</b> {SKILLS[c.skill as Skill] ?? c.skill} → {c.level}단계 {LEVELS[c.level as 1]?.label}
                    <span className="block text-xs text-[var(--muted)]">
                      {c.assessedOn} · {c.note}
                    </span>
                  </span>
                  <form action={confirmAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="ok" value="1" />
                    <SubmitButton variant="secondary">확인</SubmitButton>
                  </form>
                  <form action={confirmAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="ok" value="0" />
                    <SubmitButton variant="danger">되돌리기</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="사람별 역량 단계" help={{ kind: "panel", id: "comp.matrix" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">이름</th>
                  {SKILL_KEYS.map((k) => (
                    <th key={k} className="py-1.5 pr-2 text-center">
                      {SKILLS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {people.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                    {SKILL_KEYS.map((k) => {
                      const lv = r.levels[k];
                      return (
                        <td key={k} className="py-1.5 pr-2 text-center" title={lv ? `${lv}단계 ${LEVELS[lv as 1].label}: ${LEVELS[lv as 1].can}` : "평가 없음"}>
                          {lv ? <Badge tone={TONE[lv]}>{lv}</Badge> : <span className="text-[var(--muted)]">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            {Object.entries(LEVELS).map(([n, l]) => (
              <li key={n}>
                <b>{n}</b> {l.label}: {l.can}
              </li>
            ))}
          </ul>
        </Card>

        {canAssess(user) ? (
          <Card title="역량 평가하기" help={{ kind: "panel", id: "comp.assess" }}>
            <AssistForm id="comp-assess" action={assessAction} className="grid gap-3 md:grid-cols-4">
              <SelectField help="comp.user" name="userId" required defaultValue={u ?? ""} placeholder="고르기" options={people.map((r) => ({ value: r.id, label: r.name }))} />
              <SelectField help="comp.skill" name="skill" required placeholder="고르기" options={SKILL_KEYS.map((k) => ({ value: k, label: SKILLS[k] }))} />
              <SelectField help="comp.level" name="level" required placeholder="고르기" options={Object.entries(LEVELS).map(([n, l]) => ({ value: n, label: `${n}단계 ${l.label}` }))} />
              <DateField help="comp.assessedOn" name="assessedOn" required defaultValue={today} quick={["today"]} />
              <div className="md:col-span-4">
                <TextField help="comp.note" name="note" required />
              </div>
              <div className="md:col-span-4">
                <SubmitButton>평가 저장</SubmitButton>
                <p className="mt-1 text-xs text-[var(--muted)]">{owner ? "대표 평가는 바로 확정됩니다." : "공장장 평가는 대표가 확인해야 역량 표에 반영됩니다."}</p>
              </div>
            </AssistForm>
          </Card>
        ) : (
          <p className="text-sm text-[var(--muted)]">역량 평가는 공장장·대표가 합니다. 단계를 올리고 싶으면 공장장에게 평가를 요청하세요.</p>
        )}
      </div>
    </>
  );
}
