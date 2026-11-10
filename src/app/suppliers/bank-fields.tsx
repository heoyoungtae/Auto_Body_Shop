"use client";
// 입금 계좌 칸: 은행 고르기, 계좌번호, 예금주. 저장 전에 예금주·번호·변경 경고를 바로 보여 준다
import { useState } from "react";
import { BANKS, bankAccountIssue, holderMismatch } from "@/modules/purchase/rules";
import { TextField } from "../_input";

/** optional: 후보 등록 화면처럼 계좌를 안 넣어도 되는 곳(셋 중 하나라도 적으면 셋 다 필요). nameField: 업체 이름을 읽어 올 칸 이름 */
export function BankFields({ supplierName, bankName, holder, hasAccount, optional, nameField }: { supplierName?: string; bankName: string; holder: string; hasAccount: boolean; optional?: boolean; nameField?: string }) {
  const [no, setNo] = useState("");
  const [h, setH] = useState(holder);
  const [bank, setBank] = useState(bankName);
  const readName = () => supplierName ?? (nameField && typeof document !== "undefined" ? ((document.querySelector(`input[name="${nameField}"]`) as HTMLInputElement | null)?.value.trim() ?? "") : "");
  const name = readName();
  const need = !optional || !!(no.trim() || h.trim() || bank.trim());
  const warnings: string[] = [];
  const issue = no.trim() ? bankAccountIssue(no) : null;
  if (issue) warnings.push(issue);
  if (holderMismatch(h, name)) warnings.push(`예금주(${h.trim()})가 업체 이름(${name})과 다릅니다. 통장 사본을 다시 보세요 — 대표 개인 계좌라면 메모에 이유를 남기세요`);
  if (hasAccount && (no.trim() || h !== holder)) warnings.push("저장하면 지금 계좌가 바뀌어 '확인'이 풀리고 대표에게 알림이 갑니다. 다른 사람이 업체에 전화로 확인해야 지급에 씁니다");
  return (
    <>
      <TextField help="sup.bankName" name="bankName" required={need} value={bank} onChange={(e) => setBank(e.currentTarget.value)} suggestions={BANKS.map((b) => ({ value: b }))} />
      <TextField help="sup.bankAccount" name="accountNo" inputMode="numeric" autoComplete="off" required={need && !hasAccount} placeholder={hasAccount ? "비워 두면 지금 번호 그대로" : undefined} value={no} onChange={(e) => setNo(e.currentTarget.value)} />
      <TextField help="sup.bankHolder" name="holder" required={need} value={h} onChange={(e) => setH(e.currentTarget.value)} from={!holder && h && h === name ? "업체 이름" : undefined} />
      <div className="flex items-end">
        {!h && (
          <button type="button" className="text-sm text-[var(--accent)]" onClick={() => setH(readName())}>
            예금주 = 업체 이름
          </button>
        )}
      </div>
      {warnings.length > 0 && (
        <ul role="status" className="space-y-1 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm md:col-span-2">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </>
  );
}
