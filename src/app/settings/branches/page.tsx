import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, ROLES as ROLE_VALUES } from "@/modules/auth/roles";
import { listBranches, staffBranches } from "@/modules/platform/branch";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { AssistForm } from "../../_assist";
import { AddressField, CheckGroup, DateField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveBranchAction, saveStaffBranchAction } from "./actions";

/** 설정 › 본점·지점(대표 결정 2026-11-19, 2단계). 지점이 하나뿐이면 다른 화면은 하나도 바뀌지 않는다 */
export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ edit?: string; staff?: string; error?: string; notice?: string }> }) {
  const { edit, staff, error, notice } = await searchParams;
  const user = await requireUser();
  const canEdit = can(user, "settings.edit");
  const db = await getDb();
  const [branches, shop] = await Promise.all([listBranches(db), loadShopInfo(db)]);
  const open = branches.filter((b) => !b.closedOn);
  const people = canEdit && branches.length > 1 ? await staffBranches(db) : [];
  const editing = canEdit && edit ? (edit === "new" ? null : branches.find((b) => b.id === edit)) : undefined;
  const showForm = canEdit && edit && (edit === "new" || editing);
  const person = staff ? people.find((p) => p.id === staff) : undefined;
  const nameOf = (id: string) => branches.find((b) => b.id === id)?.name ?? "?";
  const roleOpts = ROLE_VALUES.filter((r) => r !== "owner").map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  return (
    <>
      <PageTitle
        help="settings.branches"
        sub="본점과 지점 목록입니다. 지점이 하나뿐이면 다른 화면에는 지점 칸이 나오지 않습니다."
        actions={
          canEdit && (
            <Link href="/settings/branches?edit=new#form" className={buttonClass("secondary")}>
              지점 추가
            </Link>
          )
        }
      >
        본점·지점
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="본점·지점 목록" help={{ kind: "panel", id: "branch.list" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-medium">이름</th>
                  <th className="py-1.5 pr-3 font-medium">코드</th>
                  <th className="py-1.5 pr-3 font-medium">사업자·종사업장</th>
                  <th className="py-1.5 pr-3 font-medium">정비업 등록</th>
                  <th className="py-1.5 pr-3 font-medium">주소·전화</th>
                  {canEdit && <th className="py-1.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {branches.map((b) => (
                  <tr key={b.id} className={b.closedOn ? "text-[var(--muted)]" : undefined}>
                    <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                      {b.name} {b.isMain && <Badge tone="accent">본점</Badge>} {b.closedOn && <Badge>문 닫음 {b.closedOn}</Badge>}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{b.code || "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{b.isMain ? shop.bizNo || "—" : [b.bizNo || shop.bizNo, b.subBizNo && `종 ${b.subBizNo}`].filter(Boolean).join(" · ")}</td>
                    <td className="py-1.5 pr-3">{b.isMain ? shop.repairRegNo || "—" : b.repairRegNo || <span className="text-[var(--warn)]">아직 없음</span>}</td>
                    <td className="py-1.5 pr-3">{b.isMain ? [shopAddressLine(shop), shop.phone].filter(Boolean).join(" · ") : [shopAddressLine(b), b.phone].filter(Boolean).join(" · ")}</td>
                    {canEdit && (
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {b.isMain ? (
                          <Link href="/settings/shop" className="text-[var(--accent)] hover:underline">
                            사업장 정보
                          </Link>
                        ) : (
                          <Link href={`/settings/branches?edit=${b.id}#form`} className="text-[var(--accent)] hover:underline">
                            고치기
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">본점의 사업장 정보(상호·사업자번호·정비업 등록번호·주소·직인)는 설정 › 사업장 정보에서 고칩니다. 지점에서 비워 둔 칸은 본점 값이 찍힙니다.</p>
        </Card>
        <div id="form" className="space-y-4">
          {showForm ? (
            <Card title={editing ? `'${editing.name}' 고치기` : "새 지점"} help={{ kind: "panel", id: "branch.form" }}>
              <AssistForm key={editing?.id ?? "new"} id={`branch-${editing?.id ?? "new"}`} action={saveBranchAction} className="space-y-3">
                {editing && <input type="hidden" name="id" value={editing.id} />}
                <TextField help="br.name" name="name" required defaultValue={editing?.name} />
                <TextField help="br.code" name="code" required defaultValue={editing?.code} maxLength={2} />
                {/* 사업자단위과세(추천)면 본점 사업자번호를 그대로 쓰므로 본점 값을 불러와 둔다 */}
                <TextField help="br.bizNo" name="bizNo" inputMode="numeric" defaultValue={editing ? editing.bizNo : shop.bizNo} from={editing ? undefined : shop.bizNo ? "설정 › 사업장 정보" : undefined} />
                <TextField help="br.subBizNo" name="subBizNo" inputMode="numeric" defaultValue={editing?.subBizNo} />
                <TextField help="br.repairRegNo" name="repairRegNo" defaultValue={editing?.repairRegNo} />
                <TextField help="br.phone" name="phone" inputMode="tel" defaultValue={editing?.phone} />
                <AddressField help={{ zip: "shop.zip", address: "shop.address", detail: "shop.addressDetail" }} defaults={{ zip: editing?.zip, address: editing?.address, detail: editing?.addressDetail }} />
                <DateField help="br.openedOn" name="openedOn" defaultValue={editing?.openedOn ?? ""} quick={["today"]} />
                {editing && <DateField help="br.closedOn" name="closedOn" defaultValue={editing.closedOn ?? ""} quick={["today"]} />}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>{editing ? "저장" : "등록"}</SubmitButton>
                  <Link href="/settings/branches" className={buttonClass("secondary")}>
                    닫기
                  </Link>
                </div>
              </AssistForm>
            </Card>
          ) : (
            <Card title="지점을 낼 때" help={{ kind: "panel", id: "branch.form" }}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
                <li>세무서에 사업자등록(사업자단위과세면 종사업장 번호), 구청에 정비업 등록을 합니다.</li>
                <li>&lsquo;지점 추가&rsquo;로 이름·코드·등록번호·주소를 넣습니다.</li>
                <li>아래 &lsquo;직원 소속·지점별 역할&rsquo;에서 그 지점 직원을 정합니다.</li>
                <li>설정 › 작업장에서 지점의 작업장을, 설정 › 출퇴근 장소에서 지점 인터넷을 등록합니다.</li>
              </ol>
              {!canEdit && <p className="mt-2 text-sm">지점은 대표가 관리합니다.</p>}
            </Card>
          )}
        </div>
      </div>

      {people.length > 0 && (
        <div id="staff" className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card title="직원 소속·지점별 역할" help={{ kind: "panel", id: "branch.staff" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
                    <th className="py-1.5 pr-3 font-medium">직원</th>
                    <th className="py-1.5 pr-3 font-medium">소속</th>
                    <th className="py-1.5 pr-3 font-medium">다른 지점</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {people.map((p) => (
                    <tr key={p.id} className={person?.id === p.id ? "bg-[var(--accent-soft)]" : undefined}>
                      <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.name}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{nameOf(p.home)}</td>
                      <td className="py-1.5 pr-3">
                        {p.access.length
                          ? p.access.map((a) => `${nameOf(a.branchId)}(${a.roles.length ? a.roles.map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).join("·") : "같은 역할"})`).join(", ")
                          : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <Link href={`/settings/branches?staff=${p.id}#staff`} className="text-[var(--accent)] hover:underline">
                          고치기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">대표·회계 담당은 따로 정하지 않아도 모든 지점을 봅니다.</p>
          </Card>
          {person && (
            <Card title={`${person.name}의 지점`} help={{ kind: "panel", id: "branch.staff" }}>
              <AssistForm key={person.id} id={`staffbr-${person.id}`} action={saveStaffBranchAction} className="space-y-3">
                <input type="hidden" name="userId" value={person.id} />
                <SelectField help="br.home" name="home" required defaultValue={person.home} options={open.map((b) => ({ value: b.id, label: b.name }))} />
                {open
                  .filter((b) => b.id !== person.home)
                  .map((b) => {
                    const a = person.access.find((x) => x.branchId === b.id);
                    return (
                      <CheckGroup
                        key={b.id}
                        help="br.access"
                        label={`${b.name}에서`}
                        name={`acc_${b.id}`}
                        options={[{ value: "same", label: "원래 역할 그대로" }, ...roleOpts]}
                        defaultChecked={a ? (a.roles.length ? a.roles : ["same"]) : []}
                      />
                    );
                  })}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>저장</SubmitButton>
                  <Link href="/settings/branches#staff" className={buttonClass("secondary")}>
                    닫기
                  </Link>
                </div>
              </AssistForm>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
