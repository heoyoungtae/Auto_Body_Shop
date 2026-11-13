import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ACCOUNTS, acctName, FUND_KINDS, OPENING_CODES } from "@/modules/acct/accounts";
import { canBooks, fundSeedFromTx, getOpening, listFundSlips, txNeedingFund } from "@/modules/acct/service";
import { TX_CLASSES } from "@/modules/bank/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { fundAction, openingAction } from "./actions";
import { FundKindPicker } from "./kind-picker";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const REPORTS = [
  ["pl", "손익계산서"],
  ["bs", "재무상태표"],
  ["cashflow", "현금흐름표"],
  ["funds", "자금일보"],
  ["ledger", "계정별 원장"],
] as const;

/** 회계 장부(보고서 센터 4단계): 개업일 기초 잔액, 자금 전표. 나머지 분개는 앱 전표에서 저절로 */
export default async function BooksPage({ searchParams }: { searchParams: Promise<{ tx?: string; notice?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!canBooks(user))
    return (
      <>
        <PageTitle help="books">회계 장부</PageTitle>
        <p className="text-sm text-[var(--muted)]">회계 장부는 회계 담당·대표가 적습니다.</p>
      </>
    );
  const db = await getDb();
  const op = await getOpening(db);
  const slips = await listFundSlips(db);
  const todo = await txNeedingFund(db);
  const seed = q.tx ? await fundSeedFromTx(db, q.tx) : null;
  const today = seoulDate();
  const opAsset = OPENING_CODES.filter((c) => ACCOUNTS.find((a) => a.code === c)?.type === "asset" && c !== "213").reduce((t, c) => t + (op.byCode.get(c) ?? 0), 0) - (op.byCode.get("213") ?? 0);
  const opLiab = OPENING_CODES.filter((c) => ACCOUNTS.find((a) => a.code === c)?.type === "liability").reduce((t, c) => t + (op.byCode.get(c) ?? 0), 0);
  const manual = ACCOUNTS.filter((a) => a.manual).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));
  const kinds = Object.entries(FUND_KINDS).map(([k, v]) => ({ value: k, label: v.label, dr: v.dr, cr: v.cr }));
  return (
    <>
      <PageTitle
        help="books"
        std="STD-12"
        sub="매출·수납·지출·외상·급여·감가상각·재고는 앱 전표에서 저절로 분개합니다. 여기서는 개업일 기초 잔액(한 번)과, 앱 전표가 없는 돈(자본금·대출·이자·세금 납부·대표 입출금 등)만 적습니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {REPORTS.map(([id, t]) => (
              <Link key={id} href={`/reports/${id}`} className={buttonClass("secondary")}>
                {t}
              </Link>
            ))}
          </div>
        }
      >
        회계 장부
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <ErrorBox message={q.error} />

      {todo.length > 0 && (
        <Card title={`통장 내역에서 자금 전표로 적을 것 ${todo.length}건`} help={{ kind: "panel", id: "books.tx" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {todo.slice(0, 20).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="text-xs text-[var(--muted)]">{t.on}</span>
                <Badge tone={t.kind === "in" ? "ok" : "neutral"}>{t.kind === "in" ? "입금" : "출금"}</Badge>
                <b className="tabular-nums">{won(t.amountWon)}</b>
                <span>{t.party ?? ""}</span>
                <Badge tone="accent">{TX_CLASSES[t.cls as keyof typeof TX_CLASSES]?.label ?? t.cls}</Badge>
                <Link href={`/money/books?tx=${t.id}#fund`} className="text-[var(--accent)]">
                  자금 전표로 적기
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div id="fund">
        <Card title={seed ? "자금 전표 쓰기(통장 거래에서 불러옴)" : "자금 전표 쓰기"} help={{ kind: "panel", id: "books.fund" }}>
          {seed?.matched ? (
            <p className="text-sm">이 통장 거래는 이미 자금 전표 {seed.matched}로 적었습니다.</p>
          ) : (
            <AssistForm id="fund-new" action={fundAction} className="grid gap-3 md:grid-cols-2">
              {seed && <input type="hidden" name="tx" value={seed.txId} />}
              <DateField help="fund.on" name="on" required defaultValue={seed?.on ?? today} quick={["today"]} from={seed ? "통장 거래" : undefined} />
              <NumberField help="fund.amountWon" name="amountWon" required unit="원" min={1} defaultValue={seed?.amountWon} from={seed ? "통장 거래" : undefined} />
              <FundKindPicker kinds={kinds} accounts={manual} defaultKind={seed?.kind ?? ""} />
              <div className="md:col-span-2">
                <TextField help="fund.memo" name="memo" defaultValue={seed?.memo} from={seed ? "통장 거래" : undefined} />
              </div>
              <div className="md:col-span-2">
                <SubmitButton>자금 전표 적기</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>
      </div>

      <Card title="자금 전표" help={{ kind: "panel", id: "books.list" }}>
        {slips.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">날짜</th>
                  <th className="py-1.5 pr-2 font-medium">번호</th>
                  <th className="py-1.5 pr-2 font-medium">차변 / 대변</th>
                  <th className="py-1.5 pr-2 text-right font-medium">금액</th>
                  <th className="py-1.5 pr-2 font-medium">적요</th>
                  <th className="py-1.5 pr-2 font-medium">쓴 사람</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {slips.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--line)] align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{f.on}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {f.docNo} {f.reversalOf && <Badge tone="warn">취소 전표</Badge>} {f.cancelled && <Badge>취소됨</Badge>} {f.bankTxId && <Badge tone="accent">통장</Badge>}
                    </td>
                    <td className="py-1.5 pr-2">
                      {acctName(f.drCode)} / {acctName(f.crCode)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{won(f.amountWon)}</td>
                    <td className="py-1.5 pr-2">{f.memo}</td>
                    <td className="py-1.5 pr-2">{f.byName}</td>
                    <td className="py-1.5">
                      {!f.reversalOf && !f.cancelled && (
                        <details>
                          <summary className="cursor-pointer text-xs text-[var(--danger)]">취소</summary>
                          <AssistForm id={`fund-cancel-${f.id}`} action={fundAction} className="mt-2 grid gap-2" bar={false}>
                            <input type="hidden" name="intent" value="cancel" />
                            <input type="hidden" name="id" value={f.id} />
                            <TextField help="fund.reason" name="reason" required />
                            <SubmitButton variant="danger">취소 전표 적기</SubmitButton>
                          </AssistForm>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>아직 자금 전표가 없습니다. 개업 때 넣은 자본금은 기초 잔액으로, 그 뒤의 대출·이자·세금 납부 등은 위에서 적습니다.</Empty>
        )}
      </Card>

      <Card title={op.on ? `기초 잔액(${op.on})` : "개업일 기초 잔액"} help={{ kind: "panel", id: "books.opening" }}>
        <p className="mb-3 text-sm text-[var(--muted)]">
          개업일에 가진 돈·물건·빚을 한 번 적습니다. 재고는 재고 품목 '처음 등록' 수량으로 저절로 들어가므로 여기 적지 않습니다. 자본금은 자산 − 부채로 맞춥니다
          {op.on ? (
            <>
              {" "}
              (지금: 자산 {won(opAsset)} − 부채 {won(opLiab)} = 자본금 <b>{won(opAsset - opLiab)}</b>)
            </>
          ) : null}
          .
        </p>
        <AssistForm id="opening" action={openingAction} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <DateField help="books.openOn" name="openOn" required defaultValue={op.on ?? undefined} quick={["today"]} />
          </div>
          {OPENING_CODES.map((c) => {
            const a = ACCOUNTS.find((x) => x.code === c)!;
            return <NumberField key={c} help="books.open" name={`o_${c}`} label={`${a.code} ${a.name}${a.type === "liability" ? "(부채)" : c === "213" ? "(빼는 금액)" : ""}`} unit="원" min={0} defaultValue={op.byCode.get(c) ?? null} />;
          })}
          <div className="md:col-span-2">
            <SubmitButton>기초 잔액 저장</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
