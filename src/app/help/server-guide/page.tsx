import Link from "next/link";
import { serverGuideText, splitGuide } from "@/modules/help/server-guide";
import { requireUser } from "../../_lib/session";
import { buttonClass, Card, Notice, PageTitle } from "../../_ui";
import { GuideMd } from "./_md";

/** 미니 PC 서버 설명서(대표 요청 2026-11-20): 저장소 deploy/minipc/README.md 를 그대로 보여 준다. 서버 관리라 대표만 */
export default async function ServerGuidePage() {
  await requireUser(["owner"]);
  const { title, intro, parts } = splitGuide(await serverGuideText());
  return (
    <>
      <PageTitle
        help="help.serverGuide"
        sub="미니 PC 서버의 리눅스 설치부터 도메인 연결, 출퇴근, 백업·정전, 국내 직접 접속, 원격 관리까지 따라 하는 순서입니다. 명령 옆 '복사'를 눌러 미니 PC 터미널에 붙여 넣으세요."
        actions={
          <Link href="/settings/server" className={buttonClass("secondary")}>
            설정 › 서버
          </Link>
        }
      >
        {title || "서버 설명서"}
      </PageTitle>
      {!parts.length ? (
        <Notice>설명서를 읽지 못했습니다. 서버의 deploy/minipc/README.md 를 확인하세요.</Notice>
      ) : (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_15rem] xl:items-start xl:gap-5">
          <nav className="mb-4 flex flex-wrap gap-2 text-sm xl:sticky xl:top-[4.5rem] xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100vh-5.5rem)] xl:flex-col xl:flex-nowrap xl:gap-0.5 xl:overflow-y-auto xl:border-l xl:border-[var(--line)] xl:pl-3" aria-label="설명서 차례">
            <span className="hidden text-xs text-[var(--muted)] xl:mb-1 xl:block">차례</span>
            {parts.map((p) => (
              <a key={p.id} href={`#${p.id}`} className="rounded-md border border-[var(--line)] px-3 py-1.5 hover:border-[var(--accent)] xl:border-0 xl:px-2 xl:py-1 xl:hover:bg-[var(--surface-2)]">
                {p.title.replace(/\(.*\)$/, "")}
              </a>
            ))}
          </nav>
          <div className="read-col space-y-4 xl:col-start-1 xl:row-start-1">
            {intro && (
              <Card>
                <div className="space-y-3">
                  <GuideMd md={intro} k="intro" />
                </div>
              </Card>
            )}
            {parts.map((p) => (
              <section key={p.id} id={p.id} className="scroll-mt-20">
                <Card title={p.title} help={{ kind: "panel", id: "help.serverGuideStep" }}>
                  <div className="space-y-3">
                    <GuideMd md={p.body} k={p.id} />
                  </div>
                </Card>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
