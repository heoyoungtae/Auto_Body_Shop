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
        <>
          <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="설명서 차례">
            {parts.map((p) => (
              <a key={p.id} href={`#${p.id}`} className="rounded-md border border-[var(--line)] px-3 py-1.5 hover:border-[var(--accent)]">
                {p.title.replace(/\(.*\)$/, "")}
              </a>
            ))}
          </nav>
          <div className="space-y-4">
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
        </>
      )}
    </>
  );
}
