import { KINDS, PERSONAL_KINDS, REMIND_OPTIONS, REPEATS, type Kind } from "@/modules/schedule/rules";
import { AssistForm } from "../_assist";
import { CheckGroup, DateField, RadioRow, SelectField, TextAreaField, TextField } from "../_input";
import { SubmitButton } from "../_submit";

type Values = {
  kind: string;
  title: string;
  startOn: string;
  endOn: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  note: string | null;
  attendeeIds: string[];
  repeat: string;
  repeatUntil: string | null;
  remindDays: number | null;
};

/** 일정 입력 칸(새로 올리기·고치기 같이 씀) */
export function EventForm({
  formId,
  action,
  scope,
  users,
  values,
  id,
  submit,
}: {
  formId: string;
  action: (f: FormData) => Promise<void>;
  scope: "shop" | "personal";
  users: { id: string; label: string }[];
  values: Values;
  id?: string;
  submit: string;
}) {
  const kinds = (Object.keys(KINDS) as Kind[]).filter((k) => scope === "shop" || PERSONAL_KINDS.includes(k));
  return (
    <AssistForm id={formId} action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="scope" value={scope} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="md:col-span-2">
        <RadioRow help="schedule.kind" name="kind" required defaultValue={values.kind} options={kinds.map((k) => ({ value: k, label: KINDS[k], tone: k === "off" ? ("danger" as const) : undefined }))} />
      </div>
      <div className="md:col-span-2">
        <TextField help="schedule.title" name="title" required defaultValue={values.title} />
      </div>
      <DateField help="schedule.startOn" name="startOn" required defaultValue={values.startOn} quick={["today", "tomorrow", "week"]} />
      <DateField help="schedule.endOn" name="endOn" defaultValue={values.endOn} quick={[]} />
      <TextField help="schedule.startTime" name="startTime" type="time" step={300} defaultValue={values.startTime ?? ""} />
      <TextField help="schedule.endTime" name="endTime" type="time" step={300} defaultValue={values.endTime ?? ""} />
      <div className="md:col-span-2">
        <TextField help="schedule.place" name="place" defaultValue={values.place ?? ""} suggestions={[{ value: "사무실" }, { value: "작업장" }, { value: "도장 부스" }, { value: "휴게실" }, { value: "외부" }]} />
      </div>
      {scope === "shop" && (
        <div className="md:col-span-2">
          <CheckGroup help="schedule.attendees" name="attendeeIds" defaultChecked={values.attendeeIds} options={users.map((u) => ({ value: u.id, label: u.label }))} />
        </div>
      )}
      <div className="md:col-span-2">
        <TextAreaField help="schedule.note" name="note" rows={3} defaultValue={values.note ?? ""} />
      </div>
      <RadioRow help="schedule.repeat" name="repeat" required defaultValue={values.repeat} options={Object.entries(REPEATS).map(([value, label]) => ({ value, label }))} />
      <DateField help="schedule.repeatUntil" name="repeatUntil" defaultValue={values.repeatUntil ?? ""} quick={[]} />
      <SelectField help="schedule.remindDays" name="remindDays" defaultValue={values.remindDays == null ? "" : String(values.remindDays)} options={REMIND_OPTIONS} />
      <div className="flex items-end md:col-span-2">
        <SubmitButton>{submit}</SubmitButton>
      </div>
    </AssistForm>
  );
}
