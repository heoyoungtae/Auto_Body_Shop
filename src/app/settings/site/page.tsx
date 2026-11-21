// 설정 › 홈페이지(대표): 견적 요청 받기, 첫 화면 문구, 개업일, 인사말, 영업시간, 카카오 채널, 개인정보 보호책임자.
// 정비소 이름·전화·주소·대표·사업자번호는 사업장 정보, 로고는 로고·앱 아이콘에서 불러온다(여기서 다시 적지 않음).
import Link from "next/link";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { consultation } from "@/db/schema";
import { siteConfig, siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { shopCard } from "@/modules/carbook/service";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveSiteAction } from "./actions";

export default async function SiteSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const month = new Date(Date.now() - 30 * 864e5);
  const [cfg, shop, [n], [open]] = await Promise.all([
    siteConfig(db),
    shopCard(db),
    db.select({ n: sql<number>`count(*)::int` }).from(consultation).where(and(eq(consultation.source, "web"), gte(consultation.at, month))),
    db.select({ n: sql<number>`count(*)::int` }).from(consultation).where(and(eq(consultation.channel, "online"), isNull(consultation.webReplyAt), eq(consultation.result, "open"))),
  ]);
  const hosts = homepageHosts();
  return (
    <>
      <PageTitle
        help="settings.site"
        sub="누구나 보는 홈페이지(소개·견적 요청·개인정보 처리방침)의 문구와 견적 요청 받기를 정합니다."
        actions={
          <Link href={hosts.length ? siteUrl() : "/site"} target="_blank" className={buttonClass("secondary")}>
            홈페이지 열기
          </Link>
        }
      >
        홈페이지
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card title="문구·견적 요청" help={{ kind: "panel", id: "site.settings" }}>
          <AssistForm id="site-settings" action={saveSiteAction} className="space-y-4">
            <CheckGroup help="site.cfg.requests" name="requests" options={[{ value: "on", label: "홈페이지에서 견적 요청 받기" }]} defaultChecked={cfg.requests ? ["on"] : []} />
            <TextField help="site.cfg.headline" name="headline" required defaultValue={cfg.headline} />
            <TextAreaField help="site.cfg.lead" name="lead" rows={2} defaultValue={cfg.lead} />
            <DateField help="site.cfg.openOn" name="openOn" defaultValue={cfg.openOn} quick={[]} />
            <TextAreaField help="site.cfg.about" name="about" rows={8} defaultValue={cfg.about} />
            <TextField help="site.cfg.hours" name="hours" defaultValue={cfg.hours} />
            <TextField help="site.cfg.kakao" name="kakao" defaultValue={cfg.kakao} placeholder="https://pf.kakao.com/_xxxx" />
            <TextField help="site.cfg.privacyOfficer" name="privacyOfficer" defaultValue={cfg.privacyOfficer} />
            <TextField help="site.cfg.privacyContact" name="privacyContact" defaultValue={cfg.privacyContact} />
            <DateField help="site.cfg.privacyFrom" name="privacyFrom" defaultValue={cfg.privacyFrom} quick={["today"]} />
            <p className="text-xs text-[var(--muted)]">
              홈페이지에 보이는 정비소: {shop.name} · {shop.phone || "전화 없음"} · {shop.address || "주소 없음"} —{" "}
              <Link href="/settings/shop" className="text-[var(--accent)] underline">
                사업장 정보에서 고치기
              </Link>{" "}
              ·{" "}
              <Link href="/settings/brand" className="text-[var(--accent)] underline">
                로고 바꾸기
              </Link>
            </p>
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
        </Card>
        <Card title="주소·요청" help={{ kind: "panel", id: "site.status" }}>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-[var(--muted)]">홈페이지 주소</dt>
            <dd className="break-all">{hosts.length ? hosts.map((h) => `https://${h}`).join(", ") : "아직 연결 전(테스트는 앱 주소/site)"}</dd>
            <dt className="text-[var(--muted)]">최근 30일 요청</dt>
            <dd>{n?.n ?? 0}건</dd>
            <dt className="text-[var(--muted)]">답 안 쓴 요청</dt>
            <dd>
              <Link href="/consults?f=online" className="text-[var(--accent)] underline">
                {open?.n ?? 0}건 보기
              </Link>
            </dd>
          </dl>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
            <li>견적 요청은 상담 일지에 경로 &lsquo;홈페이지&rsquo;로 들어가고, 상담원에게 알림이 갑니다.</li>
            <li>답은 상담 화면의 &lsquo;손님에게 답변(비밀)&rsquo;에서 씁니다. 요청한 손님만 내 차 수첩에서 봅니다.</li>
            <li>홈페이지 주소 연결은 미니 PC에서 한 번 합니다(서버 설명서 &lsquo;홈페이지 주소 연결&rsquo;).</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
