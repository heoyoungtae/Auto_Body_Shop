// 법규 항목 칸(등록·고치기 같이 씀)
import { APPLIES, CYCLES, LEGAL_AREAS } from "@/modules/quality/legal-rules";
import {
  DateField,
  RadioRow,
  SelectField,
  TextAreaField,
  TextField,
} from "../_input";

type L = {
  area: string;
  lawName: string;
  clause: string | null;
  duty: string;
  stdRef: string | null;
  applies: string;
  basis: string | null;
  ownerId: string | null;
  cycle: string;
  nextDue: string | null;
  evidence: string | null;
  authority: string | null;
  permitNo: string | null;
  validUntil: string | null;
  note: string | null;
};

export function LegalFields({
  l,
  users,
}: {
  l?: L;
  users: { id: string; name: string }[];
}) {
  return (
    <>
      <div className="md:col-span-2">
        <RadioRow
          help="legal.area"
          name="area"
          required
          defaultValue={l?.area}
          options={LEGAL_AREAS.map((a) => ({ value: a, label: a }))}
        />
      </div>
      <TextField
        help="legal.lawName"
        name="lawName"
        required
        defaultValue={l?.lawName}
      />
      <TextField
        help="legal.clause"
        name="clause"
        defaultValue={l?.clause ?? ""}
      />
      <div className="md:col-span-2">
        <TextAreaField
          help="legal.duty"
          name="duty"
          required
          rows={2}
          defaultValue={l?.duty}
        />
      </div>
      <TextField
        help="legal.stdRef"
        name="stdRef"
        defaultValue={l?.stdRef ?? ""}
      />
      <TextField
        help="legal.authority"
        name="authority"
        defaultValue={l?.authority ?? ""}
      />
      <div className="md:col-span-2">
        <RadioRow
          help="legal.applies"
          name="applies"
          required
          defaultValue={l?.applies ?? "check"}
          options={Object.entries(APPLIES).map(([value, label]) => ({
            value,
            label,
            tone:
              value === "yes"
                ? ("ok" as const)
                : value === "check"
                  ? ("warn" as const)
                  : undefined,
          }))}
        />
      </div>
      <div className="md:col-span-2">
        <TextField
          help="legal.basis"
          name="basis"
          defaultValue={l?.basis ?? ""}
        />
      </div>
      <SelectField
        help="legal.ownerId"
        name="ownerId"
        defaultValue={l?.ownerId ?? ""}
        placeholder="담당자 고르기"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
      />
      <SelectField
        help="legal.cycle"
        name="cycle"
        defaultValue={l?.cycle ?? "none"}
        options={Object.entries(CYCLES).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <DateField
        help="legal.nextDue"
        name="nextDue"
        defaultValue={l?.nextDue ?? ""}
        quick={["nextMonth"]}
      />
      <TextField
        help="legal.evidence"
        name="evidence"
        defaultValue={l?.evidence ?? ""}
      />
      <TextField
        help="legal.permitNo"
        name="permitNo"
        defaultValue={l?.permitNo ?? ""}
      />
      <DateField
        help="legal.validUntil"
        name="validUntil"
        defaultValue={l?.validUntil ?? ""}
        quick={[]}
      />
      <div className="md:col-span-2">
        <TextAreaField
          help="legal.note"
          name="note"
          rows={2}
          defaultValue={l?.note ?? ""}
        />
      </div>
    </>
  );
}
