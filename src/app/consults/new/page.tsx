import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getConsultation, getCustomer, reservationCalendar, searchCustomers } from "@/modules/customer/service";
import { normalizePhone } from "@/modules/auth/crypto";
import { normalizePlate, PLATE_RE, PHONE_RE, seoulParts } from "@/modules/customer/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { SelectField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { createConsultAction } from "../actions";
import { ConsentFields, ConsultFields, NewCustomerFields, NewVehicleFields, type ConsultPrefill } from "../consult-form";
import { Calendar } from "../calendar";
import { ShowWhen } from "../show-when";

type Q = { error?: string; q?: string; customer?: string; vehicle?: string; from?: string };

/** 앞선 기록에서 시작: ?from=지난 상담 / ?customer=고객(&vehicle=차량) */
async function start(q: Q) {
  const db = await getDb();
  if (q.from) {
    try {
      const c = await getConsultation(db, q.from);
      const p: ConsultPrefill = { ...c, reservedDate: undefined, result: "open", closeReason: null, recontactOn: null, estNoticed: false };
      return { customerId: c.customer.id, vehicleId: c.vehicleId ?? undefined, p, src: c.docNo, fromId: c.id };
    } catch {
      /* 없으면 빈 양식 */
    }
  }
  if (q.customer) return { customerId: q.customer, vehicleId: q.vehicle, p: {} as ConsultPrefill, src: undefined, fromId: undefined };
  return { customerId: undefined, vehicleId: undefined, p: {} as ConsultPrefill, src: undefined, fromId: undefined };
}

