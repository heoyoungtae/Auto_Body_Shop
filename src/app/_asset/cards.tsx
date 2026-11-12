// 비품·설비 상세 화면에 같이 붙는 칸(대표 지시 2026-11-12): 들어옴 확인, 관리자 정/부, 소유 구분·감가상각·사용계약, 수리 이력
import Link from "next/link";
import type { Db } from "@/db/client";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { assetDep, feeMonthsDue, listRepairs, type AssetView } from "@/modules/asset/service";
import { daysLeft, DEP_METHODS, OWNERSHIP, REPAIR_BY } from "@/modules/asset/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField, CheckGroup } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, buttonClass, Card } from "../_ui";
import { ShowWhen } from "../consults/show-when";
import { EvidenceFiles } from "../money/evidence-files";
import { assetAction } from "./actions";

type User = { id: string; roles: Role[] };
type Opt = { id: string; name: string };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function Hidden({ a, op }: { a: AssetView; op: string }) {
  return (
    <>
      <input type="hidden" name="kind" value={a.kind} />
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="op" value={op} />
    </>
  );
}

/** 입고 대기 → 들어옴 확인(설비는 설치·시운전 뒤) */
export function ArrivalBox({ a, user }: { a: AssetView; user: User }) {
  if (a.status !== "pending") return null;
  const may = can(user, a.kind === "fixture" ? "fixture.manage" : "equip.manage") || user.id === a.managerId || user.id === a.subManagerId;
  return (
    <div className="mb-4 rounded-md border border-[var(--accent)] bg-[var(--accent-soft,transparent)] p-3 text-sm">
      <p>
        <b>입고 대기</b> — 지출 결의로 대장에 먼저 올라간 {a.kind === "fixture" ? "비품" : "설비"}입니다. {a.kind === "fixture" ? "물건을 받으면" : "설치·시운전을 마치면"} &apos;들어옴 확인&apos;을 눌러 주세요. 이날부터 사용·감가상각이 시작됩니다.
      </p>
      {may && (
        <AssistForm id={`asset-arrive-${a.id}`} action={assetAction} guard={false} className="mt-2 flex flex-wrap items-end gap-3">
          <Hidden a={a} op="arrive" />
          <DateField help="asset.arriveOn" name="arriveOn" required defaultValue={seoulDate()} quick={["today"]} />
          <SubmitButton>들어옴 확인</SubmitButton>
        </AssistForm>
      )}
    </div>
  );
}

