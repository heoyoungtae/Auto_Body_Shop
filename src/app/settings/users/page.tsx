import Link from "next/link";
import { can } from "@/modules/auth/permissions";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, proxyAssignment } from "@/db/schema";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { listUsers, loginHistory, sessionsOf, type SessionView } from "@/modules/auth/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { tempPasswordAction } from "../../staff/actions";
import { TempPasswordBox } from "../../staff/temp-password";
import { addProxyAction, updateUserAction } from "../actions";

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

const LOGIN_EVENT: Record<string, string> = { "auth.login": "로그인", "auth.login_failed": "비밀번호 틀림", "auth.locked": "실패가 많아 잠김", "auth.temp_expired": "임시 비밀번호 기한 지남" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; open?: string }> }) {
  const q = await searchParams;
  const { error, notice } = q;
  const user = await requireUser();
  const db = await getDb();
  const owner = can(user, "account.manage");
  const users = await listUsers(db);
  const now = new Date();
  const [sess, hists] = owner ? await Promise.all([sessionsOf(db, users.map((u) => u.id), user.sessionHash, now), loginHistory(db, users.map((u) => u.id))]) : [new Map<string, SessionView[]>(), new Map<string, Awaited<ReturnType<typeof loginHistory>> extends Map<string, infer V> ? V : never>()];
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
        로그인 계정
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="space-y-4">
        <Card title={`계정 ${users.length}개`} help={{ kind: "panel", id: "users.list" }} actions={<Link href="/staff/new" className="text-sm font-semibold text-[var(--accent)]">새 직원은 직원 명부에서 등록 →</Link>}>
          <ul className="divide-y divide-[var(--line)]">
            {users.map((u) => {
              const devs = sess.get(u.id) ?? [];
              const hist = hists.get(u.id) ?? [];
              const fails = hist.filter((h) => h.action !== "auth.login");
              const locked = !!u.lockedUntil && u.lockedUntil > now;
              return (
                <li key={u.id} id={`u-${u.id}`} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b>{u.name}</b> <span className="text-[var(--muted)]">{u.loginId}</span>
                    {u.roles.map((r) => (
                      <Badge key={r} tone="accent">
                        {ROLE_LABEL[r]}
                      </Badge>
                    ))}
                    {u.retiredOn ? (
                      <Badge tone="neutral">퇴직({u.retiredOn})</Badge>
                    ) : !u.roles.length ? (
                      <Badge tone="warn">역할 대기(역할을 정하면 열림)</Badge>
                    ) : !u.active ? (
                      <Badge tone="danger">잠김</Badge>
                    ) : locked ? (
                      <Badge tone="danger">로그인 실패로 잠시 잠김</Badge>
                    ) : (
                      <Badge tone="ok">사용 중</Badge>
                    )}
                    {u.mustChangePassword && <Badge tone="warn">{u.tempPasswordUntil && u.tempPasswordUntil < now ? "임시 비밀번호 기한 지남" : "첫 비밀번호 미변경"}</Badge>}
                    {devs.length > 0 && <Badge tone="neutral">로그인 기기 {devs.length}</Badge>}
                    {fails.length > 0 && <Badge tone="warn">최근 실패 {fails.length}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    마지막 로그인 {u.lastLoginAt ? fmtTime(u.lastLoginAt) : "없음"}
                    {devs[0]?.lastSeenAt ? ` · 마지막 사용 ${fmtTime(devs[0].lastSeenAt)}` : ""}
                  </p>
                  {owner && (
                    <details className="mt-2 text-sm" open={q.open === u.id}>
                      <summary className="min-h-9 cursor-pointer py-1 text-[var(--accent)]">관리</summary>
                      <div className="mt-2 space-y-4">
                        <TempPasswordBox user={user} userId={u.id} back={`/settings/users?open=${u.id}`} />
                        <AssistForm id={`roles-${u.id}`} action={updateUserAction} className="space-y-2">
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="op" value="roles" />
                          <CheckGroup help="user.roles" name="roles" options={ROLE_OPTIONS} defaultChecked={u.roles} />
                          <SubmitButton variant="secondary">역할 저장</SubmitButton>
                        </AssistForm>
                        <div>
                          <p className="font-medium">로그인된 기기</p>
                          {devs.length ? (
                            <ul className="mt-1 space-y-1">
                              {devs.map((d) => (
                                <li key={d.id} className="flex flex-wrap items-center gap-2">
                                  <span>
                                    {d.device}
                                    {d.current && " (지금 이 기기)"} · 로그인 {fmtTime(d.createdAt)} · 마지막 사용 {fmtTime(d.lastSeenAt ?? d.createdAt)}
                                    {d.ip ? ` · IP ${d.ip}` : ""}
                                  </span>
                                  {!d.current && (
                                    <form action={updateUserAction}>
                                      <input type="hidden" name="id" value={u.id} />
                                      <input type="hidden" name="op" value="logout" />
                                      <input type="hidden" name="which" value={d.id} />
                                      <SubmitButton variant="secondary">이 기기 로그아웃</SubmitButton>
                                    </form>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[var(--muted)]">없음</p>
                          )}
                          {devs.filter((d) => !d.current).length > 1 && (
                            <form action={updateUserAction} className="mt-1">
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="op" value="logout" />
                              <input type="hidden" name="which" value="all" />
                              <SubmitButton variant="secondary">모든 기기 로그아웃</SubmitButton>
                            </form>
                          )}
                        </div>
                        {hist.length > 0 && (
                          <div>
                            <p className="font-medium">최근 로그인 기록</p>
                            <ul className="mt-1 space-y-0.5 text-xs">
                              {hist.map((h, i) => (
                                <li key={i} className={h.action === "auth.login" ? "" : "text-[var(--danger)]"}>
                                  {fmtTime(h.at)} · {LOGIN_EVENT[h.action] ?? h.action} · {h.device}
                                  {h.ip ? ` · IP ${h.ip}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!u.mustChangePassword && (
                          <form action={tempPasswordAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="back" value={`/settings/users?open=${u.id}`} />
                            <input type="hidden" name="op" value="reissue" />
                            <SubmitButton variant="secondary">임시 비밀번호 다시 발급</SubmitButton>
                            <p className="mt-1 text-xs text-[var(--muted)]">비밀번호를 잊었을 때. 로그인된 기기는 모두 끊기고, 직원은 다음 로그인 때 새 비밀번호를 정합니다.</p>
                          </form>
                        )}
                        <form action={updateUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="op" value={u.active ? "lock" : "unlock"} />
                          <SubmitButton variant={u.active ? "danger" : "secondary"}>{u.active ? "계정 잠그기" : "잠금 풀기"}</SubmitButton>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {u.active ? "퇴사·장기 휴직·휴대폰 분실 때 씁니다. 로그인된 기기도 모두 끊기고, 지난 기록은 그대로 남습니다." : "다시 로그인할 수 있게 합니다."}
                          </p>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>


        <Card title="대표 부재 시 대리 승인" help={{ kind: "panel", id: "users.proxy" }}>
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
