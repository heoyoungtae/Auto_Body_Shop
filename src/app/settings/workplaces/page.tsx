import Link from "next/link";
import { WORKPLACE_KINDS } from "@/db/schema";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listWorkplaces, WORKPLACE_KIND_LABEL, WORKPLACE_NAME_SUGGEST } from "@/modules/platform/branch";
import { staffOptions } from "@/modules/quality/qms";
import { AssistForm } from "../../_assist";
import { NumberField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveWorkplaceAction, toggleWorkplaceAction } from "./actions";
import { KindNameFields } from "./kind-name";

/** 작업장: 같은 부지 안의 작업 공간·보관 장소 목록(본점·지점 구분 1단계, 대표 결정 2026-11-19) */
export default async function WorkplacesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; notice?: string }> }) {
  const { edit, error, notice } = await searchParams;
  const user = await requireUser();
  const canEdit = can(user, "workplace.edit");
  const db = await getDb();
  const [rows, staff] = await Promise.all([listWorkplaces(db), canEdit ? staffOptions(db) : Promise.resolve([])]);
  const editing = canEdit && edit ? rows.find((r) => r.id === edit) : undefined;
  const nextOrder = (Math.max(0, ...rows.map((r) => r.sortOrder)) || 0) + 10;
  const kinds = WORKPLACE_KINDS.map((k) => ({ value: k, label: WORKPLACE_KIND_LABEL[k] }));
  return (
    <>
      <PageTitle help="settings.workplaces" std="STD-08" sub="같은 부지 안의 작업 공간과 보관 장소입니다. 공정 배정·설비 위치·5S 구역이 이 목록을 씁니다.">
        작업장
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="작업장 목록" help={{ kind: "panel", id: "set.workplaces" }}>
          {rows.length === 0 ? (
            <Empty>아직 등록한 작업장이 없습니다. {canEdit ? "오른쪽에서 첫 작업장을 등록하세요." : "공장장·대표가 등록합니다."}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
                    <th className="py-1.5 pr-3 font-medium">순서</th>
                    <th className="py-1.5 pr-3 font-medium">이름</th>
                    <th className="py-1.5 pr-3 font-medium">종류</th>
                    <th className="py-1.5 pr-3 text-right font-medium">자리</th>
                    <th className="py-1.5 pr-3 font-medium">담당</th>
                    <th className="py-1.5 pr-3 font-medium">메모</th>
                    {canEdit && <th className="py-1.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => (
                    <tr key={r.id} className={editing?.id === r.id ? "bg-[var(--accent-soft)]" : r.active ? undefined : "text-[var(--muted)]"}>
                      <td className="py-1.5 pr-3 tabular-nums">{r.sortOrder}</td>
                      <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                        {r.name} {!r.active && <Badge>사용 중지</Badge>}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{WORKPLACE_KIND_LABEL[r.kind]}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.bays || "—"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.managerName ?? "—"}</td>
                      <td className="py-1.5 pr-3">{r.note}</td>
                      {canEdit && (
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <Link href={`/settings/workplaces?edit=${r.id}#form`} className="mr-3 text-[var(--accent)] hover:underline">
                            고치기
                          </Link>
                          <form action={toggleWorkplaceAction} className="inline">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                            <button type="submit" className="text-[var(--accent)] hover:underline">
                              {r.active ? "사용 중지" : "다시 쓰기"}
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div id="form" className="space-y-4">
          {canEdit ? (
            <Card title={editing ? `'${editing.name}' 고치기` : "새 작업장"} help={{ kind: "panel", id: "set.workplaces" }}>
              <AssistForm key={editing?.id ?? "new"} id={`workplace-${editing?.id ?? "new"}`} action={saveWorkplaceAction} className="space-y-3">
                {editing && <input type="hidden" name="id" value={editing.id} />}
                <KindNameFields kinds={kinds} suggest={WORKPLACE_NAME_SUGGEST} defaultKind={editing?.kind} defaultName={editing?.name} />
                <NumberField help="wp.bays" name="bays" unit="자리" min={0} max={50} defaultValue={editing?.bays ?? 1} />
                <SelectField
                  help="wp.manager"
                  name="managerId"
                  placeholder="정하지 않음"
                  defaultValue={editing?.managerId ?? ""}
                  options={staff.map((s) => ({ value: s.id, label: s.name }))}
                />
                <NumberField help="wp.sortOrder" name="sortOrder" min={0} max={999} defaultValue={editing?.sortOrder ?? nextOrder} />
                <TextField help="wp.note" name="note" defaultValue={editing?.note} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>{editing ? "저장" : "등록"}</SubmitButton>
                  {editing && (
                    <Link href="/settings/workplaces" className={buttonClass("secondary")}>
                      닫기
                    </Link>
                  )}
                </div>
              </AssistForm>
            </Card>
          ) : (
            <Card title="쓰는 법" help={{ kind: "panel", id: "set.workplaces" }}>
              <p className="text-sm text-[var(--muted)]">작업장은 공장장·대표가 등록합니다. 빠진 곳이나 이름이 다른 곳이 있으면 공장장에게 알려 주세요.</p>
            </Card>
          )}
          <Card title="작업장과 지점의 차이" help={{ kind: "panel", id: "set.workplaces" }}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>같은 부지(같은 주소) 안의 판금동·도장 부스·덴트실·광택장은 모두 작업장입니다.</li>
              <li>떨어진 곳이 부품·도료를 보관만 하면 하치장 신고 뒤 종류 &lsquo;보관(창고)&rsquo;로 넣습니다.</li>
              <li>떨어진 주소에서 수리 작업까지 하면 작업장이 아니라 지점입니다(별도 사업자·정비업 등록). 대표에게 알려 주세요.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