/** 관리자 정/부: 정이 휴가면 알림은 부에게. 바꾸면 라벨을 다시 붙인다 */
export function ManagersCard({ a, user, users }: { a: AssetView; user: User; users: Opt[] }) {
  const manage = can(user, a.kind === "fixture" ? "fixture.manage" : "equip.manage");
  const nm = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  return (
    <Card title="관리자(정·부)" help={{ kind: "panel", id: "asset.managers" }}>
      <div id="managers" className="text-sm">
        <p>
          정: <b>{nm(a.managerId) ?? <span className="text-[var(--warn)]">아직 없음</span>}</b> · 부: <b>{nm(a.subManagerId) ?? "없음"}</b>
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">점검·고장·계약 만료 알림은 정에게 갑니다. 정이 휴가(승인된 근태 신청)인 날은 부에게 갑니다.</p>
      </div>
      {manage && a.status !== "disposed" && (
        <AssistForm id={`asset-mgr-${a.id}`} action={assetAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <Hidden a={a} op="managers" />
          <SelectField help="asset.manager" name="managerId" defaultValue={a.managerId ?? ""} placeholder="나중에" options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <SelectField help="asset.subManager" name="subManagerId" defaultValue={a.subManagerId ?? ""} placeholder="없음" options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <div className="md:col-span-2">
            <SubmitButton variant="secondary">관리자 저장</SubmitButton>
          </div>
        </AssistForm>
      )}
    </Card>
  );
}

function ContractFields({ a, fee }: { a: AssetView; fee: boolean }) {
  const c = a.contract;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextField help="asset.party" name="party" required defaultValue={c?.party ?? ""} />
      <TextField help="asset.partyPhone" name="partyPhone" defaultValue={c?.phone ?? ""} />
      <DateField help="asset.contractStart" name="contractStart" defaultValue={c?.start ?? a.boughtOn ?? ""} quick={["today"]} />
      <DateField help="asset.contractEnd" name="contractEnd" defaultValue={c?.end ?? ""} quick={[]} />
      {fee && <NumberField help="asset.feeWon" name="feeWon" required min={1} unit="원" defaultValue={c?.feeWon ?? null} />}
      {fee && <NumberField help="asset.payDay" name="payDay" min={1} max={31} unit="일" defaultValue={c?.payDay ?? null} />}
      <div className="md:col-span-2">
        <RadioRow help="asset.repairBy" name="repairBy" defaultValue={c?.repairBy ?? "owner"} options={Object.entries(REPAIR_BY).map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="md:col-span-2">
        <TextAreaField help="asset.terms" name="terms" rows={2} defaultValue={c?.terms ?? ""} />
      </div>
      <div className="md:col-span-2">
        <EvidenceFiles help="asset.contractFile" name="contractFile" pickLabel={c?.file ? "계약서 바꾸기" : "+ 계약서 사진·PDF"} multiple={false} saved={c?.file ? 1 : 0} />
      </div>
    </div>
  );
}

/** 소유 구분·감가상각·사용계약 */
export async function FinanceCard({ db, a, user }: { db: Db; a: AssetView; user: User }) {
  const manage = can(user, "fixture.manage") || can(user, "equip.manage");
  const p = await loadPolicy(db);
  const today = seoulDate();
  const own = a.ownership === "own";
  const d = own ? await assetDep(db, a) : null;
  const c = a.contract;
  const left = daysLeft(c?.end, today);
  const due = feeMonthsDue(a, today);
  const defYears = a.usefulYears ?? (a.kind === "fixture" ? p["asset.fixture_years"] : p["asset.equipment_years"]);
  const depDefault = a.depMethod !== "none" ? a.depMethod : a.cost <= p["asset.immediate_max"] ? "expense" : p["asset.dep_declining"] ? "db" : "sl";
  return (
    <Card title="소유·감가상각·사용계약" help={{ kind: "panel", id: "asset.finance" }}>
      <div id="finance" className="space-y-1 text-sm">
        <p>
          <Badge tone={own ? "neutral" : "accent"}>{OWNERSHIP[a.ownership as keyof typeof OWNERSHIP] ?? a.ownership}</Badge>{" "}
          {own && <>상각: {DEP_METHODS[a.depMethod as keyof typeof DEP_METHODS] ?? a.depMethod}{a.usefulYears && (a.depMethod === "sl" || a.depMethod === "db") ? ` ${a.usefulYears}년` : ""}{a.depStartOn ? ` · ${a.depStartOn}부터` : ""}</>}
        </p>
        {own && d && (
          <p>
            취득가 {won(d.cost)} · 상각 누계 {won(d.accum)} · <b>장부가 {won(d.book)}</b> · 올해 상각 {won(d.thisYear)}
          </p>
        )}
        {own && a.depMethod === "none" && <p className="text-xs text-[var(--warn)]">상각 방법이 정해지지 않았습니다. 아래에서 정해 주세요.</p>}
        {!own && c && (
          <>
            <p>
              {c.party}
              {c.phone ? ` (${c.phone})` : ""} · {c.start}~{c.end ?? "기한 없음"}
              {left != null && !c.returnedOn && <> · {left < 0 ? <Badge tone="danger">계약 끝남</Badge> : left <= p["asset.contract_alert_days"] ? <Badge tone="warn">{left}일 남음</Badge> : null}</>}
            </p>
            <p>
              {c.feeWon > 0 ? `월 ${won(c.feeWon)}${c.payDay ? ` · 매달 ${c.payDay}일` : ""}` : "무상"} · 수선 책임 {REPAIR_BY[c.repairBy]}
              {c.file && (
                <>
                  {" "}
                  · <a href={`/api/files/${c.file}`} target="_blank" rel="noreferrer" className="text-[var(--accent)]">계약서 보기</a>
                </>
              )}
            </p>
            {c.terms && <p className="whitespace-pre-wrap text-xs text-[var(--muted)]">{c.terms}</p>}
            {c.returnedOn && <p>반납 {c.returnedOn}: {c.returnNote}</p>}
            {due.length > 0 && can(user, "expense.draft") && (
              <Link href={`/money/expenses/new?lease=${a.kind}:${a.id}`} className={buttonClass("secondary")}>
                사용료 결의 쓰기({due.length}개월)
              </Link>
            )}
          </>
        )}
        <p className="text-xs text-[var(--muted)]">빌린 장비·고객 물건은 우리 자산이 아니므로 상각하지 않습니다. 금융리스(끝나면 우리 것이 되는 리스)는 세무사와 확인해 자사 소유로 바꿉니다.</p>
      </div>
      {manage && a.status !== "disposed" && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-[var(--accent)]">소유·상각·계약 정하기</summary>
          <AssistForm id={`asset-fin-${a.id}`} action={assetAction} className="mt-3 space-y-4">
            <Hidden a={a} op="finance" />
            <ShowWhen
              field="ownership"
              initial={a.ownership}
              cases={{
                own: (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <RadioRow help="asset.depMethod" name="depMethod" required defaultValue={depDefault} options={Object.entries(DEP_METHODS).map(([value, label]) => ({ value, label }))} />
                    </div>
                    <NumberField help="asset.usefulYears" name="usefulYears" min={2} max={20} unit="년" defaultValue={defYears} />
                    <DateField help="asset.depStartOn" name="depStartOn" defaultValue={a.depStartOn ?? a.boughtOn ?? ""} quick={["today"]} />
                  </div>
                ),
                lease: <ContractFields a={a} fee />,
                loan: <ContractFields a={a} fee={false} />,
                customer: <ContractFields a={a} fee={false} />,
              }}
            >
              <RadioRow help="asset.ownership" name="ownership" required defaultValue={a.ownership} options={Object.entries(OWNERSHIP).map(([value, label]) => ({ value, label }))} />
            </ShowWhen>
            <SubmitButton variant="secondary">저장</SubmitButton>
          </AssistForm>
        </details>
      )}
      {manage && !own && c && !c.returnedOn && a.status !== "disposed" && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-[var(--accent)]">돌려주기(반납)</summary>
          <AssistForm id={`asset-ret-${a.id}`} action={assetAction} className="mt-3 grid gap-3 md:grid-cols-2">
            <Hidden a={a} op="return" />
            <DateField help="asset.returnOn" name="returnOn" required defaultValue={today} quick={["today"]} />
            <div className="md:col-span-2">
              <TextAreaField help="asset.returnNote" name="returnNote" required rows={2} />
            </div>
            <div className="md:col-span-2">
              <SubmitButton variant="danger">반납 기록</SubmitButton>
            </div>
          </AssistForm>
        </details>
      )}
    </Card>
  );
}

