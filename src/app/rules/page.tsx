import Link from "next/link";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { canWriteDocs, rulesAckStatus } from "@/modules/staff/documents";
import { RULES_TEXT, RULES_VERSION } from "@/modules/staff/work-rules-text";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../_ui";
import { SignaturePad } from "../repairs/signature-pad";
import { ackRulesAction } from "./actions";

/** **굵게** 만 처리 */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

/** 취업규칙 본문(제목·문단·번호 목록·글머리표·표만 쓰는 간단한 마크다운) */
function RulesBody({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const blocks = text.split(/\n{2,}/);
  blocks.forEach((b, i) => {
    const lines = b.split("\n");
    if (b.startsWith("## ")) out.push(<h2 key={i} id={`ch-${i}`} className="mt-8 mb-2 border-b border-[var(--line)] pb-1 text-lg font-bold">{b.slice(3)}</h2>);
    else if (lines.every((l) => l.startsWith("|"))) {
      const rows = lines.filter((l) => !/^\|\s*-/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
      out.push(
        <table key={i} className="my-2 w-full border-collapse text-sm">
          <tbody>
            {rows.map((r, j) => (
              <tr key={j}>
                {r.map((c, k) => (j === 0 ? <th key={k} className="border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left">{c}</th> : <td key={k} className="border border-[var(--line)] px-2 py-1">{inline(c)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (lines.every((l) => /^\d+\. /.test(l))) out.push(<ol key={i} className="my-2 list-decimal space-y-1 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>);
    else if (lines.every((l) => l.startsWith("- "))) out.push(<ul key={i} className="my-2 list-disc space-y-1 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>);
    else out.push(<p key={i} className="my-2">{inline(b)}</p>);
  });
  return <>{out}</>;
}

/** 취업규칙: 모든 직원이 보고, 읽은 뒤 확인 서명. 대표·회계 담당은 직원별 확인 현황을 본다 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const acks = await rulesAckStatus(db);
  const mine = acks.get(user.id);
  const staff = canWriteDocs(user);
  const people = staff ? await db.select({ id: appUser.id, name: appUser.name, active: appUser.active }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name) : [];
  const chapters = RULES_TEXT.split(/\n{2,}/).map((b, i) => ({ b, i })).filter(({ b }) => b.startsWith("## "));
  return (
    <>
      <PageTitle help="rules" sub={`${RULES_VERSION} · 모든 직원이 읽고 확인 서명을 남깁니다(근로기준법 제14조).`}>
        취업규칙
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_1fr]">
        <Card title="본문" help={{ kind: "panel", id: "rules.body" }}>
          <nav className="mb-2 flex flex-wrap gap-1.5 text-xs">
            {chapters.map(({ b, i }) => (
              <a key={i} href={`#ch-${i}`} className="rounded border border-[var(--line)] px-2 py-1 hover:bg-[var(--surface-2)]">
                {b.slice(3).replace(/^제\d+장 /, "")}
              </a>
            ))}
          </nav>
          <div className="text-sm leading-relaxed">
            <RulesBody text={RULES_TEXT} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="내 확인" help={{ kind: "panel", id: "rules.ack" }}>
            {mine ? (
              <p className="text-sm">
                <Badge tone="ok">확인함</Badge> {seoulDate(mine)}에 이 판을 확인했습니다.
              </p>
            ) : (
              <form action={ackRulesAction} className="space-y-2">
                <p className="text-sm">본문을 끝까지 읽은 뒤 서명하세요. 궁금한 점은 먼저 회계 담당이나 대표에게 물어보세요.</p>
                <SignaturePad hint="이 칸에 본인이 서명합니다" />
                <SubmitButton>읽었고 확인합니다</SubmitButton>
              </form>
            )}
          </Card>
          {staff && (
            <Card title="직원별 확인" help={{ kind: "panel", id: "rules.status" }}>
              <ul className="divide-y divide-[var(--line)] text-sm">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1.5">
                    <Link href={`/staff/${p.id}`} className="text-[var(--accent)]">
                      {p.name}
                    </Link>
                    {acks.get(p.id) ? <span className="text-xs text-[var(--muted)]">{seoulDate(acks.get(p.id)!)}</span> : <Badge tone="warn">미확인</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
