// 홈페이지 이용약관·처리방침 공용 화면: 고른 판(또는 시행 중인 판)을 그리고, 시행일·바뀔 예정·지난 판 목록을 붙인다.
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { LEGAL_KINDS, type LegalDoc, type LegalKind } from "@/modules/site/legal";
import { legalPage } from "@/modules/site/legal-live";
import { EditFab, SiteTitle } from "./_parts";
import type { PageHelpKey } from "@/modules/help/pages";

const ko = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : d);

export function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <ol className="space-y-7">
      {doc.sections.map((s, i) => (
        <li key={i}>
          <h2 className="mb-2 text-lg font-bold">
            제{i + 1}조 {s.t}
          </h2>
          <div className="space-y-2">
            {s.blocks.map((b, j) =>
              "p" in b ? (
                <p key={j}>{b.p}</p>
              ) : "ul" in b ? (
                <ul key={j} className="list-disc space-y-1 pl-5">
                  {b.ul.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : "table" in b ? (
                <table key={j} className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line-strong)] text-left">
                      {b.table.head.map((h) => (
                        <th key={h} className="py-2 pr-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {b.table.rows.map((r, k) => (
                      <tr key={k}>
                        {r.map((c, m) => (
                          <td key={m} className="py-2 pr-2">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p key={j} className="text-sm text-[var(--muted)]">
                  {b.note}
                </p>
              ),
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export async function LegalScreen({ kind, v, help, eyebrow, after }: { kind: LegalKind; v?: string; help: PageHelpKey; eyebrow: string; after?: ReactNode }) {
  const { doc, from, viewing, state, other } = await legalPage(await getDb(), kind, v);
  const meta = LEGAL_KINDS.find((x) => x.kind === kind)!;
  const all = [...(state.next ? [state.next] : []), ...(state.now ? [state.now] : []), ...state.past];
  return (
    <article className="mx-auto max-w-3xl leading-relaxed">
      <EditFab to={kind === "terms" ? "/settings/site/pages?g=terms" : "/settings/site/legal"} label={kind === "terms" ? "약관 문구 고치기" : "처리방침 판 관리"} />
      <SiteTitle eyebrow={eyebrow} help={help} sub={doc.intro}>
        {meta.title}
      </SiteTitle>
      {other && (
        <p role="note" className="mb-6 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-sm">
          {other === "next" ? `${ko(from)}부터 시행할 ${meta.title}입니다. 그 전까지는 ` : `${ko(from)}부터 쓰던 지난 ${meta.title}입니다. 지금은 `}
          <Link href={meta.path} className="font-medium underline">
            시행 중인 {meta.title}
          </Link>
          을 따릅니다.
        </p>
      )}
      {!other && state.next && (
        <p role="note" className="mb-6 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-sm">
          {ko(state.next.from)}부터 {meta.title}이 바뀝니다.{" "}
          <Link href={`${meta.path}?v=${state.next.id}`} className="font-medium underline">
            바뀌는 내용 보기
          </Link>
        </p>
      )}
      <LegalBody doc={doc} />
      <p className="mt-8 text-sm text-[var(--muted)]">
        시행일: {ko(from)} · {doc.sign}
      </p>
      {after}
      {all.length > 1 && (
        <section className="mt-8 rounded-lg border border-[var(--line)] p-4 text-sm">
          <h2 className="mb-2 font-medium">모든 판</h2>
          <ul className="space-y-1">
            {all.map((x) => (
              <li key={x.id}>
                <Link
                  href={x.id === state.now?.id ? meta.path : `${meta.path}?v=${x.id}`}
                  aria-current={x.id === viewing?.id ? "page" : undefined}
                  className={x.id === viewing?.id ? "font-semibold" : "text-[var(--accent)] underline"}
                >
                  {ko(x.from)} 시행
                </Link>
                <span className="ml-2 text-[var(--muted)]">{x.id === state.now?.id ? "지금 시행 중" : x.id === state.next?.id ? "시행 예정" : "지난 판"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