/** 정비·수리 이력(첨부). 설비 수리·유지 결의에서 고르면 자동으로 쌓인다 */
export async function RepairsCard({ db, a, user, failureId }: { db: Db; a: AssetView; user: User; failureId?: string }) {
  const rows = await listRepairs(db, a.kind, a.id);
  const may = can(user, a.kind === "fixture" ? "fixture.manage" : "equip.manage") || can(user, "expense.draft") || user.id === a.managerId || user.id === a.subManagerId;
  const total = rows.reduce((t, r) => t + r.r.costWon, 0);
  return (
    <Card title="정비·수리 이력" help={{ kind: "panel", id: "asset.repairs" }} actions={rows.length ? <span className="text-xs text-[var(--muted)]">합계 {won(total)}</span> : undefined}>
      <div id="repairs">
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {rows.map(({ r, by, docNo }) => (
              <li key={r.id} className="py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">{r.on}</span>
                  <span>{r.what}</span>
                  {r.costWon > 0 && <span>{won(r.costWon)}</span>}
                  {r.capital && <Badge tone="accent">자본적 지출</Badge>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  {r.vendor && <span>{r.vendor}</span>}
                  {docNo && r.expenseId && (
                    <Link href={`/money/expenses/${r.expenseId}`} className="text-[var(--accent)]">
                      결의 {docNo}
                    </Link>
                  )}
                  {r.failureId && (
                    <Link href={`/equipment/failures/${r.failureId}`} className="text-[var(--accent)]">
                      고장 기록
                    </Link>
                  )}
                  {r.files.map((f, i) => (
                    <a key={f.path} href={`/api/files/${f.path}`} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                      첨부{r.files.length > 1 ? i + 1 : ""}
                    </a>
                  ))}
                  <span>{by ?? ""}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">수리 기록이 없습니다. 설비 수리·유지 지출 결의에서 이 {a.kind === "fixture" ? "비품" : "설비"}를 고르면 자동으로 남습니다.</p>
        )}
      </div>
      {may && a.status !== "disposed" && (
        <details className="mt-3" open={!!failureId}>
          <summary className="cursor-pointer text-sm text-[var(--accent)]">직접 기록하기(무상 수리·자체 수리)</summary>
          <AssistForm id={`asset-rep-${a.id}`} action={assetAction} className="mt-3 grid gap-3 md:grid-cols-2">
            <Hidden a={a} op="repair" />
            {failureId && <input type="hidden" name="failureId" value={failureId} />}
            <DateField help="asset.repairOn" name="repairOn" required defaultValue={seoulDate()} quick={["today"]} />
            <TextField help="asset.repairVendor" name="repairVendor" />
            <div className="md:col-span-2">
              <TextAreaField help="asset.repairWhat" name="repairWhat" required rows={2} />
            </div>
            <NumberField help="asset.repairCost" name="repairCost" min={0} unit="원" defaultValue={0} />
            {a.ownership === "own" && <CheckGroup help="asset.capital" name="capital" options={[{ value: "1", label: "자본적 지출(내용연수 연장·가치 증가)" }]} />}
            <div className="md:col-span-2">
              <EvidenceFiles help="asset.repairFiles" name="repairFiles" pickLabel="+ 견적서·작업 사진 붙이기" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton variant="secondary">수리 이력 남기기</SubmitButton>
            </div>
          </AssistForm>
        </details>
      )}
    </Card>
  );
}
