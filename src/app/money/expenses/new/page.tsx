import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { expenseSources, getExpense, sourceOf } from "@/modules/money/expense";
import {
  EVIDENCE_KINDS,
  EXP_CATEGORIES,
  EXP_PAY_METHODS,
  SIMPLE_RECEIPT_MAX,
  SOURCE_KINDS,
  vatOf,
} from "@/modules/money/rules";
import { listSuppliers } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import {
  CheckGroup,
  DateField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, PageTitle } from "../../../_ui";
import { createExpenseAction } from "../../actions";
import { EvidenceFiles } from "../../evidence-files";
import { AssetRows } from "../../asset-rows";
import { ShowWhen } from "../../../consults/show-when";
import { assetOptions, leaseFeePrefill } from "@/modules/asset/service";
import { listUsers } from "@/modules/auth/service";
import { FX_CATEGORIES } from "@/modules/purchase/rules";
import { EQ_KINDS } from "@/modules/equipment/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const opts = (o: Record<string, string>) =>
  Object.entries(o).map(([value, label]) => ({ value, label }));

/** 지출 결의서 쓰기(F-12-01). ?src=po:<id> 근거 전표에서, ?from=<id> 반려된 결의서에서 불러온다 */
export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; from?: string; error?: string; p?: string | string[]; lease?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.draft"))
    return (
      <p className="text-sm text-[var(--muted)]">
        지출 결의서는 공장장·회계 담당·대표가 씁니다.
      </p>
    );
  const db = await getDb();
  const [kind, sid] = (q.src ?? "").split(":");
  const pick = (Array.isArray(q.p) ? q.p : q.p ? [q.p] : []).filter(Boolean);
  let srcError = "";
  const src = kind && sid ? await sourceOf(db, kind, sid, pick).catch((e: Error) => ((srcError = e.message), null)) : null;
  const old = q.from
    ? ((await getExpense(db, user, q.from).catch(() => null))?.e ?? null)
    : null;
  // 빌린 장비 사용료(?lease=kind:id): 업체·금액·용도를 계약에서 채운다
  const [lk, lid] = (q.lease ?? "").split(":");
  const lease = (lk === "fixture" || lk === "equipment") && lid ? await leaseFeePrefill(db, lk, lid).catch(() => null) : null;
  const sources = src || old || lease ? [] : await expenseSources(db);
  const [assetOpts, staff] = src ? [[], []] : await Promise.all([assetOptions(db), listUsers(db)]);
  const people = staff.filter((u) => u.active && !u.retiredOn).map((u) => ({ value: u.id, label: u.name }));
  const fxCats = Object.entries(FX_CATEGORIES).map(([value, label]) => ({ value, label }));
  const eqKinds = Object.entries(EQ_KINDS).map(([value, k]) => ({ value, label: k.label }));
  const defaultEqManager = staff.find((u) => u.roles.includes("plant_manager"))?.id;
  const defaultFxManager = staff.find((u) => u.roles.includes("accounting"))?.id;
  const sups = await listSuppliers(db, "registered");
  const remain = src ? src.remainWon : 0;
  const supply = src
    ? src.remainWon === src.totalWon
      ? src.supplyWon
      : Math.round(remain / 1.1)
    : (old?.supplyWon ?? lease?.supply ?? null);
  const vat = src ? remain - (supply ?? 0) : (old?.vatWon ?? (lease ? vatOf(lease.supply) : null));
  const fromSrc = src
    ? `${SOURCE_KINDS[src.kind]} ${src.docNo}`
    : old
      ? `반려된 ${old.docNo}`
      : lease
        ? `${lease.a.no} 사용계약`
        : undefined;
  return (
    <>
      <PageTitle
        help="expenses.new"
        sub="발주서·외주 대금은 '외상매입금·미지급금'에서 업체별로 고른 외상을 불러와 지급 결의합니다. 그 밖의 지출은 근거 전표 없이 씁니다. 승인자는 금액에 따라 전결 규정(일반 지출)이 정합니다."
      >
        지출 결의서 쓰기
      </PageTitle>
      <ErrorBox message={q.error ?? (srcError || undefined)} />
      {sources.length > 0 && (
        <Card
          title="지급 결의할 업체(외상매입금·미지급금)"
          help={{ kind: "panel", id: "exp.sources" }}
        >
          <ul className="divide-y divide-[var(--line)] text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/money/expenses/new?src=${s.kind}:${s.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {s.supplierName}
                </Link>
                <span>{won(s.remainWon)}</span>
                <span className="text-xs text-[var(--muted)]">{s.payables?.length ?? 0}건 · 가까운 기한 {s.on ?? "-"}</span>
                <Link href={`/money/payables/${s.id}`} className="text-xs text-[var(--accent)]">
                  골라서 내기
                </Link>
                {s.invoiceNo && (
                  <span className="text-xs text-[var(--muted)]">
                    계산서 {s.invoiceNo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title={
          src
            ? `${src.docNo} 대금 결의`
            : old
              ? `${old.docNo} 고쳐 다시 올리기`
              : lease
                ? `${lease.a.no} ${lease.a.name} 사용료 결의`
                : "근거 전표 없이 결의(임차료·공과금·소모품·설비 구입 등)"
        }
        help={{ kind: "panel", id: "exp.form" }}
      >
        <AssistForm
          id={`exp-new-${q.src ?? q.from ?? "none"}`}
          action={createExpenseAction}
          className="grid gap-3 md:grid-cols-2"
        >
          <input
            type="hidden"
            name="sourceKind"
            value={src?.kind ?? old?.sourceKind ?? "none"}
          />
          <input
            type="hidden"
            name="sourceId"
            value={src?.id ?? old?.sourceId ?? ""}
          />
          {q.src && <input type="hidden" name="src" value={q.src} />}
          {src?.kind === "settle" &&
            src.payables?.map((x) => <input key={x.id} type="hidden" name="p" value={x.id} />)}
          {src?.kind === "settle" && (
            <div className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs md:col-span-2">
              <p className="mb-1 font-medium">
                묶는 외상 {src.payables?.length ?? 0}건 · 합계 {won(src.totalWon)}{" "}
                <Link href={`/money/payables/${src.id}`} className="text-[var(--accent)]">
                  다시 고르기
                </Link>
              </p>
              <ul className="space-y-0.5">
                {src.payables?.map((x) => (
                  <li key={x.id}>
                    {x.sourceNo} · 입고 {x.accruedOn} · 기한 {x.dueOn} · {won(x.amountWon)}
                    {x.invoiceNo ? ` · 계산서 ${x.invoiceNo}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lease && (
            <>
              <input type="hidden" name="lease" value={`${lease.a.kind}:${lease.a.id}`} />
              <input type="hidden" name="leaseYm" value={lease.months[lease.months.length - 1]} />
              <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs md:col-span-2">
                {lease.a.contract?.party} 월 {won(lease.a.contract?.feeWon ?? 0)} × {lease.months.length}개월({lease.months.join(", ")}). 올리면 이 달까지 낸 것으로 적습니다.
              </p>
            </>
          )}
          {old && <input type="hidden" name="fromId" value={old.id} />}
          {old && <input type="hidden" name="from" value={old.id} />}
          {src ? (
            <>
              <input
                type="hidden"
                name="supplierId"
                value={src.supplierId ?? ""}
              />
              <TextField
                help="exp.payeeName"
                name="payeeName"
                readOnly
                defaultValue={src.supplierName}
                from={fromSrc}
              />
            </>
          ) : (
            <>
              <SelectField
                help="exp.supplierId"
                name="supplierId"
                placeholder="협력업체가 아니면 비워 둠"
                defaultValue={old?.supplierId ?? ""}
                from={old ? fromSrc : undefined}
                options={sups.map((s) => ({ value: s.id, label: s.name }))}
              />
              <TextField
                help="exp.payeeName"
                name="payeeName"
                defaultValue={old && !old.supplierId ? old.payeeName : (lease?.payee ?? "")}
                from={old || lease ? fromSrc : undefined}
              />
            </>
          )}
          {src ? (
            <SelectField help="exp.category" name="category" required defaultValue={src.category} placeholder="계정 고르기" from={fromSrc} options={opts(EXP_CATEGORIES)} />
          ) : (
            // 계정에 따라 아래에 칸이 붙는다: 설비·공구 → 대장 등록, 설비 수리·유지 → 수리한 비품·설비
            <div className="md:col-span-2">
              <ShowWhen
                field="category"
                initial={old?.category ?? (lease ? "rent" : "")}
                cases={{
                  equipment: <AssetRows fxCats={fxCats} eqKinds={eqKinds} users={people} defaultManager={{ fixture: defaultFxManager, equipment: defaultEqManager }} />,
                  other: <AssetRows fxCats={fxCats} eqKinds={eqKinds} users={people} defaultManager={{ fixture: defaultFxManager, equipment: defaultEqManager }} optional />,
                  welfare: <AssetRows fxCats={fxCats} eqKinds={eqKinds} users={people} defaultManager={{ fixture: defaultFxManager, equipment: defaultEqManager }} optional />,
                  repair: (
                    <div className="flex flex-wrap items-end gap-3">
                      <SelectField help="asset.repairTarget" name="repairTarget" placeholder="고르지 않음" options={assetOpts} />
                      <CheckGroup help="asset.capital" name="repairCapital" options={[{ value: "1", label: "자본적 지출(내용연수 연장·가치 증가)" }]} />
                    </div>
                  ),
                }}
              >
                <SelectField help="exp.category" name="category" required defaultValue={old?.category ?? (lease ? "rent" : "")} placeholder="계정 고르기" from={old || lease ? fromSrc : undefined} options={opts(EXP_CATEGORIES)} />
              </ShowWhen>
            </div>
          )}
          {src && src.split.length > 1 && (
            <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs md:col-span-2">
              {src.docNo}에 계정이 섞여 있어 품목 계정대로 나눠 잡습니다:{" "}
              {src.split.map((p) => `${EXP_CATEGORIES[p.category as keyof typeof EXP_CATEGORIES] ?? p.category} ${won(p.won)}`).join(" · ")}. 계정을 바꾸면 고른 계정 하나로 전액 잡습니다.
            </p>
          )}
          <SelectField
            help="exp.payMethod"
            name="payMethod"
            required
            defaultValue={old?.payMethod ?? "transfer"}
            options={opts(EXP_PAY_METHODS)}
          />
          <NumberField
            help="exp.supplyWon"
            name="supplyWon"
            required
            unit="원"
            min={1}
            defaultValue={supply}
            from={fromSrc}
          />
          <NumberField
            help="exp.vatWon"
            name="vatWon"
            unit="원"
            min={0}
            defaultValue={vat}
            suggested={supply ? vatOf(supply) : undefined}
            from={fromSrc}
          />
          {src && (
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              {src.kind === "settle"
                ? `공급가 + 부가세는 고른 외상 합계 ${won(src.totalWon)}와 같아야 합니다(세금계산서 금액과 대조).`
                : `이 전표의 남은 금액 ${won(remain)}(근거 ${won(src.totalWon)}, 이미 결의 ${won(src.usedWon)})을 넘을 수 없습니다.`}
            </p>
          )}
          <div className="md:col-span-2">
            <TextAreaField
              help="exp.purpose"
              name="purpose"
              required={!src}
              rows={2}
              defaultValue={old?.purpose ?? lease?.purpose ?? ""}
              from={old || lease ? fromSrc : undefined}
            />
          </div>
          <SelectField
            help="exp.evidenceKind"
            name="evidenceKind"
            required
            defaultValue={
              src?.invoiceNo ? "tax_invoice" : (old?.evidenceKind ?? "")
            }
            placeholder="증빙 고르기"
            from={src?.invoiceNo ? "발주서에 연결한 세금계산서" : undefined}
            options={opts(EVIDENCE_KINDS)}
          />
          <TextField
            help="exp.evidenceNo"
            name="evidenceNo"
            defaultValue={src?.invoiceNo ?? old?.evidenceNo ?? ""}
            from={src?.invoiceNo ? "발주서" : undefined}
          />
          <DateField
            help="exp.evidenceOn"
            name="evidenceOn"
            defaultValue={src?.invoiceOn ?? old?.evidenceOn ?? ""}
            quick={["today"]}
          />
          <DateField
            help="exp.dueOn"
            name="dueOn"
            defaultValue={old?.dueOn ?? (src?.kind === "settle" ? (src.on && src.on >= seoulDate() ? src.on : seoulDate()) : "")}
            from={src?.kind === "settle" ? "결제 조건" : undefined}
            min={seoulDate()}
            quick={["today", "week", "nextMonth"]}
          />
          <div className="md:col-span-2">
            <EvidenceFiles />
          </div>
          <p className="text-xs text-[var(--muted)] md:col-span-2">
            {won(SIMPLE_RECEIPT_MAX)}이 넘는데 간이영수증만 있으면 적격 증빙이
            아니어서 가산세(2%) 대상입니다. 증빙을 아직 못 받았으면 &apos;아직
            못 받음&apos;으로 올리고, 받으면 붙여야 지급됩니다. 업체 계좌 이체는
            전화로 확인한 계좌로만 보냅니다.
          </p>
          <div className="md:col-span-2">
            <SubmitButton>결재에 올리기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
