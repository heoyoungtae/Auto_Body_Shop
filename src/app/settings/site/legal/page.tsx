// 설정 › 홈페이지 › 약관(대표): 이용약관·개인정보 처리방침 판 관리. 시행 중인 판·시행 예정 판·지난 판, 지금 내용과 다르면 알림, 새 판 시행(시행일 7일 앞서).
// 이용약관 문구는 화면 글 › 이용약관, 처리방침에 들어가는 값은 기본 정보(보호책임자)·사업장 정보·문자 발송에서 고친다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { seoulDate } from "@/modules/platform/time";
import { earliestFrom, LEGAL_KINDS, legalState, legalVersions, NOTICE_DAYS, sameDoc } from "@/modules/site/legal";
import { liveLegalDoc } from "@/modules/site/legal-live";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../../_lib/session";
import { AssistForm } from "../../../_assist";
import { DateField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SiteSettingsTabs } from "../_tabs";
import { cancelLegalAction, issueLegalAction } from "../actions";

export default async function SiteLegalPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const today = seoulDate();
  const base = homepageHosts().length ? siteUrl() : "/site";
  const kinds = await Promise.all(
    LEGAL_KINDS.map(async (k) => {
      const versions = await legalVersions(db, k.kind);
      const st = legalState(versions, today);
      const live = await liveLegalDoc(db, k.kind);
      const latest = st.next ?? st.now;
      return { ...k, st, count: versions.length, min: earliestFrom(st, today), differs: !latest || !sameDoc(latest.doc, live) };
    }),
  );
  return (
    <>
      <PageTitle help="settings.siteLegal" sub="이용약관과 개인정보 처리방침은 판으로 남깁니다. 손님에게는 시행 중인 판이 보이고, 지난 판도 모두 볼 수 있습니다.">
        이용약관·처리방침
      </PageTitle>
      <SiteSettingsTabs on="/settings/site/legal" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        {kinds.map((k) => (
          <Card key={k.kind} title={k.title} help={{ kind: "panel", id: "site.legal" }}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-[var(--muted)]">시행 중</dt>
              <dd>
                {k.st.now ? (
                  <>
                    {k.st.now.from}부터{" "}
                    <Link href={`${base}${k.path}`} target="_blank" className="text-[var(--accent)] underline">
                      보기
                    </Link>
                  </>
                ) : (
                  <span className="text-[var(--muted)]">아직 시행한 판이 없습니다(지금 내용을 그대로 보여 줍니다)</span>
                )}
              </dd>
              <dt className="text-[var(--muted)]">시행 예정</dt>
              <dd>
                {k.st.next ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {k.st.next.from}부터{" "}
                    <Link href={`${base}${k.path}?v=${k.st.next.id}`} target="_blank" className="text-[var(--accent)] underline">
                      보기
                    </Link>
                    <form action={cancelLegalAction}>
                      <input type="hidden" name="id" value={k.st.next.id} />
                      <SubmitButton variant="danger">거두기</SubmitButton>
                    </form>
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">없음</span>
                )}
              </dd>
              <dt className="text-[var(--muted)]">지난 판</dt>
              <dd>{k.st.past.length}개(손님 화면 아래 &lsquo;모든 판&rsquo;에서 누구나 봄)</dd>
            </dl>
            <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${k.differs ? "border-[var(--warn)] bg-[var(--warn-soft)]" : "border-[var(--line)]"}`}>
              {k.differs ? (
                <>
                  <b>지금 내용이 {k.st.next ? "시행 예정 판" : k.st.now ? "시행 중인 판" : "아직 판으로 남지 않았습니다"}</b>
                  {k.st.now || k.st.next ? "과 다릅니다." : "."} 아래에서 새 판으로 시행하세요.
                </>
              ) : (
                <>지금 내용이 {k.st.next ? "시행 예정 판" : "시행 중인 판"}과 같습니다.</>
              )}{" "}
              {k.kind === "terms" ? (
                <>
                  문구는{" "}
                  <Link href="/settings/site/pages?g=terms" className="text-[var(--accent)] underline">
                    화면 글 › 이용약관
                  </Link>
                  에서 고치고 공개합니다.
                </>
              ) : (
                <>
                  보호책임자는{" "}
                  <Link href="/settings/site" className="text-[var(--accent)] underline">
                    기본 정보
                  </Link>
                  , 문자 대행사는{" "}
                  <Link href="/settings/messaging" className="text-[var(--accent)] underline">
                    문자 발송
                  </Link>
                  에서 불러옵니다.
                </>
              )}
            </div>
            <AssistForm id={`site-legal-${k.kind}`} action={issueLegalAction} className="mt-4 space-y-3">
              <input type="hidden" name="kind" value={k.kind} />
              <DateField help="site.legal.from" name="from" defaultValue={k.min} min={k.min} quick={[]} />
              <p className="text-xs text-[var(--muted)]">
                {k.st.now
                  ? `바꾸는 것은 손님에게 ${NOTICE_DAYS}일 앞서 알려야 해서 ${k.min}부터 고를 수 있습니다. 그동안 손님 화면에 '바뀌는 내용 보기'가 뜹니다.`
                  : "처음 판은 오늘부터 시행할 수 있습니다."}
              </p>
              <SubmitButton>{k.st.next ? "예정 판을 지금 내용으로 바꾸기" : "지금 내용을 새 판으로 시행"}</SubmitButton>
            </AssistForm>
          </Card>
        ))}
      </div>
    </>
  );
}
