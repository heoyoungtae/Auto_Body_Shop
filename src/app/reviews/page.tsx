import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { listReviews, REVIEW_STATUS } from "@/modules/staff/review";
import { AssistForm } from "../_assist";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";
import { startReviewAction } from "./actions";

/** 인사평가(F-11-06): 한 해 대상자와 진행 상태 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const today = seoulDate();
  const year =
    Number(q.year) ||
    (Number(today.slice(5, 7)) === 1
      ? Number(today.slice(0, 4)) - 1
      : Number(today.slice(0, 4)));
  const { targets, rows } = await listReviews(await getDb(), user, year);
  const write = can(user, "review.write");
  return (
    <>
      <PageTitle
        help="reviews"
        sub="매년 12월, 역량·품질·안전 현장 관리·근태·개선 제안을 앱 기록으로 평가하고 본인과 면담합니다. 결과는 다음 해 교육 계획과 임금 조정에 씁니다."
        actions={
          <div className="flex gap-2 text-sm">
            <Link
              href={`/reviews?year=${year - 1}`}
              className="text-[var(--accent)]"
            >
              ← {year - 1}
            </Link>
            <Link
              href={`/reviews?year=${year + 1}`}
              className="text-[var(--accent)]"
            >
              {year + 1} →
            </Link>
          </div>
        }
      >
        {year}년 인사평가
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card
        title={targets.length ? "대상자" : "내 평가"}
        help={{ kind: "panel", id: "rv.list" }}
      >
        {targets.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {targets.map((t) => {
              const r = rows.find((x) => x.userId === t.id);
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
                  <span className="w-24 font-medium">{t.name}</span>
                  {r ? (
                    <>
                      <Link
                        href={`/reviews/${r.id}`}
                        className="text-[var(--accent)]"
                      >
                        {r.docNo}
                      </Link>
                      <Badge tone={r.status === "confirmed" ? "ok" : "warn"}>
                        {REVIEW_STATUS[r.status as keyof typeof REVIEW_STATUS]}
                      </Badge>
                      {r.grade && (
                        <Badge>
                          {r.grade}등급 · 평균 {r.total}
                        </Badge>
                      )}
                      {r.status === "interview" && (
                        <span className="text-xs text-[var(--muted)]">
                          {r.employeeAckAt
                            ? "본인 확인 끝"
                            : "본인 확인 기다림"}
                        </span>
                      )}
                    </>
                  ) : write && t.id !== user.id ? (
                    <AssistForm
                      id={`rv-start-${t.id}`}
                      action={startReviewAction}
                      guard={false}
                    >
                      <input type="hidden" name="userId" value={t.id} />
                      <input type="hidden" name="year" value={year} />
                      <SubmitButton variant="secondary">평가 시작</SubmitButton>
                    </AssistForm>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">
                      {t.id === user.id ? "대표가 평가" : "아직 없음"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : rows.length ? (
          <ul className="text-sm">
            {rows.map((r) => (
              <li key={r.id} className="py-1">
                <Link
                  href={`/reviews/${r.id}`}
                  className="text-[var(--accent)]"
                >
                  {r.year}년 인사평가
                </Link>{" "}
                <Badge>
                  {REVIEW_STATUS[r.status as keyof typeof REVIEW_STATUS]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {year}년 평가가 아직 없습니다. 면담할 때가 되면 알림이 갑니다.
          </Empty>
        )}
      </Card>
    </>
  );
}
