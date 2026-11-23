import Link from "next/link";

/** 국세청 휴·폐업 경고 띠(지급 결의·거래처 원장·발주서 세금계산서). 문구는 ntsWarning 이 만든다 */
export function NtsWarn({ text, supplierId }: { text: string | null | undefined; supplierId?: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mb-3 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-2 text-sm">
      ⚠ {text}
      {supplierId && (
        <>
          {" "}
          <Link href={`/suppliers/${supplierId}#nts`} className="text-[var(--accent)] underline">
            국세청 사업자 상태 보기
          </Link>
        </>
      )}
    </p>
  );
}
