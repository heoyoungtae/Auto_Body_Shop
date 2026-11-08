"use client";
// 근로계약서 칸(표준근로계약서 항목 순서). 적는 동안 하루·주 근로시간, 시간당 임금, 법 위반·주의 사항을 바로 보여 준다.
import { useEffect, useRef, useState } from "react";
import { checkContract, CONTRACT_TYPES, INSURANCES, PAY_METHODS, PAY_TYPES, WEEKDAYS, type ContractTerms } from "@/modules/staff/contract-rules";
import { TIME_OPTIONS } from "@/modules/staff/leave-rules";
import { CheckGroup, DateField, NumberField, SelectField, TextAreaField, TextField } from "../../_input";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const DAY_OPTS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAYS[d] }));
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function readTerms(form: HTMLFormElement | HTMLElement): ContractTerms {
  const v = (n: string) => (form.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ?? "").trim();
  const all = (n: string) => Array.from(form.querySelectorAll<HTMLInputElement>(`[name="${n}"]:checked`)).map((e) => e.value);
  const num = (n: string) => Number(v(n).replace(/[^\d]/g, "")) || 0;
  return {
    contractType: v("contractType") as ContractTerms["contractType"],
    startOn: v("startOn"),
    endOn: v("endOn"),
    place: v("place"),
    duties: v("duties"),
    workDays: all("workDays").map(Number),
    workStart: v("workStart"),
    workEnd: v("workEnd"),
    breakStart: v("breakStart"),
    breakEnd: v("breakEnd"),
    holiday: Number(v("holiday")),
    payType: v("payType") as ContractTerms["payType"],
    basePay: num("basePay"),
    allowances: [0, 1, 2].map((i) => ({ name: v(`allowName${i}`), amount: num(`allowAmount${i}`) })).filter((a) => a.name || a.amount),
    bonus: v("bonus"),
    payDay: num("payDay"),
    payMethod: v("payMethod") as ContractTerms["payMethod"],
    insurances: all("insurances"),
    extra: v("extra"),
  };
}

export function ContractFields({ t, source, minWage, legal5 }: { t: ContractTerms; source: string; minWage: number; legal5: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [r, setR] = useState(() => checkContract(t, { minWage, legal5 }));
  const [payType, setPayType] = useState(t.payType);
  const read = () =>
    setTimeout(() => {
      if (!root.current) return;
      const x = readTerms(root.current);
      setPayType(x.payType);
      setR(checkContract(x, { minWage, legal5 }));
    }, 0);
  useEffect(() => {
    const form = root.current?.closest("form");
    form?.addEventListener("assist:restored", read);
    return () => form?.removeEventListener("assist:restored", read);
  });
  const n = r.numbers;
  const brk = [{ value: "", label: "없음" }, ...TIME_OPTIONS];
  return (
    <div ref={root} className="space-y-5" onInput={read} onChange={read}>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">1~3. 계약 기간·근무 장소·업무</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField help="lc.type" name="contractType" required defaultValue={t.contractType} options={opts(CONTRACT_TYPES)} from={source} />
          <DateField help="lc.startOn" name="startOn" required defaultValue={t.startOn} quick={["today"]} from={source} />
          <DateField help="lc.endOn" name="endOn" defaultValue={t.endOn} quick={[]} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField help="lc.place" name="place" required defaultValue={t.place} from={source} />
          <TextField help="lc.duties" name="duties" required defaultValue={t.duties} from={source} />
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">4~5. 소정근로시간·근무일·휴일</legend>
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField help="lc.workStart" name="workStart" required defaultValue={t.workStart} options={TIME_OPTIONS} />
          <SelectField help="lc.workEnd" name="workEnd" required defaultValue={t.workEnd} options={TIME_OPTIONS} />
          <SelectField help="lc.breakStart" name="breakStart" defaultValue={t.breakStart} options={brk} />
          <SelectField help="lc.breakEnd" name="breakEnd" defaultValue={t.breakEnd} options={brk} />
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <CheckGroup help="lc.workDays" name="workDays" options={DAY_OPTS} defaultChecked={t.workDays.map(String)} />
          <SelectField help="lc.holiday" name="holiday" required defaultValue={String(t.holiday)} options={DAY_OPTS.map((d) => ({ ...d, label: `매주 ${d.label}요일` }))} />
        </div>
        <p className="text-sm text-[var(--muted)]">
          하루 {n.daily}시간(휴게 {n.breakMinutes}분) · 주 {n.weekly}시간 · 월 소정근로시간(주휴 포함) {n.monthHours}시간
        </p>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">6. 임금</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField help="lc.payType" name="payType" required defaultValue={t.payType} options={opts(PAY_TYPES)} />
          <NumberField help="lc.basePay" name="basePay" required defaultValue={t.basePay || null} unit={payType === "hourly" ? "원/시간" : "원/월"} min={1} />
          <TextField help="lc.bonus" name="bonus" defaultValue={t.bonus} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 md:grid-cols-3">
            <TextField help="lc.allowName" name={`allowName${i}`} defaultValue={t.allowances[i]?.name ?? ""} suggestions={["식대", "직책수당", "자격수당", "기술수당", "교통비"].map((value) => ({ value }))} />
            <NumberField help="lc.allowAmount" name={`allowAmount${i}`} defaultValue={t.allowances[i]?.amount ?? null} unit="원/월" />
          </div>
        ))}
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField help="lc.payDay" name="payDay" required defaultValue={t.payDay} unit="일(매월)" min={1} max={31} />
          <SelectField help="lc.payMethod" name="payMethod" required defaultValue={t.payMethod} options={opts(PAY_METHODS)} />
        </div>
        <p className="text-sm text-[var(--muted)]">
          시간당 {n.hourly ? won(n.hourly) : "—"} (최저임금 {won(minWage)}){payType === "monthly" && n.monthHours ? ` · 최저 월 ${won(minWage * n.monthHours)}` : ""}
        </p>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">7~8. 연차·사회보험·기타</legend>
        <CheckGroup help="lc.insurances" name="insurances" options={opts(INSURANCES)} defaultChecked={t.insurances} />
        <TextAreaField help="lc.extra" name="extra" defaultValue={t.extra} rows={2} />
      </fieldset>
      {(r.errors.length > 0 || r.warnings.length > 0) && (
        <div role="status" className="space-y-1 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
          {r.errors.map((e) => (
            <p key={e}>
              <b>저장 안 됨:</b> {e}
            </p>
          ))}
          {r.warnings.map((w) => (
            <p key={w}>주의: {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
