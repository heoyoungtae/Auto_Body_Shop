import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { seoulDate } from "@/modules/platform/time";
import { CONTRACT_KIND, LEVELS, SKILLS, tenureText, type Skill } from "@/modules/staff/rules";
import { canSeeRoster, listStaff } from "@/modules/staff/service";
import { requireUser } from "../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../_ui";

/** 직원 명부(F-11-01, STD-11): 대표·회계는 모두, 다른 직원은 이름·직무·입사일·역량만 */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await listStaff(db, user);
  const full = canSeeRoster(user);
  const today = seoulDate();
  const empty = rows.filter((r) => !r.hiredOn && r.active).length;
  return (
    <>
      <PageTitle
        help="staff"
        sub="근로자 명부와 역량 표입니다. 사내 표준서 STD-11."
        actions={
          <Link href="/staff/competency" className="text-sm font-semibold text-[var(--accent)]">
            역량 표 →
          </Link>
        }
      >
        직원 명부
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {full && empty > 0 && <Notice>명부를 아직 적지 않은 직원이 {empty}명 있습니다. 이름을 눌러 입사일·직무를 적어 주세요. 근태신청서의 연차 일수와 재직증명서가 이 값을 씁니다.</Notice>}
      <div className="mt-4">
        <Card title={`직원 ${rows.length}명`} help={{ kind: "panel", id: "staff.list" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">이름</th>
                  <th className="py-1.5 pr-2">역할</th>
                  <th className="py-1.5 pr-2">종사 업무</th>
                  <th className="py-1.5 pr-2">입사일·근속</th>
                  {full && <th className="py-1.5 pr-2">계약</th>}
                  <th className="py-1.5 pr-2">자격증</th>
                  <th className="py-1.5 pr-2">역량(2단계 이상)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => {
                  const strong = (Object.entries(r.levels) as [Skill, number][]).filter(([, lv]) => lv >= 2);
                  return (
                    <tr key={r.id} className={r.leftOn || !r.active ? "opacity-60" : ""}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {full || r.id === user.id ? (
                          <Link href={`/staff/${r.id}`} className="font-medium text-[var(--accent)]">
                            {r.name}
                          </Link>
                        ) : (
                          <b>{r.name}</b>
                        )}
                        {r.leftOn && <Badge tone="neutral">퇴직 {r.leftOn}</Badge>}
                      </td>
                      <td className="py-1.5 pr-2">{r.roles.map((x) => ROLE_LABEL[x]).join("·")}</td>
                      <td className="py-1.5 pr-2">{r.job ?? <span className="text-[var(--muted)]">—</span>}</td>
                      <td className="py-1.5 pr-2">
                        {r.hiredOn ? (
                          <span className="whitespace-nowrap">
                            {r.hiredOn}
                            <span className="block text-xs text-[var(--muted)]">{tenureText(r.hiredOn, r.leftOn ?? today)}</span>
                          </span>
                        ) : (
                          <Badge tone="warn">명부 없음</Badge>
                        )}
                      </td>
                      {full && <td className="py-1.5 pr-2">{r.contractKind ? CONTRACT_KIND[r.contractKind as keyof typeof CONTRACT_KIND] : "—"}</td>}
                      <td className="py-1.5 pr-2">{r.licenses.length ? r.licenses.map((l) => l.name).join(", ") : "—"}</td>
                      <td className="py-1.5 pr-2">
                        {strong.length ? (
                          <span className="flex flex-wrap gap-1">
                            {strong.map(([sk, lv]) => (
                              <Badge key={sk} tone={lv >= 3 ? "ok" : "accent"}>
                                {SKILLS[sk]} {lv}·{LEVELS[lv as 1].label}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            계정은 &apos;설정 → 직원·역할&apos;에서 만듭니다. 만든 뒤 여기서 이름을 눌러 명부를 적습니다.
            {!full && " 생년월일·주소·계약 형태는 대표·회계 담당만 봅니다."}
          </p>
        </Card>
      </div>
    </>
  );
}
