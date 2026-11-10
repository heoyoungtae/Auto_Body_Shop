"use client";
// 위험성평가 한 줄 칸. 가능성·중대성을 고르면 점수와 대책 필요 여부를 바로 보여 준다
import { useState } from "react";
import {
  HA_MEASURE_SCORE,
  MEASURE_TYPES,
  PROCESSES,
} from "@/modules/safety/rules";
import { DateField, RadioRow, SelectField, TextField } from "../_input";

type R = {
  process: string;
  hazard: string;
  current: string | null;
  likelihood: number;
  severity: number;
  measureType: string | null;
  measure: string | null;
  ownerId: string | null;
  due: string | null;
};
const levels = [
  { value: "1", label: "1", tone: "ok" as const },
  { value: "2", label: "2", tone: "warn" as const },
  { value: "3", label: "3", tone: "danger" as const },
];

export function HazardRowFields({
  r,
  users,
}: {
  r?: R;
  users: { id: string; name: string }[];
}) {
  const [l, setL] = useState(r?.likelihood ?? 0);
  const [s, setS] = useState(r?.severity ?? 0);
  const score = l * s;
  const need = score >= HA_MEASURE_SCORE;
  return (
    <>
      <SelectField
        help="haz.process"
        name="process"
        required
        defaultValue={r?.process ?? ""}
        placeholder="공정 고르기"
        options={PROCESSES.map((p) => ({ value: p, label: p }))}
      />
      <TextField
        help="haz.hazard"
        name="hazard"
        required
        defaultValue={r?.hazard ?? ""}
      />
      <div className="md:col-span-2">
        <TextField
          help="haz.current"
          name="current"
          defaultValue={r?.current ?? ""}
        />
      </div>
      <div onChange={(e) => setL(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="haz.likelihood"
          name="likelihood"
          required
          defaultValue={r ? String(r.likelihood) : undefined}
          options={levels}
        />
      </div>
      <div onChange={(e) => setS(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="haz.severity"
          name="severity"
          required
          defaultValue={r ? String(r.severity) : undefined}
          options={levels}
        />
      </div>
      <p
        role="status"
        className={`rounded-md px-3 py-2 text-sm md:col-span-2 ${need ? "border border-[var(--warn)] bg-[var(--warn-soft)]" : "bg-[var(--accent-soft)]"}`}
      >
        {score
          ? `위험성 ${l} × ${s} = ${score}점. ${need ? `${HA_MEASURE_SCORE}점 이상이라 감소 대책·담당·기한을 정해야 확정할 수 있습니다.` : "현재 관리로 둡니다. 대책을 적어도 됩니다."}`
          : "가능성과 중대성을 고르면 위험성이 나옵니다."}
      </p>
      <SelectField
        help="haz.measureType"
        name="measureType"
        defaultValue={r?.measureType ?? ""}
        placeholder="대책 종류(우선순위 순)"
        options={Object.entries(MEASURE_TYPES).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <TextField
        help="haz.measure"
        name="measure"
        defaultValue={r?.measure ?? ""}
      />
      <SelectField
        help="haz.ownerId"
        name="ownerId"
        defaultValue={r?.ownerId ?? ""}
        placeholder="담당 고르기"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
      />
      <DateField
        help="haz.due"
        name="due"
        defaultValue={r?.due ?? ""}
        quick={["week", "nextMonth"]}
      />
    </>
  );
}
