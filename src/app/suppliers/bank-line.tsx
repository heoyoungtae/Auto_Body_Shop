// 협력업체 입금 계좌 한 줄: 지급·정산 화면(발주·외주)과 업체 화면에서 같이 쓴다
import Link from "next/link";
import type { SupplierBank } from "@/modules/purchase/supplier";
import { Badge, fmtTime } from "../_ui";

/** here: 업체 화면 안이면 업체 화면으로 가는 링크를 빼고 안내만 */
export function BankLine({
  bank,
  supplierId,
  here,
}: {
  bank: SupplierBank | null;
  supplierId: string;
  here?: boolean;
}) {
  if (!bank)
    return (
      <p className="text-sm text-[var(--muted)]">
        입금 계좌가 없습니다.{" "}
        {here ? (
          "통장 사본을 받아 회계 담당·대표가 넣습니다."
        ) : (
          <Link
            href={`/suppliers/${supplierId}#bank`}
            className="text-[var(--accent)]"
          >
            업체 화면에서 넣기
          </Link>
        )}
      </p>
    );
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <b>{bank.bankName}</b>
        <span className="font-mono">{bank.full ?? bank.masked}</span>
        <span>예금주 {bank.holder}</span>
        {bank.verified ? (
          <Badge tone="ok">확인됨</Badge>
        ) : (
          <Badge tone="danger">확인 전 — 입금하지 마세요</Badge>
        )}
      </p>
      {bank.verified && (
        <p className="text-xs text-[var(--muted)]">
          {bank.verifiedByName ?? "-"} 확인 · {fmtTime(bank.verifiedAt)} ·{" "}
          {bank.verifyNote}
        </p>
      )}
      {!bank.verified && (
        <p className="text-xs text-[var(--danger)]">
          계좌가 새로 들어오거나 바뀌었습니다. 업체 대표 번호로 전화해 확인한 뒤{" "}
          {here ? (
            "아래에서"
          ) : (
            <Link href={`/suppliers/${supplierId}#bank`} className="underline">
              업체 화면에서
            </Link>
          )}{" "}
          &apos;전화로 확인함&apos;을 누르세요.
        </p>
      )}
    </div>
  );
}
