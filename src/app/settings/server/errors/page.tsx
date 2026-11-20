import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { ERROR_KIND_LABEL, ERROR_KINDS, KEEP_DAYS, errorGroups, errorRecent, type ErrorKind } from "@/modules/platform/error-log";
import { requireUser } from "../../../_lib/session";
import { TextField } from "../../../_input";
import { Badge, buttonClass, Card, PageTitle, fmtTime } from "../../../_ui";

const PERIODS = [
  { days: 1, label: "오늘·어제" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: KEEP_DAYS, label: `${KEEP_DAYS}일` },
];
const TONE: Record<string, "danger" | "warn" | "neutral" | "accent"> = { app: "danger", browser: "warn", server: "danger", db: "danger", caddy: "warn", system: "danger" };

/** 설정 › 서버 › 오류 기록(대표 요청 2026-11-20): 앱·서버에서 난 오류를 묶어 보고, 오류 번호로 찾는다 */
export default async function ServerErrorsPage({ searchParams }: { searchParams: Promise<{ days?: string; kind?: string; q?: string; fp?: string }> }) {
  await requireUser(["owner"]);
  const sp = await searchParams;
  const days = PERIODS.some((p) => String(p.days) === sp.days) ? Number(sp.days) : 7;
  const kind = (ERROR_KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind! : "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const fp = sp.fp ?? "";
  const db = await getDb();
  const groups = await errorGroups(db, { days: fp ? KEEP_DAYS : days, kind, q, fp });
  // 펼친 묶음(맨 위 3개, 또는 알림에서 온 묶음)의 최근 기록
  const open = fp ? groups.filter((g) => g.fingerprint === fp) : groups.slice(0, 3);
  const recent = new Map(await Promise.all(open.map(async (g) => [g.fingerprint, await errorRecent(db, g.fingerprint)] as const)));
  const ids = [...new Set([...groups.map((g) => g.userId), ...[...recent.values()].flat().map((r) => r.userId)].filter((x): x is string => !!x))];
  const names = new Map(ids.length ? (await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids))).map((u) => [u.id, u.name]) : []);
  const href = (o: { days?: number; kind?: string }) => {
    const u = new URLSearchParams();
    u.set("days", String(o.days ?? days));
    const k = o.kind ?? kind;
    if (k) u.set("kind", k);
    if (q) u.set("q", q);
    return `/settings/server/errors?${u}`;
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line-strong)]"}`;
  const total = groups.reduce((a, g) => a + g.n, 0);
  return (
    <>
      <PageTitle
        help="settings.serverErrors"
        sub="앱 화면·저장 중 오류와 서버(앱 프로그램·DB·관문·미니 PC)의 오류를 같은 것끼리 묶어 봅니다. 직원이 알려 준 오류 번호로 찾을 수 있습니다."
        actions={
          <Link href="/settings/server" className={buttonClass("secondary")}>
            서버로
          </Link>
        }
      >
        오류 기록
      </PageTitle>
      <Card title="찾기" help={{ kind: "panel", id: "server.errors" }}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Link key={p.days} href={href({ days: p.days })} className={chip(!fp && p.days === days)}>
                {p.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ kind: "" })} className={chip(!kind)}>
              모든 종류
            </Link>
            {ERROR_KINDS.map((k) => (
              <Link key={k} href={href({ kind: k })} className={chip(kind === k)}>
                {ERROR_KIND_LABEL[k]}
              </Link>
            ))}
          </div>
          <form action="/settings/server/errors" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="days" value={days} />
            {kind && <input type="hidden" name="kind" value={kind} />}
            <div className="min-w-0 flex-1">
              <TextField help="server.errorQ" name="q" defaultValue={q} />
            </div>
            <button type="submit" className={buttonClass("secondary")}>
              찾기
            </button>
          </form>
          {fp && (
            <p className="text-xs text-[var(--muted)]">
              알림에서 연 오류 하나만 보고 있습니다. <Link href={href({})} className="underline">모두 보기</Link>
            </p>
          )}
        </div>
      </Card>
      <div className="mt-4">
        <Card title={`오류 ${groups.length}가지 · ${total.toLocaleString("ko-KR")}번`} help={{ kind: "panel", id: "server.errorList" }}>
          {groups.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {groups.map((g) => {
                const rows = recent.get(g.fingerprint);
                return (
                  <li key={g.fingerprint} className="py-2">
                    <details open={!!rows}>
                      <summary className="cursor-pointer text-sm">
                        <span className="mr-1.5">
                          <Badge tone={TONE[g.kind] ?? "neutral"}>{ERROR_KIND_LABEL[g.kind as ErrorKind] ?? g.kind}</Badge>
                        </span>
                        <b className="tabular-nums">{g.n.toLocaleString("ko-KR")}번</b>
                        <span className="ml-2 break-words">{g.message}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          마지막 {fmtTime(g.lastAt)}
                          {g.n > 1 && <> · 처음 {fmtTime(g.firstAt)}</>}
                          {g.path && <> · {g.path}</>}
                          {g.userId && <> · {names.get(g.userId) ?? "알 수 없는 사용자"}</>}
                          {g.code && <> · 오류 번호 <span className="font-mono">{g.code}</span></>}
                        </span>
                      </summary>
                      {rows ? (
                        <ol className="mt-2 space-y-2">
                          {rows.map((r) => (
                            <li key={r.id} className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-xs">
                              <p className="text-[var(--muted)]">
                                {fmtTime(r.at)}
                                {r.path && <> · {r.path}</>}
                                {r.userId && <> · {names.get(r.userId) ?? "알 수 없는 사용자"}</>}
                                {r.code && <> · 오류 번호 <span className="font-mono">{r.code}</span></>}
                              </p>
                              <p className="mt-1 break-words">{r.message}</p>
                              {r.detail && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[var(--muted)]">자세히(개발용)</summary>
                                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">{r.detail}</pre>
                                </details>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-xs">
                          <Link href={`/settings/server/errors?fp=${encodeURIComponent(g.fingerprint)}`} className="underline">
                            최근 기록 보기
                          </Link>
                        </p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">이 기간에 기록된 오류가 없습니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
