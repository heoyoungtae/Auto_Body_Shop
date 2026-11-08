"use client";
// 근태 신청서 입력: 종류에 따라 칸이 바뀌고(기간·하루·시각), 저장 전에 일수·남은 연차를 미리 보여 준다.
import { useRef, useState } from "react";
import type { ShopCalendar } from "@/modules/platform/business-days";
import { businessDaysBetween, hoursBetween, isLeaveKind, LEAVE_KINDS, TIME_OPTIONS, WEEKLY_OVERTIME_MAX } from "@/modules/staff/leave-rules";
import { DateField, SelectField, TextAreaField } from "../_input";

const KIND_OPTIONS = Object.entries(LEAVE_KINDS).map(([value, k]) => ({ value, label: `${k.label} — ${k.hint}` }));

export function LeaveFields({ cal, today, remain }: { cal: ShopCalendar; today: string; remain: number | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState("");
  const [vals, setVals] = useState({ fromDate: "", toDate: "", fromTime: "", toTime: "" });
  const read = () => {
    const f = (n: string) => root.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`)?.value ?? "";
    setKind(f("leaveKind"));
    setVals({ fromDate: f("fromDate"), toDate: f("toDate"), fromTime: f("fromTime"), toTime: f("toTime") });
  };
  const k = isLeaveKind(kind) ? LEAVE_KINDS[kind] : null;

  let preview: { text: string; warn?: string } | null = null;
  if (k && vals.fromDate) {
    if (k.unit === "day") {
      const to = vals.toDate || vals.fromDate;
      const n = to >= vals.fromDate ? businessDaysBetween(vals.fromDate, to, cal) : 0;
      preview = { text: `영업일 ${n}일${k.deduct ? ` — 연차 ${n}일 사용` : ""}`, warn: !n ? "고른 기간이 모두 쉬는 날이거나 끝나는 날이 앞섭니다" : k.deduct && remain != null && n > remain ? `남은 연차(${remain}일)보다 많습니다` : undefined };
    } else if (k.unit === "half") {
      preview = { text: "연차 0.5일 사용", warn: remain != null && remain < 0.5 ? `남은 연차가 ${remain}일입니다` : undefined };
    } else if (vals.fromTime && vals.toTime) {
      const h = hoursBetween(vals.fromTime, vals.toTime);
      preview = { text: h ? `${h}시간` : "", warn: h == null ? "끝 시각이 시작보다 뒤여야 합니다" : kind === "overtime" && h > WEEKLY_OVERTIME_MAX ? `주 ${WEEKLY_OVERTIME_MAX}시간을 넘습니다` : undefined };
    }
    if (k.ahead && vals.fromDate < today) preview = { text: preview?.text ?? "", warn: `${k.label}는 미리 신청합니다. 지난 날짜는 저장되지 않습니다` };
  }

  return (
    <div ref={root} className="space-y-3" onChange={read} onInput={read}>
      <SelectField help="leave.kind" name="leaveKind" required placeholder="고르기" options={KIND_OPTIONS} />
      {k && (
        <div className="grid gap-3 md:grid-cols-2">
          <DateField help={k.unit === "day" ? "leave.fromDate" : "leave.date"} name="fromDate" required defaultValue={k.ahead ? "" : today} quick={k.ahead ? ["tomorrow", "week", "nextMonth"] : ["today"]} />
          {k.unit === "day" && <DateField help="leave.toDate" name="toDate" quick={[]} />}
          {k.unit === "time" && (
            <>
              <SelectField help="leave.fromTime" name="fromTime" required placeholder="고르기" defaultValue={kind === "overtime" ? "18:00" : ""} options={TIME_OPTIONS} />
              <SelectField help="leave.toTime" name="toTime" required placeholder="고르기" options={TIME_OPTIONS} />
            </>
          )}
        </div>
      )}
      {preview && (preview.text || preview.warn) && (
        <p className={`rounded-md border px-3 py-2 text-sm ${preview.warn ? "border-[var(--warn)] bg-[var(--warn-soft)]" : "border-[var(--line)]"}`}>
          {preview.text}
          {preview.warn && <b className="block">{preview.warn}</b>}
        </p>
      )}
      <TextAreaField help="leave.reason" name="reason" required rows={2} />
    </div>
  );
}