export default async function NewConsult({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  await requireUser(["owner", "plant_manager", "advisor"]);
  const db = await getDb();
  const today = seoulDate();
  const s = await start(q);
  const cust = s.customerId ? await getCustomer(db, s.customerId).catch(() => null) : null;
  const found = q.q ? await searchCustomers(db, q.q) : [];
  const cal = await reservationCalendar(db, 14);
  // 찾았는데 없으면, 친 값을 새 고객 칸에 넣어 준다(다시 치지 않게)
  const typed = q.q?.trim() ?? "";
  const typedPhone = PHONE_RE.test(normalizePhone(typed)) ? typed : undefined;
  const typedPlate = PLATE_RE.test(normalizePlate(typed)) ? typed : undefined;
  const back = `/consults/new?${new URLSearchParams(Object.entries({ q: q.q, customer: q.customer, vehicle: q.vehicle, from: q.from }).filter(([, v]) => v) as [string, string][])}`;
  const formId = `consult-new${s.fromId ? `-f-${s.fromId}` : cust ? `-c-${cust.id}` : ""}`;
  const vehicleSrc = s.src ?? (cust ? "고객 기록" : undefined);

  return (
    <div>
      <PageTitle help="consults.new" sub="F-01-01 · 사내 표준서 STD-01. 먼저 전화번호·차량번호로 찾고, 있으면 그 고객으로 시작합니다.">
        새 상담
      </PageTitle>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="고객 찾기" help={{ kind: "panel", id: "consult.find" }}>
            <form method="get" className="flex flex-wrap gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q.q}
                placeholder="전화번호, 끝 4자리, 차량번호, 이름"
                aria-label="고객 찾기"
                className="h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3"
              />
              <button className={buttonClass("secondary")}>찾기</button>
            </form>
            {q.q && (
              <div className="mt-3">
                {found.length ? (
                  <ul className="divide-y divide-[var(--line)] text-sm">
                    {found.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <span>
                          <b>{c.name}</b> <span className="text-[var(--muted)]">{c.phone ?? "연락처 없음"}</span>{" "}
                          {!c.consent.required && <Badge tone="warn">동의 없음</Badge>}
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {c.vehicles.map((v) => (
                            <Link key={v.id} href={`/consults/new?customer=${c.id}&vehicle=${v.id}`} className={buttonClass("secondary")}>
                              {v.plateNo} {v.model ?? ""}
                            </Link>
                          ))}
                          <Link href={`/consults/new?customer=${c.id}&vehicle=new`} className={buttonClass("secondary")}>
                            {c.vehicles.length ? "다른 차량" : "이 고객으로"}
                          </Link>
                          {c.last && (
                            <Link href={`/consults/new?from=${c.last.id}`} className={buttonClass("secondary")} title="지난 상담의 차량·손상·보험·요구를 그대로 불러옵니다">
                              {c.last.docNo} 불러오기
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>
                    &lsquo;{q.q}&rsquo;로 찾은 고객이 없습니다. 아래에 새 고객으로 적습니다{typedPhone || typedPlate ? "(친 번호를 칸에 넣어 두었습니다)" : ""}.
                  </Empty>
                )}
              </div>
            )}
          </Card>

          <AssistForm id={formId} draft action={createConsultAction} className="space-y-4">
            <ErrorBox message={q.error} />
            <input type="hidden" name="back" value={back} />
            {s.fromId && <input type="hidden" name="fromId" value={s.fromId} />}
            {s.src && (
              <Notice>
                {s.src}에서 차량·손상·보험·요구를 불러왔습니다. 바뀐 것만 고치면 됩니다. <Link className="text-[var(--accent)]" href={`/consults/new?customer=${s.customerId}`}>불러오지 않고 시작</Link>
              </Notice>
            )}
            {cust ? (
              <fieldset className="space-y-4 rounded-lg border border-[var(--line)] p-4">
                <legend className="px-1 text-sm font-semibold">고객</legend>
                <input type="hidden" name="customerId" value={cust.id} />
                <p className="text-sm">
                  <Link href={`/customers/${cust.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                    {cust.name}
                  </Link>{" "}
                  <span className="text-[var(--muted)]">{cust.phone ?? "연락처 없음"}</span>{" "}
                  {cust.consent.required && cust.consent.current ? (
                    <Badge tone="ok">동의 받음 {cust.consent.at ? seoulParts(cust.consent.at).date : ""}</Badge>
                  ) : (
                    <Badge tone="warn">{cust.consent.required ? "동의서 판이 바뀜 — 다시 받기" : "필수 동의 없음 — 받기"}</Badge>
                  )}{" "}
                  <Link href="/consults/new" className="text-xs text-[var(--accent)]">
                    다른 고객
                  </Link>
                </p>
                {!(cust.consent.required && cust.consent.current) && (
                  <ConsentFields checked={["required", ...(cust.consent.photo ? ["photo"] : []), ...(cust.consent.marketing ? ["marketing"] : [])]} />
                )}
                {cust.vehicles.length ? (
                  <VehiclePick vehicles={cust.vehicles} selected={s.vehicleId} from={vehicleSrc} />
                ) : (
                  <NewVehicleFields v={{ plateNo: typedPlate }} />
                )}
              </fieldset>
            ) : (
              <>
                <NewCustomerFields phone={typedPhone} />
                <fieldset className="space-y-4 rounded-lg border border-[var(--line)] p-4">
                  <legend className="px-1 text-sm font-semibold">차량</legend>
                  <NewVehicleFields v={{ plateNo: typedPlate }} />
                </fieldset>
              </>
            )}
            <ConsultFields p={s.p} src={s.src} today={today} />
            <SubmitButton>상담 일지 저장</SubmitButton>
          </AssistForm>
        </div>
        <div className="space-y-4">
          <Card title="입고 예약 현황(2주)" help={{ kind: "panel", id: "consult.calendar" }}>
            <Calendar days={cal} today={today} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function VehiclePick({ vehicles, selected, from }: { vehicles: { id: string; plateNo: string; model: string | null; year: number | null; colorCode: string | null }[]; selected?: string; from?: string }) {
  const def = selected && (selected === "new" || vehicles.some((v) => v.id === selected)) ? selected : vehicles[0].id;
  return (
    <ShowWhen field="vehicleId" initial={def} cases={{ new: <NewVehicleFields /> }}>
      <SelectField
        help="veh.pick"
        name="vehicleId"
        required
        defaultValue={def}
        from={def !== "new" ? from : undefined}
        options={[...vehicles.map((v) => ({ value: v.id, label: [v.plateNo, v.model, v.year, v.colorCode].filter(Boolean).join(" · ") })), { value: "new", label: "새 차량 적기" }]}
      />
    </ShowWhen>
  );
}
