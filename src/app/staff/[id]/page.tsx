import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { CONTRACT_KIND, GENDER, LEVELS, SKILLS, tenureText } from "@/modules/staff/rules";
import { canSeeRoster, competencyHistory, getProfile } from "@/modules/staff/service";
import { AssistForm } from "../../_assist";
import { AddressField, DateField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveProfileAction } from "../actions";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

/** 근로자 명부 한 사람(F-11-01): 대표·회계가 적고, 본인은 본다 */
export default async function StaffProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [u] = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.id, id));
  if (!u) notFound();
  const full = canSeeRoster(user);
  if (!full && user.id !== id) {
    return (
      <>
        <PageTitle help="staff.profile">{u.name}</PageTitle>
        <ErrorBox message="근로자 명부는 대표·회계 담당과 본인만 봅니다." />
      </>
    );
  }
  const [p, hist] = await Promise.all([getProfile(db, user, id), competencyHistory(db, id)]);
  const today = seoulDate();
  const lic = p?.licenses ?? [];
  return (
    <>
      <PageTitle help="staff.profile" sub={p?.hiredOn ? `입사 ${p.hiredOn} · 근속 ${tenureText(p.hiredOn, p.leftOn || today)}` : "아직 명부를 적지 않았습니다."} actions={<Link href="/staff" className="text-sm text-[var(--accent)]">← 직원 명부</Link>}>
        {u.name} 근로자 명부
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="명부 기재 사항" help={{ kind: "panel", id: "staff.profile" }}>
          {full ? (
            <AssistForm id={`profile-${id}`} action={saveProfileAction} className="space-y-4">
              <input type="hidden" name="userId" value={id} />
              <div className="grid gap-3 md:grid-cols-3">
                <TextField help="staff.job" name="job" required defaultValue={p?.job ?? ""} />
                <DateField help="staff.hiredOn" name="hiredOn" required defaultValue={p?.hiredOn ?? ""} quick={["today"]} />
                <SelectField help="staff.contractKind" name="contractKind" required defaultValue={p?.contractKind || "regular"} options={opts(CONTRACT_KIND)} />
                <DateField help="staff.contractEnd" name="contractEnd" defaultValue={p?.contractEnd ?? ""} quick={["nextMonth"]} />
                <SelectField help="staff.gender" name="gender" defaultValue={p?.gender ?? ""} placeholder="고르기" options={opts(GENDER)} />
                <DateField help="staff.birth" name="birth" defaultValue={p?.birth ?? ""} quick={[]} />
              </div>
              <AddressField help={{ zip: "staff.zip", address: "staff.address", detail: "staff.addressDetail" }} defaults={{ zip: p?.zip, address: p?.address, detail: p?.addressDetail }} />
              <TextAreaField help="staff.career" name="career" defaultValue={p?.career ?? ""} rows={2} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">자격증(최대 3개)</legend>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid gap-3 md:grid-cols-3">
                    <TextField help="staff.licName" name={`licName${i}`} defaultValue={lic[i]?.name ?? ""} />
                    <TextField help="staff.licNo" name={`licNo${i}`} defaultValue={lic[i]?.no ?? ""} />
                    <DateField help="staff.licOn" name={`licOn${i}`} defaultValue={lic[i]?.on ?? ""} quick={[]} />
                  </div>
                ))}
              </fieldset>
              <details className="rounded-md border border-[var(--line)] p-3" open={!!p?.leftOn}>
                <summary className="cursor-pointer text-sm font-semibold">퇴직 처리</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <DateField help="staff.leftOn" name="leftOn" defaultValue={p?.leftOn ?? ""} quick={["today"]} />
                  <TextField help="staff.leftReason" name="leftReason" defaultValue={p?.leftReason ?? ""} />
                </div>
              </details>
              <SubmitButton>명부 저장</SubmitButton>
            </AssistForm>
          ) : p ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[8rem_1fr]">
              <dt className="text-[var(--muted)]">종사 업무</dt>
              <dd>{p.job}</dd>
              <dt className="text-[var(--muted)]">입사일</dt>
              <dd>{p.hiredOn}</dd>
              <dt className="text-[var(--muted)]">계약 형태</dt>
              <dd>
                {CONTRACT_KIND[p.contractKind as keyof typeof CONTRACT_KIND] ?? "—"}
                {p.contractEnd && ` (~${p.contractEnd})`}
              </dd>
              <dt className="text-[var(--muted)]">생년월일</dt>
              <dd>{p.birth || "—"}</dd>
              <dt className="text-[var(--muted)]">주소</dt>
              <dd>{p.address ? `(${p.zip}) ${p.address} ${p.addressDetail}` : "—"}</dd>
              <dt className="text-[var(--muted)]">자격증</dt>
              <dd>{lic.length ? lic.map((l) => `${l.name}${l.on ? `(${l.on})` : ""}`).join(", ") : "—"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 명부가 없습니다. 회계 담당이나 대표에게 요청하세요.</p>
          )}
          {!full && <p className="mt-3 text-xs text-[var(--muted)]">틀린 곳이 있으면 회계 담당에게 고쳐 달라고 하세요. 명부는 대표·회계 담당이 적습니다.</p>}
        </Card>

        <Card title="역량 평가 이력" help={{ kind: "panel", id: "staff.history" }}>
          {hist.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {hist.map(({ c, by }) => (
                <li key={c.id} className="py-2">
                  <b>{SKILLS[c.skill as keyof typeof SKILLS] ?? c.skill}</b> {c.level}단계 {LEVELS[c.level as 1]?.label}{" "}
                  {c.confirmedAt ? <Badge tone="ok">확정</Badge> : c.rejectedAt ? <Badge tone="danger">되돌림</Badge> : <Badge tone="warn">대표 확인 대기</Badge>}
                  <span className="block text-xs text-[var(--muted)]">
                    {c.assessedOn} · {by ?? ""} · {c.note}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">평가 기록이 없습니다.</p>
          )}
          <Link href={`/staff/competency?u=${id}`} className="mt-3 inline-block text-sm font-semibold text-[var(--accent)]">
            역량 표에서 평가하기 →
          </Link>
        </Card>
      </div>
    </>
  );
}
