import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { CONTRACT_KIND, LEVELS, SKILLS, tenureText } from "@/modules/staff/rules";
import { canSeeRoster, competencyHistory, getProfile } from "@/modules/staff/service";
import { DOC_KINDS, DOC_STATUS, type DocKind } from "@/modules/staff/contract-rules";
import { listDocuments } from "@/modules/staff/documents";
import { AssistForm } from "../../_assist";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveProfileAction } from "../actions";
import { ProfileFields } from "../profile-fields";
import { TempPasswordBox } from "../temp-password";
import { StaffFilesCard } from "../staff-files";


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
  const [p, hist, docs] = await Promise.all([getProfile(db, user, id), competencyHistory(db, id), listDocuments(db, user, id)]);
  const has = (k: DocKind) => docs.some((r) => r.d.kind === k && r.d.status !== "cancelled");
  const today = seoulDate();
  const lic = p?.licenses ?? [];
  return (
    <>
      <PageTitle help="staff.profile" sub={p?.hiredOn ? `입사 ${p.hiredOn} · 근속 ${tenureText(p.hiredOn, p.leftOn || today)}` : "아직 명부를 적지 않았습니다."} actions={<Link href="/staff" className="text-sm text-[var(--accent)]">← 직원 명부</Link>}>
        {u.name} 근로자 명부
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {full && (
        <div className="mt-3">
          <TempPasswordBox user={user} userId={id} back={`/staff/${id}`} />
        </div>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="명부 기재 사항" help={{ kind: "panel", id: "staff.profile" }}>
          {full ? (
            <AssistForm id={`profile-${id}`} action={saveProfileAction} className="space-y-4">
              <input type="hidden" name="userId" value={id} />
              <ProfileFields p={p} />
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
              <dt className="text-[var(--muted)]">휴대폰</dt>
              <dd>{p.phone || "—"}</dd>
              <dt className="text-[var(--muted)]">비상연락처</dt>
              <dd>{p.emName ? `${p.emName}${p.emRelation ? `(${p.emRelation})` : ""} ${p.emPhone}` : "—"}</dd>
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

        <Card title="계약서·서약서" help={{ kind: "panel", id: "staff.docs" }}>
          {docs.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {docs.map(({ d }) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/staff/docs/${d.id}`} className="font-semibold text-[var(--accent)]">
                    {DOC_KINDS[d.kind as DocKind]?.label}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{d.docNo}</span>
                  <Badge tone={d.status === "signed" ? "ok" : d.status === "cancelled" ? "neutral" : "warn"}>{DOC_STATUS[d.status as keyof typeof DOC_STATUS]}</Badge>
                  {d.kind === "contract" && d.status === "signed" && !d.deliveredAt && <Badge tone="warn">교부 필요</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 서류가 없습니다.</p>
          )}
          {full && (
            <>
              {(!has("contract") || !has("pledge_join")) && <p className="mt-2 text-sm text-[var(--warn)]">{[!has("contract") && "근로계약서", !has("pledge_join") && "정보보호 서약서"].filter(Boolean).join("·")}를 아직 받지 않았습니다.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/staff/${id}/docs/new?kind=contract`} className={buttonClass("secondary")}>
                  근로계약서 쓰기
                </Link>
                <Link href={`/staff/${id}/docs/new?kind=pledge_join`} className={buttonClass("secondary")}>
                  정보보호 서약서
                </Link>
                {p?.leftOn && (
                  <Link href={`/staff/${id}/docs/new?kind=pledge_leave`} className={buttonClass("secondary")}>
                    퇴직 확인서
                  </Link>
                )}
              </div>
            </>
          )}
        </Card>

        <StaffFilesCard db={db} user={user} userId={id} licenses={lic.map((l) => l.name).filter(Boolean)} leftOn={p?.leftOn} />

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
