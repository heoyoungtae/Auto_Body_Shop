import Link from "next/link";
import { can } from "@/modules/auth/permissions";
import { BANK_GUIDE, GUIDE_CHECKED_ON } from "@/modules/help/bank-guide";
import { requireUser } from "../../../_lib/session";
import { buttonClass, Card, PageTitle } from "../../../_ui";

/** 통장·카드·홈택스 연동 설명서: 휴대폰 기종별 문자 전달 설정, 은행·카드사·홈택스 엑셀 받는 길, 맞추기, 유료 연동 비교 */
export default async function BankGuidePage() {
  const user = await requireUser();
  const mine = can(user, "bank.view");
  return (
    <>
      <PageTitle
        help="bank.guide"
        sub={`문자 연동(안드로이드·아이폰)과 엑셀 올리기를 처음부터 끝까지 따라 하는 순서입니다. 은행·카드사·홈택스 메뉴 이름은 ${GUIDE_CHECKED_ON}에 확인한 것이며, 바뀌었으면 비슷한 이름을 찾으세요.`}
        actions={
          mine ? (
            <>
              <Link href="/money/bank/settings" className={buttonClass("primary")}>
                연동 설정 열기
              </Link>
              <Link href="/money/bank/upload" className={buttonClass("secondary")}>
                엑셀 올리기
              </Link>
            </>
          ) : undefined
        }
      >
        통장·카드 연동 설명서
      </PageTitle>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="설명서 차례">
        {BANK_GUIDE.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-md border border-[var(--line)] px-3 py-1.5 hover:border-[var(--accent)]">
            {s.title.replace(/:.*$/, "")}
          </a>
        ))}
      </nav>
      <div className="space-y-4">
        {BANK_GUIDE.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <Card title={s.title} help={{ kind: "panel", id: "bank.guideSection" }}>
              <p className="text-sm leading-relaxed">{s.intro}</p>
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                {s.blocks.map((b) => (
                  <div key={b.title} className="rounded-md border border-[var(--line)] p-3">
                    <h3 className="text-sm font-semibold">{b.title}</h3>
                    {b.note && <p className="mt-1 rounded bg-[var(--warn-soft)] px-2 py-1 text-xs leading-relaxed">{b.note}</p>}
                    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                      {b.steps.map((st) => (
                        <li key={st.t}>
                          <span className="font-medium">{st.t}</span>
                          {st.d && <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{st.d}</p>}
                        </li>
                      ))}
                    </ol>
                    {b.links && (
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {b.links.map((l) => (
                          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                            {l.label}
                          </a>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {s.tips && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
                  {s.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
