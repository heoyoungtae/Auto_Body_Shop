import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { risksList } from "@/modules/listq/defs/quality";
import { can } from "@/modules/auth/permissions";
import { listRisks, riskStats, type RiskFilter } from "@/modules/quality/risk";
import {
  isQuarterEndMonth,
  RISK_KIND,
  RISK_STATUS,
  RISK_TONE,
  scoreTone,
  type RiskKind,
  type RiskStatus,
} from "@/modules/quality/risk-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { TextAreaField } from "../_input";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { SubmitButton } from "../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../_ui";
import { riskListAction } from "./actions";

const TABS: [RiskFilter, string][] = [
  ["live", "관리·대응 중"],
  ["high", "고점수"],
  ["mine", "내가 올림·담당"],
  ["done", "끝·종료"],
  ["all", "전체"],
];

/** 리스크·기회 대장(F-Q-03, 총람 Q.4) */
export default async function RisksPage({
  searchParams,
}: {
  searchParams: Promise<Q>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "live") as RiskFilter;
  const [{ list: allList, names, threshold, quarter, review, lastReview }, lr] = await Promise.all([listRisks(db, user, f), runList(db, risksList, user, q)]);
  const list = lr.rows;
  const today = seoulDate(new Date());
  const manage = can(user, "risk.manage");
  const s = await riskStats(db);
  const empty = !s.open && !s.acting && !s.done && f === "live" && !allList.length;
  const grid = (await listRisks(db, user, "live")).list;
  return (
    <>
      <PageTitle
        help="risks"
        sub={`누구나 올리고, 가능성×영향이 ${threshold}점 이상이면 대표에게 알림이 가며 대응 계획을 정합니다. 분기마다 대표가 대장을 검토합니다.`}
        actions={
          <Link href="/risks/new" className={buttonClass()}>
            리스크·기회 올리기
          </Link>
        }
      >
        리스크·기회 대장
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {manage && empty && (
        <AssistForm
          id="risk-import"
          action={riskListAction}
          guard={false}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-[var(--accent-soft)] p-3"
        >
          <input type="hidden" name="intent" value="import" />
          <p className="text-sm">
            대장이 비어 있습니다. 총람 Q.4의 초기 항목 7건(조색 불일치, 차량
            추가 손상, 보험 미승인 작업, 부스 화재, 유기용제 노출, 폐기물,
            개인정보 유출)을 넣고 점수를 맞추면 됩니다.
          </p>
          <SubmitButton>초기 항목 넣기</SubmitButton>
        </AssistForm>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-[auto_1fr]">
        <Card title="점수 지도" help={{ kind: "panel", id: "risk.map" }}>
          <table className="text-center text-sm">
            <tbody>
              {[3, 2, 1].map((l) => (
                <tr key={l}>
                  <th className="pr-2 text-xs font-normal text-[var(--muted)]">
                    가능성 {l}
                  </th>
                  {[1, 2, 3].map((i) => {
                    const n = grid.filter(
                      (x) => x.likelihood === l && x.impact === i,
                    ).length;
                    const tone = scoreTone(l * i, threshold);
                    return (
                      <td
                        key={i}
                        className={`size-12 border border-[var(--line)] ${tone === "danger" ? "bg-[var(--danger-soft)]" : tone === "warn" ? "bg-[var(--warn-soft)]" : "bg-[var(--ok-soft)]"}`}
                      >
                        <span className="font-semibold">{n || ""}</span>
                        <span className="block text-[10px] text-[var(--muted)]">
                          {l * i}점
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {[1, 2, 3].map((i) => (
                  <td key={i} className="pt-1 text-xs text-[var(--muted)]">
                    영향 {i}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>
        <Card
          title={`분기 검토(${quarter})`}
          help={{ kind: "panel", id: "risk.review" }}
        >
          <p className="mb-2 text-sm">
            관리 중 {s.open} · 대응 중 {s.acting}
            {s.late > 0 && (
              <span className="text-[var(--danger)]">
                {" "}
                (기한 지남 {s.late})
              </span>
            )}{" "}
            · {threshold}점 이상 {s.high} · 대응 끝 {s.done}
          </p>
          {review ? (
            <p className="text-sm text-[var(--muted)]">
              {fmtTime(review.at)} 대표 검토
              {review.note ? `: ${review.note}` : ""}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              이번 분기 검토 전입니다.
              {lastReview ? ` 지난 검토 ${lastReview.quarter}.` : ""}
            </p>
          )}
          {can(user, "risk.review") && (
            <AssistForm
              id={`risk-review-${quarter}`}
              action={riskListAction}
              className="mt-2 grid gap-2"
            >
              <input type="hidden" name="intent" value="review" />
              <TextAreaField
                help="risk.reviewNote"
                name="reviewNote"
                rows={2}
                defaultValue={review?.note ?? ""}
              />
              <div>
                <SubmitButton>
                  {review
                    ? "검토 다시 기록"
                    : isQuarterEndMonth(today)
                      ? "이번 분기 검토 기록"
                      : "검토 기록(분기 중간)"}
                </SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>
      </div>

      <Card
        title="리스크·기회 대장(F-Q-03)"
        help={{ kind: "panel", id: "risk.list" }}
      >
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/risks${lr.qs({ f: k === "live" ? null : k })}`}
              className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >
              {label}
            </Link>
          ))}
        </div>
          <ListBar r={lr} bare />
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">번호</th>
                  <th className="pr-2">내용</th>
                  <th className="pr-2">점수</th>
                  <th className="pr-2">대응 계획·담당·기한</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {list.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="py-2 pr-2 text-xs whitespace-nowrap">
                      {x.docNo}
                    </td>
                    <td className="pr-2">
                      <Link
                        href={`/risks/${x.id}`}
                        className="font-medium text-[var(--accent)]"
                      >
                        {x.content}
                      </Link>
                      <p className="text-xs text-[var(--muted)]">
                        {RISK_KIND[x.kind as RiskKind]}
                        {x.chapter && ` · ${x.chapter}`}
                        {x.control && ` · 현재 관리: ${x.control}`}
                      </p>
                    </td>
                    <td className="pr-2 whitespace-nowrap">
                      <Badge tone={scoreTone(x.score, threshold)}>
                        {x.likelihood}×{x.impact}={x.score}
                      </Badge>
                    </td>
                    <td className="pr-2 text-xs">
                      {x.plan ? (
                        <>
                          {x.plan}
                          <span className="block text-[var(--muted)]">
                            {x.ownerId ? names.get(x.ownerId) : "-"} · {x.due}
                            {x.status === "acting" &&
                              x.due &&
                              x.due < today && (
                                <span className="text-[var(--danger)]">
                                  {" "}
                                  지남
                                </span>
                              )}
                          </span>
                        </>
                      ) : x.score >= threshold && x.status === "open" ? (
                        <span className="text-[var(--danger)]">계획 필요</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tone={RISK_TONE[x.status as RiskStatus]}>
                        {RISK_STATUS[x.status as RiskStatus]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>해당하는 항목이 없습니다.</Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
