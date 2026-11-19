import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { canSee, getStdSection, StdError } from "@/modules/quality/std";
import { chOf } from "@/modules/quality/std-ref";
import { requireUser, userMessage } from "../../../_lib/session";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { StdSection } from "../../_section";

/** 양식 한 장의 모양(표준 양식집). 위 '앱 화면 열기'로 그 양식을 쓰는 화면에 간다 */
export default async function StdForm({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { code } = await params;
  const q = await searchParams;
  const user = await requireUser();
  let s;
  try {
    s = await getStdSection(await getDb(), user, `f:${decodeURIComponent(code).toUpperCase()}`);
  } catch (e) {
    if (e instanceof StdError) return <ErrorBox message={userMessage(e)} />;
    throw e;
  }
  const ch = chOf(s.no.split("-")[1]);
  return (
    <>
      <PageTitle
        help="std.form"
        sub={s.grp ?? "표준 양식"}
        std={`STD-${ch}`}
        actions={
          <>
            <Link href="/std/forms" className={buttonClass("secondary")}>
              양식 목록
            </Link>
            <Link href={`/std/${ch}`} className={buttonClass("secondary")}>
              {ch === "Q" ? "Q장" : `${Number(ch)}장`} 보기
            </Link>
          </>
        }
      >
        {s.no} {s.title}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card>
        <StdSection s={{ ...s, hidden: !canSee(user, s) }} mgr={can(user, "qms.docs")} heading="h2" />
      </Card>
    </>
  );
}
