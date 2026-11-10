import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listLegal, type LegalFilter } from "@/modules/quality/legal";
import {
  APPLIES,
  CYCLES,
  type Applies,
  type Cycle,
} from "@/modules/quality/legal-rules";
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
import { importAppendixAction } from "./actions";

const TABS: [LegalFilter, string][] = [
  ["all", "전체"],
  ["check", "대상 확인 필요"],
  ["due", "기한 다가옴·지남"],
  ["permit", "인허가·신고증"],
  ["mine", "내 담당"],
];
const STAGE = {
  late: ["지남", "danger"],
  second: ["7일 안", "danger"],
  first: ["30일 안", "warn"],
} as const;

/** 법규 대장(F-Q-06, 총람 Q.6) */
export default async function LegalPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const manage = can(user, "legal.manage");
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "all") as LegalFilter;
  const { list, names, stage } = await listLegal(db, user, f);
  const empty = f === "all" && !list.length;
  return (
    <>
      <PageTitle
        help="legal"
        sub="정비소에 적용되는 법령과 의무, 대상 여부와 근거, 담당·주기·기한, 인허가 유효기간을 한곳에서 관리합니다. 기한 30일·7일 전에 알림이 가고, 분기마다 법령 개정을 확인하며, 12월에 준수 평가를 합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {manage && (
              <Link href="/legal/new" className={buttonClass()}>
                항목 추가
              </Link>
            )}
            {manage && (
              <Link href="/legal/revcheck" className={buttonClass("secondary")}>
                분기 개정 확인
              </Link>
            )}
            <Link href="/legal/eval" className={buttonClass("secondary")}>
              연간 준수 평가
            </Link>
          </div>
        }
      >
        법규 대장
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {manage && empty && (
        <AssistForm
          id="legal-import"
          action={importAppendixAction}
          guard={false}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-[var(--accent-soft)] p-3"
        >
          <p className="text-sm">
            대장이 비어 있습니다. 표준서 부록 C의 법규 대장 초안(21건)을 불러와
            하나씩 대상 여부를 확인하면 됩니다.
          </p>
          <SubmitButton>부록 C 초안 불러오기</SubmitButton>
        </AssistForm>
      )}
      <Card
        title="법규 대장(F-Q-06)"
        help={{ kind: "panel", id: "legal.list" }}
      >
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/legal?f=${k}`}
              className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">분야</th>
                  <th className="pr-2">법령·의무</th>
                  <th className="pr-2">대상</th>
                  <th className="pr-2">담당</th>
                  <th className="pr-2">주기·다음 기한</th>
                  <th className="pr-2">인허가 유효기간</th>
                  <th>개정 확인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {list.map((x) => {
                  const sd = x.applies !== "no" ? stage(x.nextDue) : null;
                  const sv = x.applies !== "no" ? stage(x.validUntil) : null;
                  return (
                    <tr key={x.id} className="align-top">
                      <td className="py-2 pr-2 text-xs whitespace-nowrap">
                        {x.area}
                      </td>
                      <td className="pr-2">
                        <Link
                          href={`/legal/${x.id}`}
                          className="font-medium text-[var(--accent)]"
                        >
                          {x.lawName}
                        </Link>
                        <p className="text-xs text-[var(--muted)]">{x.duty}</p>
                      </td>
                      <td className="pr-2 whitespace-nowrap">
                        <Badge
                          tone={
                            x.applies === "yes"
                              ? "ok"
                              : x.applies === "check"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {APPLIES[x.applies as Applies]}
                        </Badge>
                      </td>
                      <td className="pr-2 text-xs whitespace-nowrap">
                        {x.ownerId ? (names.get(x.ownerId) ?? "-") : "-"}
                      </td>
                      <td className="pr-2 text-xs whitespace-nowrap">
                        {CYCLES[x.cycle as Cycle]}
                        {x.nextDue && ` · ${x.nextDue}`}{" "}
                        {sd && (
                          <Badge tone={STAGE[sd][1]}>{STAGE[sd][0]}</Badge>
                        )}
                      </td>
                      <td className="pr-2 text-xs whitespace-nowrap">
                        {x.validUntil ?? "-"}{" "}
                        {sv && (
                          <Badge tone={STAGE[sv][1]}>{STAGE[sv][0]}</Badge>
                        )}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {x.revCheckedOn ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-right text-xs text-[var(--muted)]">
              {list.length}건
            </p>
          </div>
        ) : (
          <Empty>해당하는 항목이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
