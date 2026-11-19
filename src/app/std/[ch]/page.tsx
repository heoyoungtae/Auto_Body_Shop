import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getStdChapter } from "@/modules/quality/std";
import { isStdCh, STD_APPENDICES, STD_CHAPTERS } from "@/modules/quality/std-ref";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { anchorOf, StdSection } from "../_section";

const ORDER = [...STD_CHAPTERS, ...STD_APPENDICES] as string[];

/** 장 한 개: 총람(요약) 절 → 상세 절차서 절 → 관련 양식. 부록은 본문만 */
export default async function StdChapter({ params, searchParams }: { params: Promise<{ ch: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { ch } = await params;
  const q = await searchParams;
  if (!isStdCh(ch)) notFound();
  const user = await requireUser();
  const g = await getStdChapter(await getDb(), user, ch);
  const mgr = can(user, "qms.docs");
  const head = g.overview.find((s) => s.chapter || s.part === "appendix");
  const proc = g.procedure.find((s) => s.chapter);
  const oSecs = g.overview.filter((s) => s !== head);
  const pSecs = g.procedure.filter((s) => s !== proc);
  const i = ORDER.indexOf(ch);
  const prev = ORDER[i - 1];
  const next = ORDER[i + 1];
  const appendix = (STD_APPENDICES as readonly string[]).includes(ch);
  const title = head ? `${head.no} ${head.title}` : proc ? `${proc.docNo} ${proc.title}` : ch;
  return (
    <>
      <PageTitle
        help="std.chapter"
        sub={appendix ? "총람 부록입니다." : `총람(요약) ${oSecs.length}절 · 상세 절차서 ${pSecs.length}절 · 양식 ${g.forms.length}종. 총람과 절차서가 다르면 절차서를 따릅니다.`}
        std={proc ? proc.docNo : undefined}
        actions={
          <>
            <Link href="/std" className={buttonClass("secondary")}>
              차례
            </Link>
            {prev && (
              <Link href={`/std/${prev}`} className={buttonClass("secondary")}>
                ← 앞 장
              </Link>
            )}
            {next && (
              <Link href={`/std/${next}`} className={buttonClass("secondary")}>
                다음 장 →
              </Link>
            )}
          </>
        }
      >
        {title}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {(oSecs.length > 0 || pSecs.length > 0) && (
        <nav aria-label="이 장의 절" className="mb-4 flex flex-wrap gap-1.5 text-sm print:hidden">
          {oSecs.map((s) => (
            <a key={s.key} href={`#${anchorOf(s)}`} className="rounded-full border border-[var(--line)] px-2.5 py-1 hover:bg-[var(--surface-2)]">
              {s.no || s.title}
            </a>
          ))}
          {proc && (
            <a href="#p" className="rounded-full border border-[var(--accent)] px-2.5 py-1 text-[var(--accent)]">
              상세 절차서
            </a>
          )}
          {g.forms.length > 0 && (
            <a href="#forms" className="rounded-full border border-[var(--line)] px-2.5 py-1 hover:bg-[var(--surface-2)]">
              양식
            </a>
          )}
        </nav>
      )}
      <Card title={appendix ? undefined : "총람(요약)"} help={appendix ? undefined : { kind: "panel", id: "std.overview" }}>
        <div className="space-y-5">
          {head && (head.body || head.part === "appendix") && <StdSection s={{ ...head, no: head.part === "appendix" ? "" : head.no, title: head.part === "appendix" ? head.title : "머리말" }} mgr={mgr} />}
          {oSecs.map((s) => (
            <StdSection key={s.key} s={s} mgr={mgr} />
          ))}
        </div>
      </Card>
      {proc && (
        <div id="p" className="scroll-mt-20">
          <Card title={`상세 절차서 ${proc.docNo} ${proc.title}`} help={{ kind: "panel", id: "std.procedure" }}>
            <div className="space-y-5">
              {proc.body && <StdSection s={{ ...proc, no: "", title: "문서 정보" }} mgr={mgr} />}
              {pSecs.map((s) => (
                <StdSection key={s.key} s={s} mgr={mgr} />
              ))}
            </div>
          </Card>
        </div>
      )}
      {g.forms.length > 0 && (
        <div id="forms" className="scroll-mt-20">
          <Card title="이 장의 양식" help={{ kind: "panel", id: "std.forms" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {g.forms.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2 py-1.5">
                  <Link href={`/std/form/${f.no}`} className="font-medium text-[var(--accent)]">
                    {f.no}
                  </Link>
                  <span>{f.title}</span>
                  {f.revisedOn && <Badge tone="accent">고침 {f.revisedOn}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
