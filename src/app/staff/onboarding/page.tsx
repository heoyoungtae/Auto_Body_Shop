import Link from "next/link";
import { getDb } from "@/db/runtime";
import { seoulDate } from "@/modules/platform/time";
import { canSeeOnboarding, ONBOARD_WINDOW_DAYS, onboardingList } from "@/modules/staff/onboarding";
import { requireUser } from "../../_lib/session";
import { Badge, Card, Empty, ErrorBox, PageTitle } from "../../_ui";
import { OnboardingItems } from "./items";

/** 신입 오리엔테이션 점검표(F-11-09): 입사 120일 안 직원의 진행 상황. 항목은 기록에서 자동 판정 */
export default async function OnboardingPage() {
  const user = await requireUser();
  if (!canSeeOnboarding(user))
    return (
      <>
        <PageTitle help="staff.onboarding">신입 오리엔테이션</PageTitle>
        <ErrorBox message="대표·공장장·회계 담당이 봅니다. 내 진행 상황은 내 명부 화면에서 봅니다." />
      </>
    );
  const today = seoulDate();
  const list = await onboardingList(await getDb(), today);
  return (
    <>
      <PageTitle help="staff.onboarding" std="F-11-09" sub={`입사 ${ONBOARD_WINDOW_DAYS}일 안 직원입니다. 칸을 따로 적지 않고 명부·서류·교육·역량표 기록으로 저절로 채워집니다.`} actions={<Link href="/staff" className="text-sm text-[var(--accent)]">← 직원 명부</Link>}>
        신입 오리엔테이션
      </PageTitle>
      {!list.length ? (
        <div className="mt-4">
          <Empty>입사 {ONBOARD_WINDOW_DAYS}일 안 직원이 없습니다. 직원 등록 때 입사일을 넣으면 여기에 나옵니다.</Empty>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {list.map((o) => (
            <Card
              key={o.userId}
              title={`${o.name} · ${o.job || "직무 없음"}`}
              help={{ kind: "panel", id: "staff.onboarding" }}
              actions={o.late.length ? <Badge tone="danger">{o.late.length}개 늦음</Badge> : <Badge tone={o.done === o.total ? "ok" : "neutral"}>{o.done}/{o.total}</Badge>}
            >
              <p className="mb-2 text-xs text-[var(--muted)]">
                입사 {o.hiredOn} ·{" "}
                <Link href={`/staff/${o.userId}`} className="text-[var(--accent)]">
                  명부
                </Link>
              </p>
              <OnboardingItems items={o.items} today={today} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
