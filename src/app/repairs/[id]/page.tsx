import Link from "next/link";
import { getDb } from "@/db/runtime";
import { INSURANCE_LABEL } from "@/modules/customer/rules";
import { VEHICLE_OPTIONS, type VehicleOption } from "@/modules/customer/generations";
import { getRepair } from "@/modules/repair/service";
import { BODY_NOTES, DEVICES, FUEL_OPTIONS, fuelLabel, RO_STATUS_LABEL } from "@/modules/repair/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, NumberField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { ShowWhen } from "../../consults/show-when";
import { intakeAction, reopenAction } from "../actions";
import { BodyDiagram } from "../body-diagram";
import { Diagnosis } from "../diagnosis";
import { IntakeCheck } from "../intake-check";
import { PhotoSlots } from "../photo-slots";
import { SignaturePad } from "../signature-pad";

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const WARNING_LIGHTS = ["없음", "엔진 점검", "타이어 공기압", "에어백", "ABS·제동", "배터리·충전", "엔진오일 압력", "냉각수 온도"];

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd>{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

export default async function RepairDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const r = await getRepair(db, id);
  const policy = await loadPolicy(db, seoulDate());
  const canWrite = user.roles.some((x) => x === "owner" || x === "plant_manager" || x === "advisor");
  const canDiagnose = user.roles.some((x) => x === "technician" || x === "plant_manager" || x === "owner");
  const canConfirm = user.roles.some((x) => x === "plant_manager" || x === "owner");
  const open = r.status === "intake" && canWrite;
  const v = r.vehicle;
  const c = r.consult;
  // 차량 기록의 주행거리가 이 수리 건에서 넣은 값이면 비교 대상이 아니다
  const lastMileage = r.mileage != null && v.mileage === r.mileage ? null : v.mileage;
  const minPhotos = Math.min(policy["intake.min_photos"], 8);
  const photoSlots = r.photos.map((p) => p.slot);
  const photos = r.photos.map((p) => ({ id: p.id, slot: p.slot, path: p.path }));

  const fromConsult = (
    <Card title="상담에서 불러온 값" help={{ kind: "panel", id: "ro.from" }}>
      <dl className="text-sm">
        <Row k="손상">{[c.damageTypes.join(", "), c.damageParts].filter(Boolean).join(" · ")}</Row>
        <Row k="경위">{c.cause}</Row>
        <Row k="예비 판단">
          {c.methods.join(", ")} {c.structural && <Badge tone="warn">구조물 손상 의심</Badge>}
        </Row>
        <Row k="보험">{[INSURANCE_LABEL[r.insurance as keyof typeof INSURANCE_LABEL], r.insurer, r.claimNo && `접수 ${r.claimNo}`].filter(Boolean).join(" · ")}</Row>
        <Row k="부품·대차">{[c.partsPref, c.rental && "대차 필요"].filter(Boolean).join(" · ")}</Row>
        <Row k="요구">{c.needs}</Row>
        <Row k="희망 납기">{c.wantDate}</Row>
      </dl>
    </Card>
  );

  return (
    <div>
      <PageTitle
        help="repairs.detail"
        sub={
          <>
            F-02-01 입고 점검표 · 입고 {fmtTime(r.inAt)} · 담당 {r.advisor ?? "—"} ·{" "}
            <Link href={`/consults/${c.id}`} className="text-[var(--accent)]">
              {c.docNo}
            </Link>
            에서 불러옴
          </>
        }
        actions={<Badge tone={r.status === "intake" ? "warn" : "accent"}>{RO_STATUS_LABEL[r.status]}</Badge>}
      >
        수리 건 {r.docNo}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}

      <p className="mt-3 text-sm">
        <Link href={`/customers/${r.customer.id}`} className="font-semibold text-[var(--accent)] hover:underline">
          {r.customer.name}
        </Link>{" "}
        <span className="text-[var(--muted)]">{r.customer.phone ?? "연락처 없음"}</span> · <b>{v.plateNo}</b> {[v.maker, [v.model, v.generation].filter(Boolean).join(" "), v.trim, v.year && `${v.year}년식`].filter(Boolean).join(" · ")}
        {v.options?.length ? <span className="text-[var(--muted)]"> · {v.options.map((o) => VEHICLE_OPTIONS[o as VehicleOption] ?? o).join(", ")}</span> : null}
      </p>

      {open ? (
        <AssistForm id={`ro-${r.id}`} action={intakeAction} className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
          <input type="hidden" name="id" value={r.id} />
          <div className="space-y-4 xl:col-span-2">
            <Card title="차량 상태" help={{ kind: "panel", id: "ro.vehicle" }}>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                <NumberField help="ro.mileage" name="mileage" unit="km" min={lastMileage ?? 0} max={2000000} defaultValue={r.mileage} current={lastMileage ?? undefined} required />
                <SelectField help="ro.fuel" name="fuelPct" defaultValue={r.fuelPct != null ? String(r.fuelPct) : ""} placeholder="고르기" options={FUEL_OPTIONS} required />
                <TextField help="ro.warningLights" name="warningLights" defaultValue={r.warningLights ?? ""} suggestions={WARNING_LIGHTS.map((w) => ({ value: w }))} />
                <TextField help="veh.vin" name="vin" defaultValue={v.vin ?? ""} from={v.vin ? "차량 기록" : undefined} />
                <TextField help="veh.color" name="colorCode" defaultValue={v.colorCode ?? ""} from={v.colorCode ? "차량 기록" : undefined} />
              </div>
              <div className="mt-4">
                <CheckGroup help="ro.bodyNotes" name="bodyNotes" options={opts(BODY_NOTES)} defaultChecked={r.bodyNotes} />
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
                    <CheckGroup help="ro.valuablesNone" name="valuablesNone" options={[{ value: "1", label: "남긴 물품 없음(고객과 확인)" }]} defaultChecked={r.valuablesNone ? ["1"] : []} />
                    <TextAreaField help="ro.valuables" name="valuables" rows={2} defaultValue={r.valuables ?? undefined} />
                  </div>
                  <CheckGroup help="ro.devices" name="devices" options={opts(DEVICES)} defaultChecked={r.devices} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                  <NumberField help="ro.keyCount" name="keyCount" unit="개" min={1} max={9} defaultValue={r.keyCount} required />
                  <TextField help="ro.keyTag" name="keyTag" defaultValue={r.keyTag ?? r.docNo} />
                  <TextField help="ro.parkSpot" name="parkSpot" defaultValue={r.parkSpot ?? ""} />
                  <CheckGroup help="ro.coversOn" name="coversOn" options={[{ value: "1", label: "시트·핸들·바닥 커버 씌움" }]} defaultChecked={r.coversOn ? ["1"] : []} />
                </div>
                <ShowWhen
                  field="arrival"
                  initial={r.delivered ? "driver" : "customer"}
                  cases={{ driver: <TextField help="ro.driverName" name="driverName" defaultValue={r.driverName ?? ""} required /> }}
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
                <TextAreaField help="ro.note" name="intakeNote" rows={2} defaultValue={r.intakeNote ?? undefined} />
              </div>
            </Card>
          </div>
          <div className="space-y-4 xl:sticky xl:top-4">
            <Card title="고객 확인·서명" help={{ kind: "panel", id: "ro.sign" }}>
              <div className="space-y-4">
                <CheckGroup
                  help="ro.agree"
                  name="agree"
                  options={[
                    { value: "checked", label: "점검 내용(사진·도면·계기판·물품)을 확인했습니다" },
                    { value: "move", label: "작업상 차량 이동·시험 주행에 동의합니다" },
                  ]}
                  defaultChecked={[...(r.agreeChecked ? ["checked"] : []), ...(r.agreeMove ? ["move"] : [])]}
                />
                {!r.consent.required && <CheckGroup help="ro.consentNow" name="consentNow" options={[{ value: "1", label: "개인정보 수집·이용 필수 동의를 받았습니다" }]} />}
                <TextField help="ro.signerName" name="signerName" defaultValue={r.signerName ?? r.customer.name} />
                <SignaturePad />
                <IntakeCheck photoSlots={photoSlots} minPhotos={minPhotos} consentOk={r.consent.required} lastMileage={lastMileage} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="intent" value="sign">
                    서명 받고 점검 마치기
                  </SubmitButton>
                  <SubmitButton name="intent" value="save" variant="secondary" noValidate>
                    중간 저장
                  </SubmitButton>
                </div>
                <p className="text-xs text-[var(--muted)]">사진은 찍을 때마다 바로 저장됩니다. 나머지 칸은 &lsquo;중간 저장&rsquo;이나 서명할 때 저장됩니다.</p>
              </div>
            </Card>
            {fromConsult}
          </div>
        </AssistForm>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
          <div className="space-y-4 xl:col-span-2">
            {r.status !== "intake" && <Diagnosis roId={r.id} status={r.status} damages={r.damages} canDiagnose={canDiagnose} canConfirm={canConfirm} repaintUm={policy["diagnosis.repaint_um"]} options={v.options ?? []} diagNote={r.diagNote} />}
            <Card title="입고 점검 결과" help={{ kind: "panel", id: "ro.done" }}>
              <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-6">
                <Row k="주행거리">{r.mileage != null && `${r.mileage.toLocaleString("ko-KR")}km`}</Row>
                <Row k="연료량">{fuelLabel(r.fuelPct)}</Row>
                <Row k="경고등">{r.warningLights}</Row>
                <Row k="차대번호·색상">{[v.vin, v.colorCode].filter(Boolean).join(" · ")}</Row>
                <Row k="특이 사항">{r.bodyNotes.join(", ")}</Row>
                <Row k="남긴 물품">{r.valuablesNone ? "없음(고객과 확인)" : r.valuables}</Row>
                <Row k="단말기">{r.devices.join(", ")}</Row>
                <Row k="열쇠">{r.keyCount != null && `${r.keyCount}개 · 태그 ${r.keyTag ?? r.docNo}`}</Row>
                <Row k="세워 둔 곳">{[r.parkSpot, r.coversOn && "보호 커버 씌움"].filter(Boolean).join(" · ")}</Row>
                <Row k="입고 방법">{r.delivered ? `탁송 · ${r.driverName ?? ""}` : "고객 직접"}</Row>
                <Row k="메모">{r.intakeNote}</Row>
              </dl>
            </Card>
            <Card title="입고 사진" help={{ kind: "panel", id: "ro.photos" }}>
              <PhotoSlots roId={r.id} photos={photos} minPhotos={minPhotos} readOnly />
            </Card>
            <Card title="차체 도면" help={{ kind: "panel", id: "ro.diagram" }}>
              <BodyDiagram initial={r.marks} readOnly />
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="고객 확인·서명" help={{ kind: "panel", id: "ro.sign" }}>
              {r.signedAt ? (
                <div className="space-y-2 text-sm">
                  <p>
                    <Badge tone="ok">서명함</Badge> {r.signerName} · {fmtTime(r.signedAt)}
                  </p>
                  {r.signaturePath && (
                    <img src={`/api/files/${r.signaturePath}`} alt={`${r.signerName} 서명`} className="h-28 w-full rounded border border-[var(--line)] bg-white object-contain" />
                  )}
                  <p className="text-xs text-[var(--muted)]">점검 내용 확인·작업상 이동 동의 · 개인정보 필수 동의 {r.consent.required ? "있음" : "없음"}</p>
                  {r.status === "checked" && canWrite && (
                    <form action={reopenAction} className="space-y-2 border-t border-[var(--line)] pt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <TextField help="ro.reopenReason" name="reopenReason" label="다시 점검하는 이유" required />
                      <SubmitButton variant="secondary">다시 점검</SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">아직 서명하지 않았습니다. 상담원·공장장·대표가 점검을 이어 합니다.</p>
              )}
            </Card>
            {fromConsult}
          </div>
        </div>
      )}
    </div>
  );
}
