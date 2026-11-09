import Link from "next/link";
import { getDb } from "@/db/runtime";
import { and, inArray } from "drizzle-orm";
import { fixtureEvent } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { listFixtures } from "@/modules/purchase/fixture";
import { CHECK_RESULTS, FX_STATUS, FX_TONE, type FxStatus } from "@/modules/purchase/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { fixtureAction } from "../actions";

/** 연 1회(12월) 실물 확인(9.5): 대장 순서대로 보고 '있음'을 누른다. 없거나 부서졌으면 비품 화면에서 경위와 함께 적는다 */
export default async function FixtureCheckPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await listFixtures(db, user, "active");
  const year = seoulDate().slice(0, 4);
  const ids = rows.map((r) => r.f.id);
  const ev = ids.length ? await db.select({ id: fixtureEvent.fixtureId, at: fixtureEvent.at }).from(fixtureEvent).where(and(inArray(fixtureEvent.fixtureId, ids), inArray(fixtureEvent.kind, ["check", "lost", "broken"]))) : [];
  const done = new Set(ev.filter((e) => seoulDate(e.at).startsWith(year)).map((e) => e.id));
  const left = rows.filter((r) => !done.has(r.f.id));
  return (
    <>
      <PageTitle
        help="fixtures.check"
        sub={`${year}년 실물 확인: ${rows.length - left.length}/${rows.length}개 끝. 대장 순서대로 실물을 보고 '있음'을 누릅니다. 없거나 부서졌으면 비품 이름을 눌러 경위를 적습니다(대표에게 보고).`}
        actions={
          <Link href="/fixtures" className="text-sm text-[var(--accent)]">
            ← 비품·자산
          </Link>
        }
      >
        비품 실물 확인
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!can(user, "fixture.manage") ? (
        <p className="text-sm text-[var(--muted)]">실물 확인은 회계 담당이 합니다.</p>
      ) : (
        <Card title={`남은 비품 ${left.length}개`} help={{ kind: "panel", id: "fx.check" }}>
          {left.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {left.map(({ f, holderName }) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/fixtures/${f.id}`} className="font-mono text-xs text-[var(--accent)]">
                    {f.no}
                  </Link>
                  <span>{f.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {f.location ?? "-"} · {holderName ?? "공용"}
                  </span>
                  <Badge tone={FX_TONE[f.status as FxStatus]}>{FX_STATUS[f.status as FxStatus]}</Badge>
                  <AssistForm id={`fx-ok-${f.id}`} action={fixtureAction} guard={false} className="ml-auto">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="intent" value="check" />
                    <input type="hidden" name="result" value="ok" />
                    <input type="hidden" name="back" value="/fixtures/check" />
                    <SubmitButton variant="secondary">{CHECK_RESULTS.ok}</SubmitButton>
                  </AssistForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">올해 실물 확인을 모두 마쳤습니다.</p>
          )}
        </Card>
      )}
    </>
  );
}
