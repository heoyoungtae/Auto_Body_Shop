import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { BODY_PARTS, isPart, partLabel, SUB_PARTS } from "@/modules/repair/body-map";
import { loadSubParts, SUB_PART_MAX } from "@/modules/repair/sub-parts";
import { AssistForm } from "../../_assist";
import { TextAreaField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveSubPartsAction } from "./actions";

/** 차 부위·세부 부위: 그림의 큰 부위는 고정이고, 그 안의 세부 부품 이름만 정비소가 더한다 */
export default async function BodyPartsPage({ searchParams }: { searchParams: Promise<{ part?: string; error?: string; notice?: string }> }) {
  const { part, error, notice } = await searchParams;
  const user = await requireUser();
  const canEdit = can(user, "diag.confirm");
  const extras = await loadSubParts(await getDb());
  const pick = canEdit && part && isPart(part) ? part : null;
  return (
    <>
      <PageTitle help="settings.bodyParts" std="STD-02 5절" sub="차 그림의 큰 부위 안에서 진단·견적에 쓰는 세부 부품 이름입니다. 기본 목록에 없는 부품을 부위별로 더합니다.">
        차 부위·세부 부위
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="부위별 세부 부위" help={{ kind: "panel", id: "set.bodyParts" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-medium">부위</th>
                  <th className="py-1.5 pr-3 font-medium">기본 목록</th>
                  <th className="py-1.5 pr-3 font-medium">더한 것</th>
                  {canEdit && <th className="py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {BODY_PARTS.map((b) => (
                  <tr key={b.id} className={pick === b.id ? "bg-[var(--accent-soft)]" : undefined}>
                    <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{b.label}</td>
                    <td className="py-1.5 pr-3 text-[var(--muted)]">{(SUB_PARTS[b.id] ?? []).join(", ") || "—"}</td>
                    <td className="py-1.5 pr-3">{(extras[b.id] ?? []).join(", ")}</td>
                    {canEdit && (
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <Link href={`/settings/body-parts?part=${b.id}#edit`} className="text-[var(--accent)] hover:underline">
                          더하기·고치기
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div id="edit" className="space-y-4">
          {pick ? (
            <Card title={`${partLabel(pick)}에 더할 세부 부위`} help={{ kind: "panel", id: "set.bodyParts" }}>
              <p className="mb-3 text-sm text-[var(--muted)]">기본 목록: {(SUB_PARTS[pick] ?? []).join(", ") || "없음"}</p>
              <AssistForm id={`subparts-${pick}`} action={saveSubPartsAction} className="space-y-3">
                <input type="hidden" name="part" value={pick} />
                <TextAreaField help="set.subParts" name="subs" rows={6} defaultValue={(extras[pick] ?? []).join("\n")} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>저장</SubmitButton>
                  <Link href="/settings/body-parts" className={buttonClass("secondary")}>
                    닫기
                  </Link>
                </div>
              </AssistForm>
            </Card>
          ) : (
            <Card title="쓰는 법" help={{ kind: "panel", id: "set.bodyParts" }}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
                <li>차종에 따라 목록에 없는 부품(예: 사이드 가니시, 범퍼 레일)이 자주 나오면 그 부위 줄의 &lsquo;더하기·고치기&rsquo;를 누릅니다.</li>
                <li>한 줄에 하나씩 적고 저장합니다. 한 부위에 {SUB_PART_MAX}개까지 됩니다.</li>
                <li>진단 화면의 &lsquo;세부 부위&rsquo; 칸 목록에 기본 목록 뒤로 바로 나옵니다.</li>
              </ol>
              {!canEdit && <p className="mt-2 text-sm">바꾸는 것은 공장장·대표가 합니다.</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
