import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import {
  hiresWithoutTraining,
  listTrainings,
  trainingMatrix,
} from "@/modules/staff/training";
import {
  TR_KINDS,
  TR_STATUS,
  type TrKind,
} from "@/modules/staff/training-rules";
import { AssistForm } from "../_assist";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../_ui";
import { importPlanAction } from "./actions";

const LEGAL = (Object.keys(TR_KINDS) as TrKind[]).filter(
  (k) => TR_KINDS[k].legal && k !== "safety_change" && k !== "msds",
);

/** 교육 훈련(F-11-03): 한 해 계획·실시·효과 확인과 사람별 이수 현황 */
export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const year = Number(q.year) || Number(today.slice(0, 4));
  const list = await listTrainings(db, year);
  const manage = can(user, "training.manage");
  const matrix = manage ? await trainingMatrix(db, year) : [];
  const hires = manage ? await hiresWithoutTraining(db, today) : [];
  const month = today.slice(0, 7);
  const done = list.filter((x) => x.t.status === "done").length;
  const planned = list.filter((x) => x.t.status !== "cancelled").length;
  return (
    <>
      <PageTitle
        help="training"
        sub={`${year}년 계획 ${planned}건 · 실시 ${done}건. 교육 시간은 근로시간으로 봅니다(취업규칙 제27조).`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/training?year=${year - 1}`}
              className="text-sm text-[var(--accent)]"
            >
              ← {year - 1}
            </Link>
            <Link
              href={`/training?year=${year + 1}`}
              className="text-sm text-[var(--accent)]"
            >
              {year + 1} →
            </Link>
            {manage && (
              <Link href="/training/new" className={buttonClass()}>
                교육 올리기
              </Link>
            )}
          </div>
        }
      >
        교육 훈련
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      {hires.length > 0 && (
        <Card
          title="채용 시 교육이 필요한 사람"
          help={{ kind: "panel", id: "tr.hire" }}
        >
          <ul className="text-sm">
            {hires.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-1">
                <span>{u.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {u.hiredOn} 입사
                </span>
                <Link
                  href={`/training/new?kind=safety_hire&who=${u.id}`}
                  className="text-xs text-[var(--accent)]"
                >
                  교육 잡기
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={`${year}년 교육 계획·실시`}
        help={{ kind: "panel", id: "tr.list" }}
      >
        {list.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {list.map(({ t, attendees, signed }) => {
              const late =
                t.status === "planned" &&
                t.plannedMonth &&
                t.plannedMonth < month;
              return (
                <li key={t.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-[var(--muted)]">
                      {t.plannedMonth ?? "수시"}
                    </span>
                    <Link
                      href={`/training/${t.id}`}
                      className="font-medium text-[var(--accent)]"
                    >
                      {t.title}
                    </Link>
                    <Badge>{TR_KINDS[t.kind as TrKind]?.label ?? t.kind}</Badge>
                    <Badge
                      tone={
                        t.status === "done"
                          ? "ok"
                          : t.status === "cancelled"
                            ? "neutral"
                            : late
                              ? "danger"
                              : "warn"
                      }
                    >
                      {late
                        ? "늦음"
                        : TR_STATUS[t.status as keyof typeof TR_STATUS]}
                    </Badge>
                    {t.status === "done" && (
                      <span className="text-xs text-[var(--muted)]">
                        {t.heldOn} · {t.hours}시간 · 서명 {signed}/{attendees}
                        {t.effectDue && !t.effectAt
                          ? ` · 효과 확인 ${t.effectDue}까지`
                          : ""}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>
            {year}년 교육 계획이 없습니다.
            {can(user, "training.plan")
              ? " 아래에서 연간 계획을 불러오세요."
              : ""}
          </Empty>
        )}
        {can(user, "training.plan") && (
          <AssistForm
            id={`training-import-${year}`}
            action={importPlanAction}
            guard={false}
            className="mt-3"
          >
            <input type="hidden" name="year" value={year} />
            <SubmitButton variant="secondary">
              {year}년 연간 계획 불러오기
            </SubmitButton>
            <p className="mt-1 text-xs text-[var(--muted)]">
              작년 계획이 있으면 작년 것을, 없으면 법정 교육·직무 교육 기본
              계획을 넣습니다. 이미 있는 교육은 건너뜁니다.
            </p>
          </AssistForm>
        )}
      </Card>

      {manage && (
        <Card
          title="사람별 이수 현황(서명한 것만)"
          help={{ kind: "panel", id: "tr.matrix" }}
        >
          {matrix.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted)]">
                    <th className="py-1 pr-2">직원</th>
                    {LEGAL.map((k) => (
                      <th key={k} className="py-1 pr-2">
                        {TR_KINDS[k].label.replace(/\(.*\)/, "")}
                      </th>
                    ))}
                    <th className="py-1">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((u) => (
                    <tr key={u.id} className="border-t border-[var(--line)]">
                      <td className="py-1 pr-2">{u.name}</td>
                      {LEGAL.map((k) => {
                        const c = u.by[k];
                        return (
                          <td
                            key={k}
                            className={`py-1 pr-2 ${c?.hours ? "" : "text-[var(--danger)]"}`}
                          >
                            {c?.hours ? `${c.hours}h` : "-"}
                            {c?.unsigned ? (
                              <span className="text-xs text-[var(--muted)]">
                                {" "}
                                (서명 {c.unsigned})
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="py-1">{u.total}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>재직 중인 직원이 없습니다.</Empty>
          )}
        </Card>
      )}
    </>
  );
}
