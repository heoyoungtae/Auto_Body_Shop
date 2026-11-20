// 통장 거래의 짝 후보 단추(통장·카드 내역과 입출금 화면이 같이 쓴다). 고르면 수납 적기·보험 입금 확인·지급 처리·급여 지급·청구서 입금·잇기
import Link from "next/link";
import type { Cand } from "@/modules/bank/service";
import { TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { buttonClass } from "../../_ui";
import { txAction } from "./actions";

export function TxHidden({ txId, intent, back }: { txId: string; intent: string; back: string }) {
  return (
    <>
      <input type="hidden" name="txId" value={txId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

export function CandButton({ txId, c, back }: { txId: string; c: Cand; back: string }) {
  if (c.act === "receipt")
    return (
      <Link href={`/money/ro/${c.id}?tx=${txId}#pay`} className={buttonClass("secondary")}>
        수납 적기
      </Link>
    );
  if (c.act === "claim")
    return (
      <form action={txAction} className="flex flex-wrap items-end gap-2">
        <TxHidden txId={txId} intent="claim" back={back} />
        <input type="hidden" name="roId" value={c.id} />
        {(c.cutWon ?? 0) > 0 && <TextField help="bank.cutReason" name="cutReason" required />}
        <div>
          <SubmitButton>보험 입금 확인</SubmitButton>
        </div>
      </form>
    );
  return (
    <form action={txAction}>
      <TxHidden txId={txId} intent={c.act === "link" ? "link" : c.act} back={back} />
      <input type="hidden" name="kind" value={c.kind} />
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="no" value={c.no} />
      <input type="hidden" name="note" value={c.note ?? ""} />
      <SubmitButton>{c.act === "pay" ? "지급 처리" : c.act === "payroll" ? "급여 지급 처리" : c.act === "bill" ? "청구서 입금 적기" : "잇기"}</SubmitButton>
    </form>
  );
}
