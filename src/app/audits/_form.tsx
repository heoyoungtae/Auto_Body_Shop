// 내부심사 계획 칸(계획·고치기 같이 씀)
import { STD_CHAPTERS } from "@/modules/quality/risk-rules";
import { CheckGroup, DateField, SelectField, TextField } from "../_input";

type A = {
  plannedOn: string;
  scope: string[];
  auditorId: string | null;
  externalAuditor: string | null;
  auditeeIds: string[];
  criteria: string | null;
};

export function AuditFields({
  a,
  users,
  from,
}: {
  a?: Partial<A>;
  users: { id: string; name: string }[];
  from?: string;
}) {
  return (
    <>
      <DateField
        help="audit.plannedOn"
        name="plannedOn"
        required
        defaultValue={a?.plannedOn ?? ""}
        quick={["week", "nextMonth"]}
      />
      <TextField
        help="audit.criteria"
        name="criteria"
        defaultValue={a?.criteria ?? ""}
        from={from && a?.criteria ? from : undefined}
      />
      <div className="md:col-span-2">
        <CheckGroup
          help="audit.scope"
          name="scope"
          options={STD_CHAPTERS.map((c) => ({ value: c, label: c }))}
          defaultChecked={a?.scope ?? []}
        />
      </div>
      <SelectField
        help="audit.auditorId"
        name="auditorId"
        defaultValue={a?.auditorId ?? ""}
        placeholder="사내 심사자 고르기"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        from={from && a?.auditorId ? from : undefined}
      />
      <TextField
        help="audit.externalAuditor"
        name="externalAuditor"
        defaultValue={a?.externalAuditor ?? ""}
      />
      <div className="md:col-span-2">
        <CheckGroup
          help="audit.auditeeIds"
          name="auditeeIds"
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          defaultChecked={a?.auditeeIds ?? []}
        />
      </div>
    </>
  );
}
