import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ARCHIVE } from "@/modules/listq/archive";
import { PRESETS, runList, type Q } from "@/modules/listq/core";
import { LISTS } from "@/modules/listq/registry";
import { AssistForm } from "../_assist";
import { SelectField, TextField } from "../_input";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, Card, Empty, PageTitle } from "../_ui";

const AREAS = ["수리·고객", "구매·자재", "돈", "품질·안전", "문서·업무"] as const;
const SHOW = 5;

/** 기록 보관함(STD-Q 8절): 모든 대장·전표를 번호·이름·차량번호·상대로 한 번에 찾고, 한 건을 바로 연다 */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const s = (q.s ?? "").trim();
  const p = q.p && q.p in PRESETS && q.p !== "custom" ? q.p : "all";
  const area = AREAS.find((a) => a === q.a) ?? "";
  const asked = !!s || p !== "all";
  const hist = can(user, "records.history");
  const entries = ARCHIVE.filter((x) => LISTS[x.key]?.allowed(user) && (!area || x.area === area) && (!q.l || x.key === q.l));
  const results = asked
    ? (
        await Promise.all(
          entries.map(async (x) => {
            const def = LISTS[x.key];
            // 상태 탭은 '전체'로(끝난 기록도 찾게). '전체'가 없는 목록은 기본 탭
            const all = def.tabs?.options.find((o) => o.v === "all")?.v;
            const qq: Q = { s, p, ...(def.tabs && all ? { [def.tabs.param]: all } : {}) };
            try {
              const r = await runList(db, def, user, qq);
              return { x, def, r, qq };
            } catch {
              return null;
            }
          }),
        )
      ).filter((v): v is NonNullable<typeof v> => !!v && v.r.count > 0)
    : [];
  const total = results.reduce((n, v) => n + v.r.count, 0);
  const qsOf = (href: string, qq: Q) => `${href}?${new URLSearchParams(Object.entries(qq).filter(([, v]) => v && v !== "all") as [string, string][]).toString()}`;
  return (
    <>
      <PageTitle help="records" std="STD-Q 8절" sub="상담·수리·견적·발주·지출·부적합·법규·문서·수발신 등 모든 대장을 한 번에 찾습니다. 번호(RO-2611-0001), 고객·업체 이름, 차량번호, 제목 무엇이든 넣으세요. 볼 권한이 있는 대장만 찾습니다.">
        기록 보관함
      </PageTitle>
      <Card title="찾기" help={{ kind: "panel", id: "records.search" }}>
        <AssistForm id="records-search" action="/records" method="get" className="grid gap-3 md:grid-cols-4" guard={false} draft={false}>
          <div className="md:col-span-2">
            <TextField help="records.q" name="s" defaultValue={s} />
          </div>
          <SelectField help="records.period" name="p" defaultValue={p} options={Object.entries(PRESETS).filter(([k]) => k !== "custom").map(([value, label]) => ({ value, label }))} />
          <SelectField help="records.area" name="a" defaultValue={area} placeholder="모든 묶음" options={AREAS.map((v) => ({ value: v, label: v }))} />
          <div className="md:col-span-4">
            <SubmitButton>찾기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
      {!asked ? (
        <Card title="대장 목록" help={{ kind: "panel", id: "records.lists" }}>
          <ul className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2 xl:grid-cols-3">
            {entries.map((x) => (
              <li key={x.key} className="flex items-center gap-2">
                <Badge tone="neutral">{x.area}</Badge>
                <Link href={LISTS[x.key].href} className="text-[var(--accent)]">
                  {LISTS[x.key].title}
                </Link>
                {x.form && <span className="text-xs text-[var(--muted)]">{x.form}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ) : results.length ? (
        <Card title={`찾은 기록 ${total.toLocaleString("ko-KR")}건 · 대장 ${results.length}곳`} help={{ kind: "panel", id: "records.results" }}>
          <div className="space-y-4">
            {results.map(({ x, def, r, qq }) => (
              <section key={x.key}>
                <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {def.title}
                  {x.form && <span className="text-xs font-normal text-[var(--muted)]">{x.form}</span>}
                  <Badge tone="accent">{r.count}건</Badge>
                  <Link href={qsOf(def.href, qq)} className="ml-auto text-xs font-normal text-[var(--accent)]">
                    대장에서 모두 보기
                  </Link>
                </h3>
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {r.all.slice(0, SHOW).map((row, i) => {
                    const vals = def.cols.map((c) => c.get(row)).filter((v) => v != null && v !== "");
                    const head = String(vals[0] ?? "");
                    const href = x.open?.(row) ?? qsOf(def.href, { ...qq, s: head });
                    const id = x.open?.(row)?.split("/").pop();
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-2 py-1.5">
                        <Link href={href} className="font-medium text-[var(--accent)]">
                          {head || "(번호 없음)"}
                        </Link>
                        <span className="min-w-0 flex-1 text-[var(--muted)]">{vals.slice(1, 6).join(" · ")}</span>
                        {hist && (
                          <Link href={`/records/history?${new URLSearchParams([["t", `${def.title} ${head}`], ["k", head], ...(id ? [["k", id]] : [])]).toString()}`} className="text-xs text-[var(--accent)]">
                            이력
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {r.count > SHOW && <p className="mt-1 text-xs text-[var(--muted)]">앞 {SHOW}건만 보입니다. 나머지는 &lsquo;대장에서 모두 보기&rsquo;로 봅니다.</p>}
              </section>
            ))}
          </div>
        </Card>
      ) : (
        <Empty>찾는 기록이 없습니다. 번호 일부(예: 2611-0012), 이름, 차량번호 끝 4자리로 다시 찾아보세요.</Empty>
      )}
    </>
  );
}
