"use client";
// 근로계약서 칸(표준근로계약서 항목 순서). 적는 동안 하루·주 근로시간, 시간당 임금, 법 위반·주의 사항을 바로 보여 준다.
import { useEffect, useRef, useState } from "react";
import { checkContract, fixedOtPay, CONTRACT_TYPES, INSURANCES, PAY_METHODS, PAY_TYPES, WEEKDAYS, type ContractTerms } from "@/modules/staff/contract-rules";
import { TIME_OPTIONS } from "@/modules/staff/leave-rules";
import { grossForNet, type PayPolicy } from "@/modules/staff/payroll-rules";
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
    fixedOtHours: num("fixedOtHours"),
  };
}

export function ContractFields({ t, source, minWage, legal5, fixedOtMax = 52, payPol }: { t: ContractTerms; source: string; minWage: number; legal5: boolean; fixedOtMax?: number; payPol?: PayPolicy }) {
  const root = useRef<HTMLDivElement>(null);
  const [r, setR] = useState(() => checkContract(t, { minWage, legal5, fixedOtMax }));
  const [payType, setPayType] = useState(t.payType);
  const [cur, setCur] = useState(t);
  const read = () =>
    setTimeout(() => {
      if (!root.current) return;
      const x = readTerms(root.current);
      setPayType(x.payType);
      setCur(x);
      setR(checkContract(x, { minWage, legal5, fixedOtMax }));
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
        {payPol && payType === "monthly" && <NetHelper pol={payPol} terms={cur} root={root} />}
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
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField help="lc.fixedOtHours" name="fixedOtHours" defaultValue={t.fixedOtHours || null} unit="시간/월" min={0} max={fixedOtMax} />
          <p className="self-end pb-2 text-sm md:col-span-2">
            {cur.fixedOtHours ? (
              <>
                고정 연장근로수당 <b>월 {won(fixedOtPay(cur, legal5))}</b> = 통상시급 {won(n.hourly)} × {cur.fixedOtHours}시간 × {legal5 ? 1.5 : 1} · 주 약 {Math.round((cur.fixedOtHours / 4.345) * 10) / 10}시간
              </>
            ) : (
              <span className="text-[var(--muted)]">비우면 연장은 실제 시간만큼 계산합니다(지금 방식)</span>
            )}
          </p>
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

/**
 * 실수령액 보장 세전 계약(대표 결정 2026-11-25): 직원과 '월 실수령 ○○원'으로 정했으면, 그만큼 받도록 세전 기본급을 거꾸로 구해 넣는다.
 * 계약서·명세서·신고는 세전 금액으로 한다(회사가 근로자 몫 세금·보험료를 대신 내는 네트 약정은 하지 않음).
 */
function NetHelper({ pol, terms, root }: { pol: PayPolicy; terms: ContractTerms; root: React.RefObject<HTMLDivElement | null> }) {
  const [target, setTarget] = useState("");
  const [family, setFamily] = useState("1");
  const [children, setChildren] = useState("0");
  const net = Number(target.replace(/[^\d]/g, "")) || 0;
  const r = net ? grossForNet({ target: net, terms, pol, family: Number(family) || 1, children: Number(children) || 0 }) : null;
  const put = () => {
    if (!r || !root.current) return;
    const raw = root.current.querySelector<HTMLInputElement>('input[name="basePay"]');
    const shown = raw?.dataset.rawFor ? document.getElementById(raw.dataset.rawFor) as HTMLInputElement | null : null;
    if (!shown) return;
    shown.value = r.basePay.toLocaleString("ko-KR");
    shown.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const box = "h-11 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 text-right tabular-nums";
  return (
    <details className="rounded-md border border-[var(--line)] p-3 text-sm">
      <summary className="cursor-pointer font-medium">실수령액으로 기본급 정하기</summary>
      <p className="mt-2 text-xs text-[var(--muted)]">
        직원과 &lsquo;월 실수령 ○○원&rsquo;으로 정했으면 여기 적습니다. 4대보험·소득세를 뺀 뒤 그만큼 받도록 세전 기본급을 계산합니다(연장·결근 없는 보통 달, 아래 고정 수당·약정 연장시간 포함). 계약서·명세서·신고는 세전 금액으로 하고, 연말정산 환급·추가 납부는 직원 몫입니다. 식대(월 20만 원까지)처럼 비과세 수당을 먼저 넣으면 같은 실수령에 세전 금액과 회사 부담 보험료가 줄어듭니다.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="text-xs">목표 실수령(월)</span>
          <input className={`${box} w-40`} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, "") ? Number(e.target.value.replace(/[^\d]/g, "")).toLocaleString("ko-KR") : "")} placeholder="3,000,000" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs">부양가족(본인 포함)</span>
          <input className={`${box} w-20`} inputMode="numeric" value={family} onChange={(e) => setFamily(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs">8~20세 자녀</span>
          <input className={`${box} w-20`} inputMode="numeric" value={children} onChange={(e) => setChildren(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        {r && (
          <button type="button" onClick={put} className="h-11 rounded-md bg-[var(--accent)] px-3 font-semibold text-white">
            기본급 {r.basePay.toLocaleString("ko-KR")}원 넣기
          </button>
        )}
      </div>
      {r && (
        <p className="mt-2 text-xs">
          세전 지급 {r.gross.toLocaleString("ko-KR")}원(비과세 {r.taxfree.toLocaleString("ko-KR")}원{r.fixedOtAmount ? ` · 고정 연장 ${r.fixedOtAmount.toLocaleString("ko-KR")}원` : ""}) − 공제 {r.deductTotal.toLocaleString("ko-KR")}원 = 실수령 <b>{r.net.toLocaleString("ko-KR")}원</b> · 회사 부담 보험료·퇴직 적립 {r.employerTotal.toLocaleString("ko-KR")}원 · 회사 총비용 <b>{r.cost.toLocaleString("ko-KR")}원</b>
          {!r.minWageOk && <span className="text-[var(--warn)]"> · 통상시급이 최저임금보다 적습니다</span>}
        </p>
      )}
    </details>
  );
}
