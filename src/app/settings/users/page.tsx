import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, proxyAssignment } from "@/db/schema";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { listUsers } from "@/modules/auth/service";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Field, Notice, PageTitle } from "../../_ui";
import { addProxyAction, createUserAction, updateUserAction } from "../actions";

function RoleChecks({ checked = [] as string[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1">
          <input type="checkbox" name="roles" value={r} defaultChecked={checked.includes(r)} /> {ROLE_LABEL[r]}
        </label>
      ))}
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const owner = user.roles.includes("owner");
  const users = await listUsers(db);
  const proxies = await db
    .select({ id: proxyAssignment.id, fromDate: proxyAssignment.fromDate, toDate: proxyAssignment.toDate, proxy: appUser.name })
    .from(proxyAssignment)
    .innerJoin(appUser, eq(appUser.id, proxyAssignment.proxyId))
    .orderBy(desc(proxyAssignment.fromDate))
    .limit(10);
  return (
    <>
      <PageTitle sub="역할 이름은 사내 표준서와 같습니다. 한 사람이 여러 역할을 가질 수 있습니다.">직원·역할</PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="space-y-4">
        <Card title={`직원 ${users.length}명`}>
          <ul className="divide-y divide-[var(--line)]">
            {users.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>{u.name}</b> <span className="text-[var(--muted)]">{u.loginId}</span>
                  {u.roles.map((r) => (
                    <Badge key={r} tone="accent">
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                  {!u.active && <Badge tone="danger">잠김</Badge>}
                </div>
                {owner && (
                  <details className="mt-2 text-sm">
                    <summary className="text-[var(--accent)]">관리</summary>
                    <div className="mt-2 space-y-3">
                      <form action={updateUserAction} className="space-y-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value="roles" />
                        <RoleChecks checked={u.roles} />
                        <SubmitButton variant="secondary">역할 저장</SubmitButton>
                      </form>
                      <form action={updateUserAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value="password" />
                        <Field label="새 비밀번호" name="password" type="password" autoComplete="new-password" />
                        <SubmitButton variant="secondary">비밀번호 재설정</SubmitButton>
                      </form>
                      <form action={updateUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value={u.active ? "lock" : "unlock"} />
                        <SubmitButton variant={u.active ? "danger" : "secondary"}>{u.active ? "계정 잠그기" : "잠금 풀기"}</SubmitButton>
                      </form>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {owner && (
          <Card title="직원 계정 만들기">
            <form action={createUserAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="이름" name="name" required />
                <Field label="아이디" name="loginId" required hint="영문 소문자·숫자 3~30자" autoCapitalize="none" />
                <Field label="처음 비밀번호" name="password" type="password" required hint="8자 이상, 영문+숫자" autoComplete="new-password" />
              </div>
              <RoleChecks />
              <SubmitButton>만들기</SubmitButton>
            </form>
          </Card>
        )}

        <Card title="대표 부재 시 대리 승인">
          {proxies.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {proxies.map((p) => (
                <li key={p.id}>
                  {p.fromDate} ~ {p.toDate} · {p.proxy}
                </li>
              ))}
            </ul>
          )}
          {owner ? (
            <form action={addProxyAction} className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">대리인</span>
                <select name="proxyId" required defaultValue={users.find((u) => u.roles.includes("plant_manager") && u.active)?.id} className="h-11 w-full rounded-md border border-[var(--line-strong)] px-2">
                  {users
                    .filter((u) => u.id !== user.id && u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <Field label="시작일" name="fromDate" type="date" required />
              <Field label="종료일" name="toDate" type="date" required />
              <SubmitButton>지정</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">대표가 지정합니다. 기본 대리인은 공장장입니다(설계서 10.3).</p>
          )}
        </Card>
      </div>
    </>
  );
}
