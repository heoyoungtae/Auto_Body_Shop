import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  EVAL_ITEMS,
  OUTCOME_LABEL,
  PO_STATUS,
  PO_TONE,
  REGISTER_MIN,
  SUPPLIER_DOCS,
  SUPPLIER_KINDS,
  SUPPLIER_STATUS,
  SUPPLIER_TONE,
  type PoStatus,
  type SupplierStatus,
} from "@/modules/purchase/rules";
import { getSupplier, supplierBank } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { NumberField, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { supplierAction } from "../actions";
import { SupplierFields } from "../_form";
import { BankFields } from "../bank-fields";
import { BankLine } from "../bank-line";

/** 협력업체 한 곳(F-07-01): 정보·서류, 등록 평가 → 대표 승인, 정기 평가 → 대표 확정, 거래 중지 */
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getSupplier(db, id).catch(() => null);
  if (!r) notFound();
  const { s, evals, names, stats, suggested, orders, year, missing } = r;
  const manage = can(user, "supplier.manage");
  const approve = can(user, "supplier.approve");
  const bankPerm = can(user, "supplier.bank");
  const bank = await supplierBank(db, user, id);
  const status = s.status as SupplierStatus;
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const december = seoulDate().slice(5, 7) === "12";
  const annualDone = evals.some((e) => e.kind === "annual" && e.year === year);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  const scoreFields = (defaults: Partial<Record<string, number>>) =>
    EVAL_ITEMS.map((i) => (
      <NumberField
        key={i.key}
        help="sup.score"
        name={`score_${i.key}`}
        label={`${i.label}(${i.max}점)`}
        required
        min={0}
        max={i.max}
        unit="점"
        defaultValue={defaults[i.key] ?? null}
      />
    ));
  return (
    <>
      <PageTitle
        help="suppliers.detail"
        sub={`${s.kinds.map((k) => SUPPLIER_KINDS[k as keyof typeof SUPPLIER_KINDS]).join("·")} · ${s.bizNo ?? "사업자번호 없음"}${s.score != null ? ` · 최근 평가 ${s.score}점` : ""}`}
        actions={
          <Link href="/suppliers" className="text-sm text-[var(--accent)]">
            ← 협력업체
          </Link>
        }
      >
        {s.name}{" "}
        <Badge tone={SUPPLIER_TONE[status]}>{SUPPLIER_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {s.emergencyOn && status !== "registered" && (
        <p className="mb-3 rounded-md bg-[var(--warn-soft)] p-2 text-sm">
          {s.emergencyOn}에 미등록 업체로 긴급 사용했습니다. {s.emergencyDue}
          까지 등록 평가를 마쳐야 합니다(STD-07 4절).
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="업체 정보" help={{ kind: "panel", id: "sup.info" }}>
          <dl className="text-sm">
            {row("품목", s.items)}
            {row(
              "담당·연락처",
              [s.contactName, s.phone, s.email].filter(Boolean).join(" · "),
            )}
            {row("보통 납기", s.leadDays != null ? `${s.leadDays}일` : null)}
            {row("반품 조건", s.returnTerms)}
            {row(
              "확인한 서류",
              <span className="flex flex-wrap gap-1">
                {s.docs.map((d) => (
                  <Badge key={d} tone="ok">
                    {SUPPLIER_DOCS[d as keyof typeof SUPPLIER_DOCS]?.label ?? d}
                  </Badge>
                ))}
                {missing.map((d) => (
                  <Badge key={d} tone="danger">
                    {SUPPLIER_DOCS[d].label} 필요
                  </Badge>
                ))}
              </span>,
            )}
            {row("메모", s.note)}
            {row(
              "등록 승인",
              s.approvedAt
                ? `${nm(s.approvedBy)} · ${fmtTime(s.approvedAt)}`
                : null,
            )}
            {s.stopReason &&
              row(
                status === "rejected" ? "등록 안 한 이유" : "중지 이유",
                s.stopReason,
              )}
          </dl>
          {manage && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">
                정보·서류 고치기
              </summary>
              <AssistForm
                id={`sup-edit-${id}`}
                action={supplierAction}
                className="mt-3 grid gap-3 md:grid-cols-2"
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="update" />
                <SupplierFields s={s} />
                <div className="md:col-span-2">
                  <SubmitButton>저장</SubmitButton>
                </div>
              </AssistForm>
            </details>
          )}
        </Card>

        <div id="bank" className="scroll-mt-4">
          <Card title="입금 계좌" help={{ kind: "panel", id: "sup.bank" }}>
            <BankLine bank={bank} supplierId={id} here canVerify={bankPerm} />
            {bank && <p className="mt-1 text-xs text-[var(--muted)]">넣은·바꾼 사람 {nm(bank.changedBy)} · {fmtTime(bank.changedAt)}{!bankPerm && " · 전체 번호는 회계 담당·대표만 봅니다"}</p>}
            {bankPerm && bank && !bank.verified && (bank.changedBy !== user.id || user.roles.includes("owner")) && (
              <AssistForm id={`sup-bankv-${id}`} action={supplierAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="bankVerify" />
                <div className="min-w-64 flex-1">
                  <TextField help="sup.bankVerifyNote" name="verifyNote" required />
                </div>
                <SubmitButton>전화로 확인함</SubmitButton>
              </AssistForm>
            )}
            {bankPerm && bank && !bank.verified && bank.changedBy === user.id && !user.roles.includes("owner") && (
              <p className="mt-2 text-sm text-[var(--muted)]">계좌를 넣은 사람이 아닌 대표가 업체에 전화로 확인합니다.</p>
            )}
            {bankPerm && (
              <details className="mt-3" open={!bank}>
                <summary className="cursor-pointer text-sm text-[var(--accent)]">{bank ? "계좌 바꾸기" : "계좌 넣기"}</summary>
                <AssistForm id={`sup-bank-${id}`} action={supplierAction} className="mt-3 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="bank" />
                  <BankFields supplierName={s.name} bankName={bank?.bankName ?? ""} holder={bank?.holder ?? ""} hasAccount={!!bank} />
                  <p className="text-xs text-[var(--muted)] md:col-span-2">통장 사본을 받아 보고 넣으세요. 받은 사본은 &apos;확인한 서류 › 통장 사본&apos;에 체크합니다.</p>
                  <div className="md:col-span-2">
                    <SubmitButton>저장</SubmitButton>
                  </div>
                </AssistForm>
                {bank && (
                  <AssistForm id={`sup-bankdel-${id}`} action={supplierAction} className="mt-2">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="bank" />
                    <input type="hidden" name="remove" value="1" />
                    <SubmitButton variant="secondary">계좌 지우기</SubmitButton>
                  </AssistForm>
                )}
              </details>
            )}
          </Card>
        </div>

        {(status === "candidate" ||
          status === "rejected" ||
          status === "proposed") && (
          <Card title="등록 평가" help={{ kind: "panel", id: "sup.eval" }}>
            {status === "proposed" ? (
              approve ? (
                <AssistForm
                  id={`sup-decide-${id}`}
                  action={supplierAction}
                  className="space-y-3"
                >
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="decide" />
                  <p className="text-sm">
                    공장장 평가 <b>{s.score}점</b>(기준 {REGISTER_MIN}점). 아래
                    평가 이력을 보고 정하세요.
                  </p>
                  <RadioRow
                    help="sup.decide"
                    name="ok"
                    required
                    options={[
                      { value: "1", label: "등록 승인", tone: "ok" },
                      { value: "0", label: "등록 안 함", tone: "danger" },
                    ]}
                  />
                  <TextField help="sup.decideReason" name="reason" />
                  <SubmitButton>결정 저장</SubmitButton>
                </AssistForm>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {s.score}점으로 등록을 제안했습니다. 대표 승인을 기다립니다.
                </p>
              )
            ) : manage ? (
              missing.length ? (
                <p className="text-sm text-[var(--danger)]">
                  먼저 서류를 확인해 주세요:{" "}
                  {missing.map((d) => SUPPLIER_DOCS[d].label).join(", ")} (업체
                  정보 › 정보·서류 고치기)
                </p>
              ) : (
                <AssistForm
                  id={`sup-eval-${id}`}
                  action={supplierAction}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="evaluate" />
                  {scoreFields({})}
                  <div className="md:col-span-2">
                    <TextAreaField
                      help="sup.evalNote"
                      name="evalNote"
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <SubmitButton>
                      평가 저장({REGISTER_MIN}점 이상이면 대표에게 등록 요청)
                    </SubmitButton>
                  </div>
                </AssistForm>
              )
            ) : (
              <p className="text-sm text-[var(--muted)]">
                공장장이 서류를 확인하고 평가합니다.
              </p>
            )}
          </Card>
        )}

        {(status === "registered" || status === "stopped") && (
          <Card
            title={`정기 평가(${year}년)`}
            help={{ kind: "panel", id: "sup.annual" }}
          >
            <p className="mb-2 text-sm">
              올해 실적: 발주 {stats.orders}건 · 입고 끝 {stats.received}건 ·
              납기 준수율{" "}
              {stats.onTimePct != null ? `${stats.onTimePct}%` : "-"} · 불량
              입고 {stats.badLines}/{stats.lines}줄
            </p>
            {annualDone ? (
              <p className="text-sm text-[var(--muted)]">
                {year}년 정기 평가를 했습니다(아래 이력).
              </p>
            ) : manage ? (
              <details open={december}>
                <summary className="mb-2 cursor-pointer text-sm text-[var(--accent)]">
                  {december
                    ? "정기 평가 하기"
                    : "정기 평가 하기(보통 12월에 함)"}
                </summary>
                <AssistForm
                  id={`sup-annual-${id}-${year}`}
                  action={supplierAction}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="annual" />
                  <input type="hidden" name="year" value={year} />
                  <p className="text-xs text-[var(--muted)] md:col-span-2">
                    납기·품질 점수는 앱 실적으로 계산해 미리 넣었습니다(고칠 수
                    있음).
                  </p>
                  {scoreFields(suggested)}
                  <div className="md:col-span-2">
                    <TextAreaField
                      help="sup.evalNote"
                      name="evalNote"
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <SubmitButton>정기 평가 저장(대표 확정)</SubmitButton>
                  </div>
                </AssistForm>
              </details>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                매년 12월 공장장이 평가하고 대표가 확정합니다.
              </p>
            )}
            {approve && (
              <AssistForm
                id={`sup-stop-${id}`}
                action={supplierAction}
                className="mt-4 space-y-3 border-t border-[var(--line)] pt-3"
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="stop" />
                <input
                  type="hidden"
                  name="stop"
                  value={status === "registered" ? "1" : "0"}
                />
                {status === "registered" && (
                  <TextField help="sup.stopReason" name="stopReason" required />
                )}
                <SubmitButton variant="secondary">
                  {status === "registered" ? "거래 중지" : "거래 다시 열기"}
                </SubmitButton>
              </AssistForm>
            )}
          </Card>
        )}

        <Card title="평가 이력" help={{ kind: "panel", id: "sup.history" }}>
          {evals.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {evals.map((e) => (
                <li key={e.id} className="py-2">
                  <p>
                    <b>
                      {e.kind === "initial"
                        ? "등록 평가"
                        : `${e.year}년 정기 평가`}
                    </b>{" "}
                    {e.total}점 · {nm(e.evaluatedBy)} {fmtTime(e.evaluatedAt)}
                    {e.outcome && (
                      <Badge tone={e.outcome === "ok" ? "ok" : "danger"}>
                        {OUTCOME_LABEL[e.outcome as keyof typeof OUTCOME_LABEL]}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {EVAL_ITEMS.map(
                      (i) => `${i.label} ${e.scores[i.key] ?? "-"}/${i.max}`,
                    ).join(" · ")}
                    {e.note ? ` — ${e.note}` : ""}
                  </p>
                  {e.kind === "annual" &&
                    !e.confirmedAt &&
                    (approve ? (
                      <AssistForm
                        id={`sup-confirm-${e.id}`}
                        action={supplierAction}
                        className="mt-1"
                        guard={false}
                      >
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="intent" value="confirm" />
                        <input type="hidden" name="evalId" value={e.id} />
                        <SubmitButton>
                          확정(정책값 기준으로 유지·개선 요청·거래 중지)
                        </SubmitButton>
                      </AssistForm>
                    ) : (
                      <p className="text-xs text-[var(--warn)]">
                        대표 확정 대기
                      </p>
                    ))}
                  {e.confirmedAt && (
                    <p className="text-xs text-[var(--muted)]">
                      확정 {nm(e.confirmedBy)} {fmtTime(e.confirmedAt)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 평가가 없습니다.</p>
          )}
        </Card>

        <Card title="최근 발주" help={{ kind: "panel", id: "sup.orders" }}>
          {orders.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center gap-2 py-1.5"
                >
                  <Link
                    href={`/purchases/${o.id}`}
                    className="font-mono text-xs text-[var(--accent)]"
                  >
                    {o.docNo}
                  </Link>
                  <Badge tone={PO_TONE[o.status as PoStatus]}>
                    {PO_STATUS[o.status as PoStatus]}
                  </Badge>
                  <span className="text-xs">
                    {o.totalWon.toLocaleString("ko-KR")}원
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {fmtTime(o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">발주 기록이 없습니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
