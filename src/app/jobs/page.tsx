import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, staffProfile } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { canWriteDocs, jdAckStatus, myJobTitles } from "@/modules/staff/documents";
import { JD_VERSION, JOB_KEYS, JOBS, jobByTitle, skillNames } from "@/modules/staff/job-rules";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../_ui";
import { SignaturePad } from "../repairs/signature-pad";
import { ackJobAction } from "./actions";

/** 직무기술서(F-11-08): 직무 목록, 내 직무 확인 서명, 직원별 확인 현황 */
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [acks, titles] = await Promise.all([jdAckStatus(db), myJobTitles(db, user.id)]);
  const mine = acks.get(user.id);
  const mineOk = !!mine && mine.job.join("|") === titles.join("|");
  const staff = canWriteDocs(user);
  const people = staff
    ? await db.select({ id: appUser.id, name: appUser.name, job: staffProfile.job }).from(appUser).leftJoin(staffProfile, eq(staffProfile.userId, appUser.id)).where(eq(appUser.active, true)).orderBy(appUser.name)
    : [];
  const myKeys = new Set(titles.map((t) => jobByTitle(t)));
  return (
    <>
      <PageTitle help="jobs" std="F-11-08" sub={`${JD_VERSION} · 직무마다 하는 일·자격·역량과 앱에서 하는 일을 한 장으로 봅니다. 내 직무는 읽고 확인 서명합니다.`}>
        직무기술서
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_1fr]">
        <Card title="직무 목록" help={{ kind: "panel", id: "jobs.list" }}>
          <ul className="grid gap-3 md:grid-cols-2">
            {JOB_KEYS.map((k) => {
              const j = JOBS[k];
              return (
                <li key={k} className="rounded-md border border-[var(--line)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/jobs/${k}`} className="font-semibold text-[var(--accent)]">
                      {j.title}
                    </Link>
                    {myKeys.has(k) && <Badge tone="accent">내 직무</Badge>}
                    {j.concurrent && <Badge>겸직</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{j.purpose}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    보고: {j.reportsTo} · 대행: {j.deputy}
                    {j.skills?.length ? ` · 역량: ${skillNames(j.skills)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="내 확인" help={{ kind: "panel", id: "jobs.ack" }}>
            {!titles.length ? (
              <p className="text-sm text-[var(--muted)]">근로자 명부에 아직 직무가 정해지지 않았습니다. 회계 담당이나 대표에게 직무를 정해 달라고 하세요.</p>
            ) : mineOk ? (
              <p className="text-sm">
                <Badge tone="ok">확인함</Badge> {seoulDate(mine!.at)}에 {titles.join("·")} 직무기술서를 확인했습니다.
              </p>
            ) : (
              <form action={ackJobAction} className="space-y-2">
                <p className="text-sm">
                  내 직무: <b>{titles.join(", ")}</b>. 왼쪽에서 직무 이름을 눌러 끝까지 읽은 뒤 서명하세요.
                  {mine && " 직무나 판이 바뀌어 다시 확인합니다."}
                </p>
                <SignaturePad hint="이 칸에 본인이 서명합니다" />
                <SubmitButton>읽었고 확인합니다</SubmitButton>
              </form>
            )}
          </Card>
          {staff && (
            <Card title="직원별 확인" help={{ kind: "panel", id: "jobs.status" }}>
              <ul className="divide-y divide-[var(--line)] text-sm">
                {people.map((p) => {
                  const a = acks.get(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link href={`/staff/${p.id}`} className="text-[var(--accent)]">
                        {p.name}
                        <span className="ml-1 text-xs text-[var(--muted)]">{p.job || "직무 없음"}</span>
                      </Link>
                      {a ? <span className="text-xs text-[var(--muted)]">{seoulDate(a.at)}</span> : <Badge tone="warn">미확인</Badge>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
