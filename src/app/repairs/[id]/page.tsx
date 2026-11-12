import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { INSURANCE_LABEL } from "@/modules/customer/rules";
import {
  VEHICLE_OPTIONS,
  type VehicleOption,
} from "@/modules/customer/generations";
import { getRepair } from "@/modules/repair/service";
import {
  BODY_NOTES,
  DEVICES,
  FUEL_OPTIONS,
  fuelLabel,
  RO_STATUS_LABEL,
} from "@/modules/repair/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import {
  CheckGroup,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  Notice,
  PageTitle,
  fmtTime,
} from "../../_ui";
import { ShowWhen } from "../../consults/show-when";
import { intakeAction, reopenAction } from "../actions";
import { BodyDiagram } from "../body-diagram";
import { Diagnosis } from "../diagnosis";
import { listEstimates } from "@/modules/repair/estimate";
import { ESTIMATE_STATUS_LABEL } from "@/modules/repair/estimate-rules";
import { createEstimateAction } from "../actions";
import { IntakeCheck } from "../intake-check";
import { workOrdersOfRo } from "@/modules/repair/work";
import { WO_STATUS_LABEL } from "@/modules/repair/work-rules";
import { createWorkOrderAction } from "../../work/actions";
import { PhotoSlots } from "../photo-slots";
import { SignaturePad } from "../signature-pad";
import { claimOf } from "@/modules/repair/claims";
import { roSteps } from "@/modules/repair/steps";
import { RoSteps } from "../ro-steps";
import { CLAIM_STATUS_LABEL } from "@/modules/repair/claim-rules";
import { complaintsFor } from "@/modules/cs/service";
import { ordersOfRo } from "@/modules/purchase/order";
import { outsourceOfRo } from "@/modules/purchase/outsource";
import { usedOnRo } from "@/modules/purchase/stock";
import {
  OS_STATUS,
  OS_TONE,
  OUT_TYPES,
  PO_STATUS,
  PO_TONE,
  type OsStatus,
  type OutType,
  type PoStatus,
} from "@/modules/purchase/rules";
import { CP_STATUS } from "@/modules/cs/rules";

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const WARNING_LIGHTS = [
  "없음",
  "엔진 점검",
  "타이어 공기압",
  "에어백",
  "ABS·제동",
  "배터리·충전",
  "엔진오일 압력",
  "냉각수 온도",
];

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd>{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

export default async function RepairDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const r = await getRepair(db, id);
  const [estimates, wos, claim, cps, pos, oss, used] = await Promise.all([
    listEstimates(db, id),
    workOrdersOfRo(db, id),
    claimOf(db, id),
    complaintsFor(db, id),
    ordersOfRo(db, id),
    outsourceOfRo(db, id),
    usedOnRo(db, id),
  ]);
  const policy = await loadPolicy(db, seoulDate());
  const canWrite = can(user, "repair.write");
  const canDiagnose = can(user, "diag.write");
  const canConfirm = can(user, "diag.confirm");
  const open = r.status === "intake" && canWrite;
  const v = r.vehicle;
  const c = r.consult;
  // 차량 기록의 주행거리가 이 수리 건에서 넣은 값이면 비교 대상이 아니다
  const lastMileage =
    r.mileage != null && v.mileage === r.mileage ? null : v.mileage;
  const minPhotos = Math.min(policy["intake.min_photos"], 8);
  const photoSlots = r.photos.map((p) => p.slot);
  const photos = r.photos.map((p) => ({
    id: p.id,
    slot: p.slot,
    path: p.path,
  }));

  const fromConsult = (
    <Card title="상담에서 불러온 값" help={{ kind: "panel", id: "ro.from" }}>
      <dl className="text-sm">
        <Row k="손상">
          {[c.damageTypes.join(", "), c.damageParts]
            .filter(Boolean)
            .join(" · ")}
        </Row>
        <Row k="경위">{c.cause}</Row>
        <Row k="예비 판단">
          {c.methods.join(", ")}{" "}
          {c.structural && <Badge tone="warn">구조물 손상 의심</Badge>}
        </Row>
        <Row k="보험">
          {[
            INSURANCE_LABEL[r.insurance as keyof typeof INSURANCE_LABEL],
            r.insurer,
            r.claimNo && `접수 ${r.claimNo}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Row>
        <Row k="부품·대차">
          {[c.partsPref, c.rental && "대차 필요"].filter(Boolean).join(" · ")}
        </Row>
        <Row k="요구">{c.needs}</Row>
        <Row k="희망 납기">{c.wantDate}</Row>
      </dl>
    </Card>
  );

  // 진행 막대의 '다음' 단추: 다른 화면에서 할 일만(같은 화면에서 할 일은 아래 패널에 있다)
  const lastEstimate = estimates[0]; // 최근 차수가 먼저 옴
  const openWo = wos.find((w) => w.status !== "done") ?? wos[0];
  const nextStep =
    r.status === "estimating" && lastEstimate
      ? { label: "견적", href: `/repairs/${r.id}/estimate/${lastEstimate.id}` }
      : r.status === "working" && openWo
        ? { label: "작업 지시서", href: `/work/${openWo.id}` }
        : r.status === "inspecting"
          ? { label: "최종 검사", href: `/repairs/${r.id}/inspect` }
          : r.status === "ready"
            ? { label: "출고", href: `/repairs/${r.id}/delivery` }
            : r.status === "delivered" && r.insurance !== "self" && claim?.status !== "paid"
              ? { label: "보험 청구", href: `/repairs/${r.id}/claim` }
              : undefined;

  return (
    <div>
      <PageTitle
        help="repairs.detail" std="F-02-01 입고 점검표"
        sub={
          <>
            입고 {fmtTime(r.inAt)} · 담당{" "}
            {r.advisor ?? "—"} ·{" "}
            <Link href={`/consults/${c.id}`} className="text-[var(--accent)]">
              {c.docNo}
            </Link>
            에서 불러옴
          </>
        }
        actions={
          <span className="flex items-center gap-3">
            <Link
              href={`/tasks/new?${new URLSearchParams({ refType: "repair_order", refId: r.id, refLabel: `${r.docNo} ${v.plateNo}` }).toString()}`}
              className="text-sm text-[var(--accent)]"
            >
              업무지시
            </Link>
            <Badge tone={r.status === "intake" ? "warn" : "accent"}>
              {RO_STATUS_LABEL[r.status]}
            </Badge>
          </span>
        }
      >
        수리 건 {r.docNo}
      </PageTitle>
      <RoSteps steps={roSteps(r.status, r.insurance !== "self", claim?.status === "paid")} next={nextStep} />
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}

      <p className="mt-3 text-sm">
        <Link
          href={`/customers/${r.customer.id}`}
          className="font-semibold text-[var(--accent)] hover:underline"
        >
          {r.customer.name}
        </Link>{" "}
        <span className="text-[var(--muted)]">
          {r.customer.phone ?? "연락처 없음"}
        </span>{" "}
        · <b>{v.plateNo}</b>{" "}
        {[
          v.maker,
          [v.model, v.generation].filter(Boolean).join(" "),
          v.trim,
          v.year && `${v.year}년식`,
        ]
          .filter(Boolean)
          .join(" · ")}
        {v.options?.length ? (
          <span className="text-[var(--muted)]">
            {" "}
            ·{" "}
            {v.options
              .map((o) => VEHICLE_OPTIONS[o as VehicleOption] ?? o)
              .join(", ")}
          </span>
        ) : null}
      </p>

      {open ? (
        <AssistForm
          id={`ro-${r.id}`}
          action={intakeAction}
          className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start"
        >
          <input type="hidden" name="id" value={r.id} />
          <div className="space-y-4 xl:col-span-2">
            <Card title="차량 상태" help={{ kind: "panel", id: "ro.vehicle" }}>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                <NumberField
                  help="ro.mileage"
                  name="mileage"
                  unit="km"
                  min={lastMileage ?? 0}
                  max={2000000}
                  defaultValue={r.mileage}
                  current={lastMileage ?? undefined}
                  required
                />
                <SelectField
                  help="ro.fuel"
                  name="fuelPct"
                  defaultValue={r.fuelPct != null ? String(r.fuelPct) : ""}
                  placeholder="고르기"
                  options={FUEL_OPTIONS}
                  required
                />
                <TextField
                  help="ro.warningLights"
                  name="warningLights"
                  defaultValue={r.warningLights ?? ""}
                  suggestions={WARNING_LIGHTS.map((w) => ({ value: w }))}
                />
                <TextField
                  help="veh.vin"
                  name="vin"
                  defaultValue={v.vin ?? ""}
                  from={v.vin ? "차량 기록" : undefined}
                />
                <TextField
                  help="veh.color"
                  name="colorCode"
                  defaultValue={v.colorCode ?? ""}
                  from={v.colorCode ? "차량 기록" : undefined}
                />
              </div>
              <div className="mt-4">
                <CheckGroup
                  help="ro.bodyNotes"
                  name="bodyNotes"
                  options={opts(BODY_NOTES)}
                  defaultChecked={r.bodyNotes}
                />
              </div>
            </Card>
            <Card title="입고 사진" help={{ kind: "panel", id: "ro.photos" }}>
              <PhotoSlots roId={r.id} photos={photos} minPhotos={minPhotos} />
            </Card>
            <Card title="차체 도면" help={{ kind: "panel", id: "ro.diagram" }}>
              <BodyDiagram initial={r.marks} />
            </Card>
            <Card title="실내·열쇠" help={{ kind: "panel", id: "ro.inside" }}>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <CheckGroup
                      help="ro.valuablesNone"
                      name="valuablesNone"
                      options={[
                        { value: "1", label: "남긴 물품 없음(고객과 확인)" },
                      ]}
                      defaultChecked={r.valuablesNone ? ["1"] : []}
                    />
                    <TextAreaField
                      help="ro.valuables"
                      name="valuables"
                      rows={2}
                      defaultValue={r.valuables ?? undefined}
                    />
                  </div>
                  <CheckGroup
                    help="ro.devices"
                    name="devices"
                    options={opts(DEVICES)}
                    defaultChecked={r.devices}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                  <NumberField
                    help="ro.keyCount"
                    name="keyCount"
                    unit="개"
                    min={1}
                    max={9}
                    defaultValue={r.keyCount}
                    required
                  />
                  <TextField
                    help="ro.keyTag"
                    name="keyTag"
                    defaultValue={r.keyTag ?? r.docNo}
                  />
                  <TextField
                    help="ro.parkSpot"
                    name="parkSpot"
                    defaultValue={r.parkSpot ?? ""}
                  />
                  <CheckGroup
                    help="ro.coversOn"
                    name="coversOn"
                    options={[
                      { value: "1", label: "시트·핸들·바닥 커버 씌움" },
                    ]}
                    defaultChecked={r.coversOn ? ["1"] : []}
                  />
                </div>
                <ShowWhen
                  field="arrival"
                  initial={r.delivered ? "driver" : "customer"}
                  cases={{
                    driver: (
                      <TextField
                        help="ro.driverName"
                        name="driverName"
                        defaultValue={r.driverName ?? ""}
                        required
                      />
                    ),
                  }}
                >
                  <SelectField
                    help="ro.arrival"
                    name="arrival"
                    defaultValue={r.delivered ? "driver" : "customer"}
                    options={[
                      { value: "customer", label: "고객이 직접 가져옴" },
                      { value: "driver", label: "탁송(기사와 점검)" },
                    ]}
                  />
                </ShowWhen>
                <TextAreaField
                  help="ro.note"
                  name="intakeNote"
                  rows={2}
                  defaultValue={r.intakeNote ?? undefined}
                />
              </div>
            </Card>
          </div>
          <div className="space-y-4 xl:sticky xl:top-4">
            <Card
              title="고객 확인·서명"
              help={{ kind: "panel", id: "ro.sign" }}
            >
              <div className="space-y-4">
                <CheckGroup
                  help="ro.agree"
                  name="agree"
                  options={[
                    {
                      value: "checked",
                      label: "점검 내용(사진·도면·계기판·물품)을 확인했습니다",
                    },
                    {
                      value: "move",
                      label: "작업상 차량 이동·시험 주행에 동의합니다",
                    },
                  ]}
                  defaultChecked={[
                    ...(r.agreeChecked ? ["checked"] : []),
                    ...(r.agreeMove ? ["move"] : []),
                  ]}
                />
                {!r.consent.required && (
                  <CheckGroup
                    help="ro.consentNow"
                    name="consentNow"
                    options={[
                      {
                        value: "1",
                        label: "개인정보 수집·이용 필수 동의를 받았습니다",
                      },
                    ]}
                  />
                )}
                <TextField
                  help="ro.signerName"
                  name="signerName"
                  defaultValue={r.signerName ?? r.customer.name}
                />
                <SignaturePad />
                <IntakeCheck
                  photoSlots={photoSlots}
                  minPhotos={minPhotos}
                  consentOk={r.consent.required}
                  lastMileage={lastMileage}
                />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="intent" value="sign">
                    서명 받고 점검 마치기
                  </SubmitButton>
                  <SubmitButton
                    name="intent"
                    value="save"
                    variant="secondary"
                    noValidate
                  >
                    중간 저장
                  </SubmitButton>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  사진은 찍을 때마다 바로 저장됩니다. 나머지 칸은 &lsquo;중간
                  저장&rsquo;이나 서명할 때 저장됩니다.
                </p>
              </div>
            </Card>
            {fromConsult}
          </div>
        </AssistForm>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
          <div className="space-y-4 xl:col-span-2">
            {r.insurance !== "self" && (
              <Card title="보험 청구" help={{ kind: "panel", id: "ro.claim" }}>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge
                    tone={
                      claim?.status === "paid"
                        ? "ok"
                        : claim
                          ? "accent"
                          : "warn"
                    }
                  >
                    {CLAIM_STATUS_LABEL[claim?.status ?? "none"]}
                  </Badge>
                  {claim && (
                    <span>
                      {claim.docNo} · {claim.insurer} {claim.claimNo} ·
                      자기부담금 {claim.deductibleWon.toLocaleString("ko-KR")}원
                    </span>
                  )}
                  <Link
                    href={`/repairs/${r.id}/claim`}
                    className={buttonClass(claim ? "secondary" : "primary")}
                  >
                    {claim ? "청구 화면" : "접수 정보 확인하기"}
                  </Link>
                </div>
              </Card>
            )}
            {(r.status === "inspecting" ||
              r.status === "ready" ||
              r.status === "delivered") && (
              <Card title="검사·출고" help={{ kind: "panel", id: "ro.qc" }}>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/repairs/${r.id}/inspect`}
                    className={buttonClass(
                      r.status === "inspecting" ? "primary" : "secondary",
                    )}
                  >
                    최종 검사{r.status === "inspecting" ? " 하기" : " 기록"}
                  </Link>
                  {r.status !== "inspecting" && (
                    <Link
                      href={`/repairs/${r.id}/delivery`}
                      className={buttonClass(
                        r.status === "ready" ? "primary" : "secondary",
                      )}
                    >
                      {r.status === "ready" ? "출고하기" : "출고 기록"}
                    </Link>
                  )}
                  {can(user, "money.view") && (
                    <Link
                      href={`/money/ro/${r.id}`}
                      className={buttonClass("secondary")}
                    >
                      수납
                    </Link>
                  )}
                  {r.status === "delivered" && (
                    <Link
                      href={`/complaints/new?ro=${r.id}`}
                      className={buttonClass("secondary")}
                    >
                      불만·보증 접수
                    </Link>
                  )}
                </div>
                {cps.length > 0 && (
                  <p className="mt-2 text-sm">
                    불만·보증:{" "}
                    {cps.map((x) => (
                      <Link
                        key={x.id}
                        href={`/complaints/${x.id}`}
                        className="mr-2 text-[var(--accent)]"
                      >
                        {x.docNo}(
                        {CP_STATUS[x.status as keyof typeof CP_STATUS]})
                      </Link>
                    ))}
                  </p>
                )}
              </Card>
            )}
            {(r.status === "working" || wos.length > 0) && (
              <div id="work">
                <Card title="작업" help={{ kind: "panel", id: "ro.work" }}>
                  {wos.length ? (
                    <ul className="divide-y divide-[var(--line)] text-sm">
                      {wos.map((w) => (
                        <li
                          key={w.id}
                          className="flex flex-wrap items-center gap-2 py-2"
                        >
                          <Link
                            href={`/work/${w.id}`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            {w.docNo}
                          </Link>
                          <Badge tone={w.status === "done" ? "ok" : "accent"}>
                            {WO_STATUS_LABEL[w.status]}
                          </Badge>
                          {w.dueDate && (
                            <span className="ml-auto">
                              출고 약속 {w.dueDate}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      고객이 승인한 견적이 있습니다. 공장장이 승인 항목으로 작업
                      지시서를 만듭니다.
                    </p>
                  )}
                  {r.status === "working" && canConfirm && !wos.length && (
                    <form action={createWorkOrderAction} className="mt-3">
                      <input type="hidden" name="roId" value={r.id} />
                      <SubmitButton>작업 지시서 만들기</SubmitButton>
                    </form>
                  )}
                </Card>
              </div>
            )}
            {(pos.length > 0 ||
              oss.length > 0 ||
              used.length > 0 ||
              (["working", "inspecting"].includes(r.status) &&
                (can(user, "purchase.order") || can(user, "stock.use")))) && (
              <Card
                title="부품·자재·외주"
                help={{ kind: "panel", id: "ro.purchase" }}
              >
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {pos.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <Link
                        href={`/purchases/${o.id}`}
                        className="font-medium text-[var(--accent)] hover:underline"
                      >
                        {o.docNo}
                      </Link>
                      <span>부품 발주</span>
                      <Badge tone={PO_TONE[o.status as PoStatus]}>
                        {PO_STATUS[o.status as PoStatus]}
                      </Badge>
                      {(o.replyDueOn ?? o.dueOn) && (
                        <span className="ml-auto">
                          도착 {o.replyDueOn ?? o.dueOn}
                        </span>
                      )}
                    </li>
                  ))}
                  {oss.map((j) => (
                    <li
                      key={j.id}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <Link
                        href={`/outsource/${j.id}`}
                        className="font-medium text-[var(--accent)] hover:underline"
                      >
                        {j.docNo}
                      </Link>
                      <span>
                        외주 {OUT_TYPES[j.workType as OutType]} ·{" "}
                        {j.supplierName}
                      </span>
                      <Badge tone={OS_TONE[j.status as OsStatus]}>
                        {OS_STATUS[j.status as OsStatus]}
                      </Badge>
                      <span className="ml-auto">납기 {j.dueOn}</span>
                    </li>
                  ))}
                  {used.length > 0 && (
                    <li className="py-2 text-xs text-[var(--muted)]">
                      쓴 자재:{" "}
                      {used
                        .map((u) => `${u.name} ${-u.m.qty}${u.unit}`)
                        .join(", ")}
                    </li>
                  )}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {can(user, "purchase.order") &&
                    ["working", "inspecting", "estimating"].includes(
                      r.status,
                    ) && (
                      <>
                        <Link
                          href={`/purchases/new?ro=${r.id}`}
                          className={buttonClass("secondary")}
                        >
                          부품 발주 더하기
                        </Link>
                        <Link
                          href={`/outsource/new?ro=${r.id}`}
                          className={buttonClass("secondary")}
                        >
                          외주 의뢰
                        </Link>
                      </>
                    )}
                  {can(user, "stock.use") &&
                    ["working", "inspecting"].includes(r.status) && (
                      <Link
                        href={`/stock/use?ro=${r.id}`}
                        className={buttonClass("secondary")}
                      >
                        자재 사용 기록
                      </Link>
                    )}
                </div>
              </Card>
            )}
            {(r.status === "estimating" || estimates.length > 0) && (
              <Card title="견적" help={{ kind: "panel", id: "ro.estimates" }}>
                {estimates.length ? (
                  <ul className="divide-y divide-[var(--line)] text-sm">
                    {estimates.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-center gap-2 py-2"
                      >
                        <Link
                          href={`/repairs/${r.id}/estimate/${e.id}`}
                          className="font-medium text-[var(--accent)] hover:underline"
                        >
                          {e.docNo}
                        </Link>
                        <span>{e.rev}차</span>
                        <Badge tone={e.status === "draft" ? "warn" : "accent"}>
                          {ESTIMATE_STATUS_LABEL[e.status]}
                        </Badge>
                        <span className="ml-auto tabular-nums">
                          {e.totalWon.toLocaleString("ko-KR")}원
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    아직 견적이 없습니다. 진단과 공임 기준표로 항목을 채워
                    시작합니다.
                  </p>
                )}
                {r.status === "estimating" &&
                  canWrite &&
                  !estimates.some((e) => e.status === "draft") && (
                    <form action={createEstimateAction} className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton>
                        {estimates.length ? "새 차수 견적 쓰기" : "견적 쓰기"}
                      </SubmitButton>
                    </form>
                  )}
              </Card>
            )}
            {r.status !== "intake" && (
              <Diagnosis
                roId={r.id}
                status={r.status}
                damages={r.damages}
                canDiagnose={canDiagnose}
                canConfirm={canConfirm}
                repaintUm={policy["diagnosis.repaint_um"]}
                options={v.options ?? []}
                diagNote={r.diagNote}
              />
            )}
            <Card
              title="입고 점검 결과"
              help={{ kind: "panel", id: "ro.done" }}
            >
              <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-6">
                <Row k="주행거리">
                  {r.mileage != null &&
                    `${r.mileage.toLocaleString("ko-KR")}km`}
                </Row>
                <Row k="연료량">{fuelLabel(r.fuelPct)}</Row>
                <Row k="경고등">{r.warningLights}</Row>
                <Row k="차대번호·색상">
                  {[v.vin, v.colorCode].filter(Boolean).join(" · ")}
                </Row>
                <Row k="특이 사항">{r.bodyNotes.join(", ")}</Row>
                <Row k="남긴 물품">
                  {r.valuablesNone ? "없음(고객과 확인)" : r.valuables}
                </Row>
                <Row k="단말기">{r.devices.join(", ")}</Row>
                <Row k="열쇠">
                  {r.keyCount != null &&
                    `${r.keyCount}개 · 태그 ${r.keyTag ?? r.docNo}`}
                </Row>
                <Row k="세워 둔 곳">
                  {[r.parkSpot, r.coversOn && "보호 커버 씌움"]
                    .filter(Boolean)
                    .join(" · ")}
                </Row>
                <Row k="입고 방법">
                  {r.delivered ? `탁송 · ${r.driverName ?? ""}` : "고객 직접"}
                </Row>
                <Row k="메모">{r.intakeNote}</Row>
              </dl>
            </Card>
            <Card title="입고 사진" help={{ kind: "panel", id: "ro.photos" }}>
              <PhotoSlots
                roId={r.id}
                photos={photos}
                minPhotos={minPhotos}
                readOnly
              />
            </Card>
            <Card title="차체 도면" help={{ kind: "panel", id: "ro.diagram" }}>
              <BodyDiagram initial={r.marks} readOnly />
            </Card>
          </div>
          <div className="space-y-4">
            <Card
              title="고객 확인·서명"
              help={{ kind: "panel", id: "ro.sign" }}
            >
              {r.signedAt ? (
                <div className="space-y-2 text-sm">
                  <p>
                    <Badge tone="ok">서명함</Badge> {r.signerName} ·{" "}
                    {fmtTime(r.signedAt)}
                  </p>
                  {r.signaturePath && (
                    <img
                      src={`/api/files/${r.signaturePath}`}
                      alt={`${r.signerName} 서명`}
                      className="h-28 w-full rounded border border-[var(--line)] bg-white object-contain"
                    />
                  )}
                  <p className="text-xs text-[var(--muted)]">
                    점검 내용 확인·작업상 이동 동의 · 개인정보 필수 동의{" "}
                    {r.consent.required ? "있음" : "없음"}
                  </p>
                  {r.status === "checked" && canWrite && (
                    <form
                      action={reopenAction}
                      className="space-y-2 border-t border-[var(--line)] pt-3"
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <TextField
                        help="ro.reopenReason"
                        name="reopenReason"
                        label="다시 점검하는 이유"
                        required
                      />
                      <SubmitButton variant="secondary">다시 점검</SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  아직 서명하지 않았습니다. 상담원·공장장·대표가 점검을 이어
                  합니다.
                </p>
              )}
            </Card>
            {fromConsult}
          </div>
        </div>
      )}
    </div>
  );
}
