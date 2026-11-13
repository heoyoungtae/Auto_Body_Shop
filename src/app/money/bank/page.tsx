import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { payment } from "@/db/schema";
import { CLS_FUND } from "@/modules/acct/accounts";
import { canBooks } from "@/modules/acct/service";
import { can } from "@/modules/auth/permissions";
import { TX_CLASSES, TX_KINDS, accountLabel, type TxKind } from "@/modules/bank/rules";
import { bankFlows, listTx, loadFeed, runMatching, type Cand, type TxFilter } from "@/modules/bank/service";
import { addDays, seoulDate } from "@/modules/platform/time";
import { SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { txAction } from "./actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const CLS_OPTS = Object.entries(TX_CLASSES).map(([value, c]) => ({ value, label: c.label }));
const SOURCE: Record<string, string> = { sms: "문자", file: "엑셀", api: "자동 연동", manual: "손으로" };
const KIND_TONE: Record<string, "ok" | "danger" | "warn" | "accent" | "neutral"> = { in: "ok", out: "danger", card: "warn", card_cancel: "neutral", tax_sale: "accent", tax_buy: "accent", cash_sale: "accent", cash_buy: "accent", card_buy: "accent" };

type Q = { f?: string; kind?: string; account?: string; from?: string; to?: string; q?: string; notice?: string; error?: string };

/** 통장·카드·홈택스 내역(STD-12): 문자·엑셀로 들어온 거래와 앱 전표를 맞춘다 */
export default async function BankPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const canFund = canBooks(user);
  if (!can(user, "bank.view")) return <p className="text-sm text-[var(--muted)]">통장·카드 내역은 회계 담당·대표가 봅니다.</p>;
  const db = await getDb();
  await runMatching(db); // 그사이 적은 전표(수납·지급)와 저절로 잇기
  const today = seoulDate();
  const filter: TxFilter = q.f === "done" || q.f === "all" ? q.f : "todo";
  const cfg = await loadFeed(db);
  const { list, sum, from, to } = await listTx(db, user, { filter, from: q.from, to: q.to, account: q.account, kind: q.kind, q: q.q });
  const flows = await bankFlows(db, from, to);
  // 맞춘 입금 전표가 어느 수리 건인지(바로 가기)
  const payIds = list.filter((x) => x.t.matchKind === "payment" && x.t.matchId).map((x) => x.t.matchId!);
  const roOf = new Map((payIds.length ? await db.select({ id: payment.id, ro: payment.repairOrderId }).from(payment).where(inArray(payment.id, payIds)) : []).map((p) => [p.id, p.ro]));
  const keep = (over: Partial<Q>) => {
    const p = new URLSearchParams();
    const m = { f: filter, kind: q.kind, account: q.account, from: q.from, to: q.to, q: q.q, ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/money/bank?${p}`;
  };
  const back = keep({});
  const tab = (label: string, href: string, on: boolean) => (
    <Link href={href} className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
      {label}
    </Link>
  );
  const ym = today.slice(0, 7);
  const prevYmFirst = addDays(`${ym}-01`, -1).slice(0, 7);
  const tile = (label: string, v: string, tone = "") => (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{v}</p>
    </div>
  );
  const hidden = (txId: string, intent: string) => (
    <>
      <input type="hidden" name="txId" value={txId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  const candButton = (txId: string, c: Cand) => {
    if (c.act === "receipt")
      return (
        <Link href={`/money/ro/${c.id}?tx=${txId}#pay`} className={buttonClass("secondary")}>
          수납 적기
        </Link>
      );
    if (c.act === "claim")
      return (
        <form action={txAction} className="flex flex-wrap items-end gap-2">
          {hidden(txId, "claim")}
          <input type="hidden" name="roId" value={c.id} />
          {(c.cutWon ?? 0) > 0 && <TextField help="bank.cutReason" name="cutReason" required />}
          <div>
            <SubmitButton>보험 입금 확인</SubmitButton>
          </div>
        </form>
      );
    return (
      <form action={txAction}>
        {hidden(txId, c.act === "link" ? "link" : c.act)}
        <input type="hidden" name="kind" value={c.kind} />
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="no" value={c.no} />
        <input type="hidden" name="note" value={c.note ?? ""} />
        <SubmitButton>{c.act === "pay" ? "지급 처리" : c.act === "payroll" ? "급여 지급 처리" : "잇기"}</SubmitButton>
      </form>
    );
  };
  const matchHref = (kind: string | null, id: string | null) => {
    if (!kind || !id) return null;
    if (kind === "expense") return `/money/expenses/${id}`;
    if (kind === "payment") return roOf.get(id) ? `/money/ro/${roOf.get(id)}` : null;
    if (kind === "payable") return "/money/payables";
    if (kind === "payroll") return "/payroll";
    if (kind === "fund") return "/money/books";
    if (kind === "tx") return `#tx-${id}`;
    return null;
  };
  return (
    <>
      <PageTitle
        help="bank"
        sub="휴대폰 알림 문자와 은행·카드사·홈택스 엑셀로 들어온 거래입니다. 전표와 짝이 확실하면 저절로 잇고, 남은 것은 아래 후보 단추로 맞춥니다. 같은 거래가 문자·엑셀로 두 번 와도 한 줄입니다."
        actions={
          <>
            <Link href="/money/bank/upload" className={buttonClass("primary")}>
              엑셀 올리기
            </Link>
            <Link href="/money/bank/settings" className={buttonClass("secondary")}>
              연동 설정
            </Link>
            <Link href="/money/bank/guide" className={buttonClass("secondary")}>
              설명서
            </Link>
          </>
        }
      >
        통장·카드 내역
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!cfg.accounts.length && (
        <div className="mb-4 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
          아직 등록한 통장·카드가 없습니다.{" "}
          <Link href="/money/bank/settings" className="font-semibold text-[var(--accent)]">
            연동 설정
          </Link>
          에서 사업용 통장·카드를 먼저 등록하세요.{" "}
          <Link href="/money/bank/guide" className="text-[var(--accent)]">
            설명서 보기
          </Link>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {tile("입금", won(sum.in), "text-[var(--ok)]")}
        {tile("출금", won(sum.out), "text-[var(--danger)]")}
        {tile("카드 사용(취소 뺌)", won(sum.card))}
        {tile("맞출 것(이 목록)", `${sum.todo}건`, sum.todo ? "text-[var(--warn)]" : "")}
        {flows.balances.map((b) => tile(`${b.label} 잔액(${b.on})`, won(b.bal)))}
      </div>
      <Card title="거르기" help={{ kind: "panel", id: "bank.filter" }}>
        <div className="flex flex-wrap items-center gap-2">
          {tab("맞출 것", keep({ f: "todo" }), filter === "todo")}
          {tab("맞춘 것", keep({ f: "done" }), filter === "done")}
          {tab("전체", keep({ f: "all" }), filter === "all")}
          <span className="mx-1 text-[var(--line-strong)]">|</span>
          {tab("모든 종류", keep({ kind: "" }), !q.kind)}
          {tab("통장", keep({ kind: "bank" }), q.kind === "bank")}
          {tab("카드", keep({ kind: "card" }), q.kind === "card")}
          {tab("홈택스", keep({ kind: "hometax" }), q.kind === "hometax")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {tab("최근 60일", keep({ from: "", to: "" }), !q.from && !q.to)}
          {tab("이번 달", keep({ from: `${ym}-01`, to: today }), q.from === `${ym}-01`)}
          {tab("지난달", keep({ from: `${prevYmFirst}-01`, to: addDays(`${ym}-01`, -1) }), q.from === `${prevYmFirst}-01`)}
          {tab("1년", keep({ from: addDays(today, -365), to: today }), !!q.from && q.from === addDays(today, -365))}
          {cfg.accounts.length > 1 && (
            <>
              <span className="mx-1 text-[var(--line-strong)]">|</span>
              {tab("모든 통장·카드", keep({ account: "" }), !q.account)}
              {cfg.accounts.map((a) => tab(accountLabel(a), keep({ account: a.id }), q.account === a.id))}
            </>
          )}
          <form action="/money/bank" className="ml-auto flex items-center gap-1">
            {Object.entries({ f: filter, kind: q.kind, account: q.account, from: q.from, to: q.to }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <input type="search" name="q" defaultValue={q.q} placeholder="상대방·금액·전표 번호" className="h-9 w-48 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2" />
            <button className={buttonClass("secondary")}>찾기</button>
          </form>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {from} ~ {to} · 최대 500줄
        </p>
      </Card>
      <div className="mt-4">
        <Card title={filter === "todo" ? "맞출 것" : filter === "done" ? "맞춘 것" : "모든 거래"} help={{ kind: "panel", id: "bank.list" }}>
          {list.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {list.map(({ t, cands }) => {
                const href = matchHref(t.matchKind, t.matchId);
                const inflow = t.kind === "in" || t.kind === "tax_sale" || t.kind === "cash_sale";
                const canExpense = ["out", "card", "tax_buy", "cash_buy", "card_buy"].includes(t.kind);
                return (
                  <li key={t.id} id={`tx-${t.id}`} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums text-[var(--muted)]">
                        {t.on}
                        {t.at ? ` ${t.at}` : ""}
                      </span>
                      <Badge tone={KIND_TONE[t.kind] ?? "neutral"}>{TX_KINDS[t.kind as TxKind] ?? t.kind}</Badge>
                      <b className={`tabular-nums ${inflow ? "text-[var(--ok)]" : ""}`}>
                        {inflow ? "+" : t.kind === "card_cancel" ? "−" : ""}
                        {won(t.amountWon)}
                      </b>
                      <span className="font-medium">{t.party ?? "(상대방 없음)"}</span>
                      {t.memo && <span className="text-xs text-[var(--muted)]">{t.memo}</span>}
                      <span className="text-xs text-[var(--muted)]">
                        {t.accountLabel ?? ""}
                        {t.balanceWon != null ? ` · ${t.kind === "card" || t.kind === "card_cancel" ? "누적" : "잔액"} ${won(t.balanceWon)}` : ""}
                        {t.approvalNo ? ` · 승인 ${t.approvalNo}` : ""}
                        {t.partyBizNo ? ` · 사업자 ${t.partyBizNo}` : ""}
                      </span>
                      <Badge>{SOURCE[t.source] ?? t.source}</Badge>
                    </div>
                    {t.matchKind ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        {t.matchKind === "class" ? (
                          <Badge tone="accent">분류: {TX_CLASSES[t.cls as keyof typeof TX_CLASSES]?.label ?? t.cls}</Badge>
                        ) : (
                          <Badge tone="ok">
                            맞춤: {t.matchNo}
                            {t.matchNote ? ` ${t.matchNote}` : ""}
                          </Badge>
                        )}
                        {t.matchKind === "class" && t.matchNote && <span className="text-xs">{t.matchNote}</span>}
                        {t.matchKind === "class" && t.cls && CLS_FUND[t.cls]?.[t.kind === "in" ? "in" : "out"] && (t.kind === "in" || t.kind === "out") && canFund && (
                          <Link href={`/money/books?tx=${t.id}#fund`} className="text-xs text-[var(--accent)]">
                            자금 전표로 적기
                          </Link>
                        )}
                        {href && (
                          <Link href={href} className="text-xs text-[var(--accent)]">
                            열기
                          </Link>
                        )}
                        <span className="text-xs text-[var(--muted)]">{t.matchedAuto ? "저절로" : "사람이"}</span>
                        <form action={txAction}>
                          {hidden(t.id, "unlink")}
                          <button className="text-xs text-[var(--danger)] underline">연결 풀기</button>
                        </form>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2 rounded-md bg-[var(--surface-2)] px-3 py-2">
                        {cands.length > 0 ? (
                          <ul className="space-y-2">
                            {cands.map((c) => (
                              <li key={`${c.kind}-${c.id}-${c.note ?? ""}`} className="flex flex-wrap items-center gap-2 text-sm">
                                <span>{c.label}</span>
                                {c.cutWon ? <Badge tone="warn">{won(c.cutWon)} 덜 들어옴</Badge> : null}
                                {candButton(t.id, c)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[var(--muted)]">앱에서 짝을 찾지 못했습니다.{canExpense ? " 결의서가 없으면 아래 '결의서 쓰기', 전표가 없는 돈이면 '분류'를 합니다." : t.kind === "in" ? " 수납을 아직 안 적었으면 그 수리 건의 수납 화면에서 적고, 전표가 없는 돈이면 분류합니다." : ""}</p>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                          {canExpense && (
                            <Link href={`/money/expenses/new?tx=${t.id}`} className={buttonClass("secondary")}>
                              결의서 쓰기
                            </Link>
                          )}
                          <form action={txAction} className="flex flex-wrap items-end gap-2">
                            {hidden(t.id, "class")}
                            <SelectField help="bank.cls" name="cls" required placeholder="분류 고르기" options={CLS_OPTS} />
                            <TextField help="bank.note" name="note" />
                            <div>
                              <SubmitButton variant="secondary">분류</SubmitButton>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                    {t.raw && (
                      <details className="mt-1 text-xs text-[var(--muted)]">
                        <summary className="cursor-pointer">받은 문자</summary>
                        <pre className="whitespace-pre-wrap">{t.raw}</pre>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty action={<Link href="/money/bank/upload" className={buttonClass("secondary")}>엑셀 올리기</Link>}>{filter === "todo" ? "맞출 거래가 없습니다." : "이 기간에 거래가 없습니다."}</Empty>
          )}
        </Card>
      </div>
      {flows.groups.length > 0 && (
        <div className="mt-4">
          <Card title="돈의 흐름(이 기간 통장)" help={{ kind: "panel", id: "bank.flows" }}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">무엇</th>
                  <th className="pr-2">구분</th>
                  <th className="pr-2 text-right">들어옴</th>
                  <th className="pr-2 text-right">나감</th>
                  <th className="text-right">건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {flows.groups.map((g) => (
                  <tr key={g.key}>
                    <td className="py-1.5 pr-2">{g.label}</td>
                    <td className="pr-2 text-xs text-[var(--muted)]">{g.flow}</td>
                    <td className="pr-2 text-right tabular-nums">{g.inWon ? won(g.inWon) : "-"}</td>
                    <td className="pr-2 text-right tabular-nums">{g.outWon ? won(g.outWon) : "-"}</td>
                    <td className="text-right tabular-nums">{g.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
