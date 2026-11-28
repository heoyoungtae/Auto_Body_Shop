// 임금명세서 줄(지급·공제, 계산 방법) — 급여대장·명세서 같이 씀(근로기준법 제48조 기재 사항)
import { PAY_ITEM_TAX, payItemKey } from "@/modules/help/pay-items";
import type { SlipData } from "@/modules/staff/payroll-rules";
import { HelpButton } from "../_help-drawer";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** limits: 도움말 한도에 채울 정책값(키 → 원) */
export function SlipLines({ d, limits = {} }: { d: SlipData; limits?: Record<string, number> }) {
  const help = (p: SlipData["pays"][number], side: "pay" | "deduct") => {
    const id = payItemKey(p, d, side);
    const h = PAY_ITEM_TAX[id] as { limit?: string; limitKey?: string };
    const v = h.limitKey ? limits[h.limitKey] : undefined;
    const limit = h.limit && v != null ? h.limit.replace("{v}", won(v)) : h.limit?.replace(" {v}", "");
    return <HelpButton topic={{ kind: "pay", id, limit }} name={`${p.name} 과세·비과세`} />;
  };
  const table = (title: string, rows: SlipData["pays"], total: number) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--muted)]">
          <th className="py-1 pr-2">{title}</th>
          <th className="py-1 pr-2 text-right">금액</th>
          <th className="py-1">계산 방법</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr
            key={`${p.code}-${i}`}
            className="border-t border-[var(--line)] align-top"
          >
            <td className="py-1 pr-2">
              <span className="print:hidden">{help(p, title === "공제" ? "deduct" : "pay")}</span>{" "}
              {p.name}
              {p.taxfree ? (
                <span className="text-xs text-[var(--muted)]">
                  {" "}
                  (비과세 {won(p.taxfree)})
                </span>
              ) : null}
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">
              {won(p.amount)}
            </td>
            <td className="py-1 text-xs text-[var(--muted)]">{p.calc}</td>
          </tr>
        ))}
        <tr className="border-t border-[var(--line)] font-medium">
          <td className="py-1 pr-2">합계</td>
          <td className="py-1 pr-2 text-right tabular-nums">{won(total)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
  return (
    <div className="grid gap-3">
      <p className="text-xs text-[var(--muted)]">
        근무 기간 {d.period.from}~{d.period.to}
        {d.period.days < d.period.monthDays
          ? `(${d.period.days}/${d.period.monthDays}일)`
          : ""}{" "}
        · 연장 {d.att.overtime}시간 · 야간 {d.att.night}시간 · 휴일{" "}
        {d.att.holiday + d.att.holidayOver8}시간 · 결근 {d.att.absentDays}일 ·
        무급 병가 {d.att.sickDays}일 · 지각·조퇴·외출 {d.att.shortHours}시간
      </p>
      {d.fixedOt && (
        <p className="rounded-md border border-[var(--line)] px-2 py-1 text-xs">
          고정 연장근로수당: 약정 월 {d.fixedOt.hours}시간 · 이달 인정 연장 {d.fixedOt.actual}시간(법정 수당 {won(d.fixedOt.legal)}) →{" "}
          {d.fixedOt.diff ? <b>차액 {won(d.fixedOt.diff)} 더 지급</b> : "차액 없음(약정보다 덜 일해도 고정 수당은 그대로)"}
        </p>
      )}
      {table("지급", d.pays, d.gross)}
      {table("공제", d.deducts, d.deductTotal)}
      <p className="text-right text-base font-semibold">
        실지급액 {won(d.net)}
      </p>
    </div>
  );
}

/** 회사 부담(급여에서 떼지 않고 회사가 따로 내는 보험료·퇴직급여 적립) — 대표·회계만 봄 */
export function EmployerLines({ d }: { d: SlipData }) {
  if (!d.employer?.length) return null;
  return (
    <details className="rounded-md border border-[var(--line)] p-2 text-sm">
      <summary className="cursor-pointer">
        회사 부담 {won(d.employerTotal ?? 0)} · 이 사람 인건비 합계{" "}
        <b>{won(d.gross + (d.employerTotal ?? 0))}</b>
      </summary>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {d.employer.map((p) => (
            <tr key={p.code} className="border-t border-[var(--line)] align-top">
              <td className="py-1 pr-2">{p.name}</td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {won(p.amount)}
              </td>
              <td className="py-1 text-xs text-[var(--muted)]">{p.calc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
