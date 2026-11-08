import Link from "next/link";
import { requireUser } from "../_lib/session";
import { Card, PageTitle } from "../_ui";

const ITEMS = [
  { href: "/settings/policies", title: "정책값(부록 D)", body: "기한·주기·기준 점수 같은 숫자 규칙. 대표가 바꾸고, 바꾼 이력이 남습니다." },
  { href: "/settings/delegation", title: "전결 규정(부록 B)", body: "업무와 금액별 최종 승인자. 대표가 구간을 바꿉니다." },
  { href: "/settings/users", title: "직원·역할·대리 승인", body: "직원 계정, 역할 지정, 대표 부재 시 대리 승인자." },
];

export default async function SettingsPage() {
  await requireUser();
  return (
    <>
      <PageTitle help="settings" sub="모든 직원이 볼 수 있고, 바꾸는 것은 대표만 할 수 있습니다.">설정</PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className="block">
            <Card title={i.title}>
              <p className="text-sm text-[var(--muted)]">{i.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
