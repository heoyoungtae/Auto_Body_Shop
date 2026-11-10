// 교육 계획 칸(만들기·고치기 같이 씀)
import type { training } from "@/db/schema";
import { DEFAULT_PLAN, TR_KINDS } from "@/modules/staff/training-rules";
import { SelectField, TextField } from "../_input";

type T = typeof training.$inferSelect;
export function TrainingFields({
  t,
  users,
  year,
  kind,
  from,
  target,
}: {
  t?: T;
  users: { id: string; name: string }[];
  year: number;
  kind?: string;
  from?: string;
  target?: string;
}) {
  const defaultTitle =
    t?.title ??
    (kind
      ? (DEFAULT_PLAN.find((p) => p.kind === kind)?.title ??
        (kind === "safety_hire" ? "채용 시 안전보건·직무 입문 교육" : ""))
      : "");
  return (
    <>
      <SelectField
        help="tr.kind"
        name="kind"
        required
        defaultValue={t?.kind ?? kind ?? ""}
        placeholder="종류 고르기"
        options={Object.entries(TR_KINDS).map(([k, v]) => ({
          value: k,
          label: `${v.label}${v.legal ? " · 법정" : ""}`,
        }))}
      />
      <TextField
        help="tr.title"
        name="title"
        required
        defaultValue={defaultTitle}
        suggestions={[...new Set(DEFAULT_PLAN.map((p) => p.title))].map(
          (v) => ({ value: v }),
        )}
        from={from}
      />
      <TextField
        help="tr.year"
        name="year"
        required
        type="number"
        inputMode="numeric"
        min={2020}
        max={2100}
        defaultValue={String(t?.year ?? year)}
      />
      <TextField
        help="tr.plannedMonth"
        name="plannedMonth"
        type="month"
        defaultValue={t?.plannedMonth ?? ""}
      />
      <TextField
        help="tr.plannedHours"
        name="plannedHours"
        type="number"
        inputMode="decimal"
        step={0.5}
        min={0.5}
        max={100}
        defaultValue={t?.plannedHours != null ? String(t.plannedHours) : ""}
      />
      <TextField
        help="tr.target"
        name="target"
        defaultValue={t?.target ?? target ?? ""}
        suggestions={[
          "전 직원",
          "전 직원·대표",
          "도장·조색 담당",
          "판금·용접·검사 담당",
          "신규 입사자",
          "화학물질 취급자",
        ].map((v) => ({ value: v }))}
      />
      <SelectField
        help="tr.organizerId"
        name="organizerId"
        defaultValue={t?.organizerId ?? ""}
        placeholder="나중에 정함"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
      />
    </>
  );
}
