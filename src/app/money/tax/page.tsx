import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { taxCalendar, taxOverview } from "@/modules/money/tax-profile";
import { BIZ_FORMS, REGIONS, RELIEF_KINDS } from "@/modules/money/tax-rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { Badge, Card, Empty, PageTitle } from "../../_ui";

/** 세금·절세: 사업 형태별 신고·납부 일정, 감면 — 대표·회계만 */
export default async function TaxPage() {
  const user = await requireUser();
  if (!can(user, "payroll.view"))
    return <p className="text-sm text-[var(--muted)]">세금·절세 화면은 대표·회계 담당만 봅니다.</p>;
  const db = await getDb();
  const today = seoulDate();
  const o = await taxOverview(db, user, today);
  const cal = await taxCalendar(db, today);
  return (
    <>
      <PageTitle help="money.tax" sub="앱에 쌓인 기록으로 신고 일정과 절세 항목을 챙깁니다. 금액은 어림이며 최종 판단은 세무사가 합니다.">
        세금·절세
      </PageTitle>
      <Card title="사업 형태와 감면" help={{ kind: "panel", id: "tax.summary" }}>
        {!o.form ? (
          <Empty>
            사업 형태가 정해지지 않았습니다.{" "}
            <Link href="/settings/shop#tax" className="text-[var(--accent)]">
              설정 › 사업장 정보
            </Link>
            에서 정해 주세요.
          </Empty>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["사업 형태", `${BIZ_FORMS[o.form]}${o.formGuessed ? "(사업자등록번호로 짐작)" : ""}`],
              ["지역", o.region ? REGIONS[o.region] : "주소를 넣으면 짐작합니다"],
              ["받는 감면", o.p.relief ? RELIEF_KINDS[o.p.relief] : "아직 안 정함"],
              ["추천", o.rec ? `${RELIEF_KINDS[o.rec.kind]} ${o.rec.rate}% — ${o.rec.why}` : "대표 청년 여부를 넣으면 추천합니다"],
              ["원천세", o.p.halfYearWithholding ? "반기납부(1·7월)" : "매달 10일"],
              ["세무 대리인", [o.p.agentName, o.p.agentPhone].filter(Boolean).join(" ") || "—"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr]">
                <dt className="text-[var(--muted)]">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-2 text-xs">
          <Link href="/settings/shop#tax" className="text-[var(--accent)]">
            설정 고치기 →
          </Link>
        </p>
      </Card>
      <div className="mt-4">
        <Card title="신고·납부 일정(앞으로 12개월)" help={{ kind: "panel", id: "tax.calendar" }}>
          {cal.length === 0 ? (
            <Empty>사업 형태를 정하면 일정이 보입니다.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {cal.map((d) => (
                <li key={d.key} className="flex flex-wrap items-baseline gap-2 py-1.5">
                  <span className="w-24 tabular-nums">{d.due}</span>
                  {d.days <= 14 && <Badge tone={d.days <= 3 ? "warn" : "neutral"}>{d.days === 0 ? "오늘" : `${d.days}일 남음`}</Badge>}
                  <span className="font-medium">{d.what}</span>
                  <span className="text-xs text-[var(--muted)]">{d.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
