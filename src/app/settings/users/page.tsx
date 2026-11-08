import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, proxyAssignment } from "@/db/schema";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { listUsers } from "@/modules/auth/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, PasswordField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { addProxyAction, createUserAction, updateUserAction } from "../actions";

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const owner = user.roles.includes("owner");
  const users = await listUsers(db);
  const proxies = await db
    .select({ id: proxyAssignment.id, fromDate: proxyAssignment.fromDate, toDate: proxyAssignment.toDate, proxy: appUser.name, proxyId: proxyAssignment.proxyId })
    .from(proxyAssignment)
    .innerJoin(appUser, eq(appUser.id, proxyAssignment.proxyId))
    .orderBy(desc(proxyAssignment.fromDate))
    .limit(10);
  const today = seoulDate();
  // 대리인 기본값: 지난번에 정한 사람 → 없으면 공장장(설계서 10.3). 다시 고르지 않아도 되게
  const candidates = users.filter((u) => u.id !== user.id && u.active);
  const lastProxy = proxies.find((p) => candidates.some((c) => c.id === p.proxyId))?.proxyId;
  const defaultProxy = lastProxy ?? candidates.find((u) => u.roles.includes("plant_manager"))?.id;
  return (
    <>
      <PageTitle help="settings.users" sub="역할 이름은 사내 표준서와 같습니다. 한 사람이 여러 역할을 가질 수 있습니다.">
        직원·역할
      </PageTitle>
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
                    <summary className="min-h-9 cursor-pointer py-1 text-[var(--accent)]">관리</summary>
                    <div className="mt-2 space-y-4">
                      <AssistForm id={`roles-${u.id}`} action={updateUserAction} className="space-y-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value="roles" />
                        <CheckGroup help="user.roles" name="roles" options={ROLE_OPTIONS} defaultChecked={u.roles} />
                        <SubmitButton variant="secondary">역할 저장</SubmitButton>
                      </AssistForm>
                      <AssistForm id={`pw-${u.id}`} action={updateUserAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value="password" />
                        <PasswordField help="user.resetPassword" name="password" autoComplete="new-password" required rules />
                        <div className="sm:pt-7">
                          <SubmitButton variant="secondary">비밀번호 재설정</SubmitButton>
                        </div>
                      </AssistForm>
                      <form action={updateUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="op" value={u.active ? "lock" : "unlock"} />
                        <SubmitButton variant={u.active ? "danger" : "secondary"}>{u.active ? "계정 잠그기" : "잠금 풀기"}</SubmitButton>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {u.active ? "퇴사·장기 휴직 때 씁니다. 로그인만 막히고 지난 기록은 그대로 남습니다." : "다시 로그인할 수 있게 합니다."}
                        </p>
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
            <AssistForm id="user-new" action={createUserAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField help="user.name" name="name" required />
                <TextField help="user.loginId" name="loginId" required autoCapitalize="none" spellCheck={false} lower />
                <PasswordField help="user.password" name="password" required rules autoComplete="new-password" />
              </div>
              <CheckGroup help="user.roles" name="roles" options={ROLE_OPTIONS} />
              <SubmitButton>만들기</SubmitButton>
            </AssistForm>
          </Card>
        )}

        <Card title="대표 부재 시 대리 승인">
          {proxies.length > 0 ? (
            <ul className="mb-3 space-y-1 text-sm">
              {proxies.map((p) => (
                <li key={p.id}>
                  {p.fromDate} ~ {p.toDate} · {p.proxy} {p.fromDate <= today && today <= p.toDate && <Badge tone="ok">지금 대리 중</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-[var(--muted)]">정한 대리 기간이 없습니다.</p>
          )}
          {owner ? (
            <AssistForm id="proxy-new" action={addProxyAction} className="grid gap-3 sm:grid-cols-3 sm:items-start">
              <SelectField help="proxy.proxyId" name="proxyId" required defaultValue={defaultProxy} options={candidates.map((u) => ({ value: u.id, label: `${u.name} (${u.roles.map((r) => ROLE_LABEL[r]).join("·")})` }))} />
              <DateField help="proxy.fromDate" name="fromDate" required defaultValue={today} min={today} quick={["today", "tomorrow"]} />
              <DateField help="proxy.toDate" name="toDate" required min={today} quick={["tomorrow", "week", "nextMonth"]} />
              <div className="sm:col-span-3">
                <SubmitButton>지정</SubmitButton>
              </div>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">대표가 지정합니다. 기본 대리인은 공장장입니다(설계서 10.3).</p>
          )}
        </Card>
      </div>
    </>
  );
}
