import { rolesFor } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getConsultation, reservationCalendar } from "@/modules/customer/service";
import { seoulParts } from "@/modules/customer/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { SelectField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { requireUser } from "../../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../../_ui";
import { updateConsultAction } from "../../actions";
import { Calendar } from "../../calendar";
import { ConsultFields } from "../../consult-form";
import { SaveCheck } from "../../save-check";

export default async function EditConsult({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  await requireUser(rolesFor("consult.write"));
  const db = await getDb();
  const c = await getConsultation(db, id);
  const today = seoulDate();
  const resv = c.reservedAt ? seoulParts(c.reservedAt) : null;
  const cal = await reservationCalendar(db, 60);
  return (
    <div>
      <PageTitle help="consults.edit" sub={<>고객 {c.customer.name} · 고객 이름·연락처는 <Link href={`/customers/${c.customer.id}`} className="text-[var(--accent)]">고객 화면</Link>에서 고칩니다.</>}>
        상담 {c.docNo} 고치기
      </PageTitle>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <AssistForm id={`consult-edit-${c.id}`} action={updateConsultAction} className="space-y-4 xl:col-span-2">
          <ErrorBox message={error} />
          <input type="hidden" name="id" value={c.id} />
          {c.vehicles.length > 0 && (
            <SelectField
              help="veh.pick"
              name="vehicleId"
              defaultValue={c.vehicleId ?? ""}
              placeholder="차량 없음"
              options={c.vehicles.map((v) => ({ value: v.id, label: [v.plateNo, v.model].filter(Boolean).join(" · ") }))}
            />
          )}
          <ConsultFields
            vehicles={c.vehicles}
            channel={false}
            today={today}
            p={{ ...c, reservedDate: resv?.date, reservedTime: resv?.time }}
          />
          <SaveCheck fullDates={cal.filter((d) => d.full && !(c.result === "reserved" && d.date === resv?.date)).map((d) => d.date)} closed={Object.fromEntries(cal.filter((d) => d.closed).map((d) => [d.date, d.closed!]))} />
          <SubmitButton>저장</SubmitButton>
        </AssistForm>
        <Card title="입고 예약 현황(2주)" help={{ kind: "panel", id: "consult.calendar" }}>
          <Calendar days={cal.slice(0, 14)} today={today} />
        </Card>
      </div>
    </div>
  );
}
