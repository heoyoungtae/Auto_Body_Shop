import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { coveredByRegistration, listRecurring } from "@/modules/money/recurring";
import { EVIDENCE_KINDS, EXP_CATEGORIES, EXP_PAY_METHODS } from "@/modules/money/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { listSuppliers } from "@/modules/purchase/supplier";
import { AssistForm } from "../../../_assist";
import { DateField, NumberField, SelectField, TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { recurringAction } from "./actions";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 매달 나가는 돈 정기 결의(간소화, STD-12 12.2) */
export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const ym = today.slice(0, 7);
  const on = (await loadPolicy(db, today))["simple.recurring_expense"] === 1;
  const items = await listRecurring(db);
  const owner = user.roles.includes("owner");
  const drafter = can(user, "expense.draft");
  const sups = owner ? await listSuppliers(db) : [];
  return (
    <>
      <PageTitle
        help="money.recurring"
        sub="임차료·전기·통신·보험료처럼 매달 같은 곳에 나가는 돈입니다. 대표가 한 번 등록하면(등록이 곧 승인) 매달 한 번 눌러 지출 결의서를 올리고, 금액이 지난번과 20% 안이면 대표 결재를 다시 받지 않습니다."
        actions={
          <Link href="/money/expenses" className="text-sm text-[var(--accent)]">
            ← 지출 결의
          </Link>
        }
      >
        정기 결의
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!on && <Notice>설정 › 간소화에서 '매달 나가는 돈 정기 결의'가 꺼져 있습니다. 지출 결의서를 매달 새로 씁니다.</Notice>}
      <div className="mt-4 space-y-4">
        <Card title={`이번 달(${ym})`} help={{ kind: "panel", id: "recur.list" }}>
          {items.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {items.map((x) => {
                const done = x.lastYm === ym;
                const cover = coveredByRegistration(x, x.lastWon ?? x.supplyWon + x.vatWon, today);
                return (
                  <li key={x.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{x.purpose}</b>
                      <span>
                        {x.payeeName} · 매달 {x.day}일 · {EXP_CATEGORIES[x.category as keyof typeof EXP_CATEGORIES] ?? x.category} · {won(x.supplyWon + x.vatWon)}
                      </span>
                      {done ? <Badge tone="ok">이번 달 올림</Badge> : <Badge tone="warn">이번 달 남음</Badge>}
                      <span className="text-xs text-[var(--muted)]">등록 승인 {x.approvedOn}{!cover.ok && ` · ${cover.why}`}</span>
                    </div>
                    {on && drafter && !done && (
                      <AssistForm id={`recur-${x.id}`} action={recurringAction} className="flex flex-wrap items-end gap-3" guard={false}>
                        <input type="hidden" name="intent" value="draft" />
                        <input type="hidden" name="id" value={x.id} />
                        <NumberField help="exp.supplyWon" name="supplyWon" unit="원" min={1} defaultValue={x.lastWon != null ? Math.round((x.lastWon * x.supplyWon) / (x.supplyWon + x.vatWon)) : x.supplyWon} from="지난번 금액" />
                        <NumberField help="exp.vatWon" name="vatWon" unit="원" min={0} defaultValue={x.lastWon != null ? x.lastWon - Math.round((x.lastWon * x.supplyWon) / (x.supplyWon + x.vatWon)) : x.vatWon} />
                        <DateField help="exp.evidenceOn" name="evidenceOn" quick={["today"]} />
                        <SubmitButton>이번 달 결의 올리기</SubmitButton>
                      </AssistForm>
                    )}
                    {owner && (
                      <form action={recurringAction}>
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="id" value={x.id} />
                        <SubmitButton variant="secondary">등록 지우기</SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>등록한 정기 결의가 없습니다.</Empty>
          )}
        </Card>
        {owner && on && (
          <Card title="정기 결의 등록(대표 승인)" help={{ kind: "panel", id: "recur.add" }}>
            <AssistForm id="recur-new" action={recurringAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="intent" value="save" />
              <TextField help="exp.purpose" name="purpose" required />
              <SelectField help="exp.category" name="category" required placeholder="계정 고르기" options={opts(EXP_CATEGORIES)} />
              <SelectField help="exp.supplierId" name="supplierId" placeholder="협력업체가 아니면 비워 둠" options={sups.map((s) => ({ value: s.id, label: s.name }))} />
              <TextField help="exp.payeeName" name="payeeName" />
              <NumberField help="exp.supplyWon" name="supplyWon" required unit="원" min={1} />
              <NumberField help="exp.vatWon" name="vatWon" unit="원" min={0} />
              <SelectField help="exp.evidenceKind" name="evidenceKind" required defaultValue="tax_invoice" options={opts(EVIDENCE_KINDS)} />
              <SelectField help="exp.payMethod" name="payMethod" required defaultValue="transfer" options={opts(EXP_PAY_METHODS)} />
              <NumberField help="recur.day" name="day" required unit="일" min={1} max={28} defaultValue={25} />
              <div className="md:col-span-2">
                <SubmitButton>등록하기</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}
      </div>
    </>
  );
}
