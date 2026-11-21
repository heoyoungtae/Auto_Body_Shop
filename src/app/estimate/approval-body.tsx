// 고객 견적 승인 본문: 문자 링크(/estimate/[token])와 내 차 수첩(/my/estimate/[id])이 같이 쓴다.
import type { approvalView } from "@/modules/repair/estimate-approval";
import { ESTIMATE_KIND, LINE_CATEGORIES } from "@/modules/repair/estimate-rules";
import { AssistForm } from "../_assist";
import { koMoney } from "../_format";
import { AmountChecklist, CheckGroup, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { ErrorBox } from "../_ui";
import { SignaturePad } from "../repairs/signature-pad";
import { ApprovalMap } from "../repairs/approval-map";

const won = (n: number) => n.toLocaleString("ko-KR");
type Open = Extract<Awaited<ReturnType<typeof approvalView>>, { state: "open" }>;

export function ApprovalBody({ open, error, action, hidden }: { open: Open; error?: string; action: (form: FormData) => Promise<void>; hidden: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <ErrorBox message={error} />
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
        <p>
          {open.name} 고객님, <b>{open.plateNo}</b> {open.carName} 차량의 수리 견적입니다.
        </p>
        <p className="mt-1 text-[var(--muted)]">
          견적서 {open.docNo} · {ESTIMATE_KIND[open.kind as keyof typeof ESTIMATE_KIND]} · 발급 {open.issuedOn} · 유효 {open.validUntil}까지{open.dueDate ? ` · 출고 예정 ${open.dueDate}` : ""}
        </p>
        <table className="mt-3 w-full">
          <tbody className="divide-y divide-[var(--line)]">
            {open.lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5 pr-2">
                  {l.name}
                  <span className="ml-1 text-xs text-[var(--muted)]">
                    {LINE_CATEGORIES[l.category as keyof typeof LINE_CATEGORIES]}
                    {l.partCode ? ` · 부품 코드 ${l.partCode}` : ""}
                    {l.category === "part" && l.qty > 1 ? ` · ${l.qty}개` : ""}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{won(l.qty * l.unitWon + l.laborWon)}원</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--line-strong)]">
            <tr>
              <td className="py-1 pr-2 text-right">계 · 부가가치세</td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap">
                {won(open.totals.sum)} · {won(open.totals.vat)}
              </td>
            </tr>
            <tr className="font-bold">
              <td className="py-1.5 pr-2 text-right">총액</td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                {won(open.totals.total)}원<span className="block text-xs font-normal text-[var(--muted)]">{koMoney(open.totals.total)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-[var(--muted)]">
          <li>부품 코드: A 신품 · B 재제조품 · C 중고품(재생품 포함) · D 인증대체부품 · F 수입부품</li>
          <li>견적에 없는 부품·작업을 더할 때는 미리 동의를 받으며, 동의하신 작업만 비용을 받습니다.</li>
          <li>부품가는 견적일 기준입니다.</li>
        </ul>
      </div>

      <AssistForm id={`approve-${open.docNo}`} action={action} className="space-y-4">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {open.zones.length > 0 && <ApprovalMap zones={open.zones} car={open.car} />}
        <AmountChecklist
          help="approve.groups"
          name="groups"
          totalLabel="고른 작업(부가세 별도)"
          options={open.groups.map((g) => ({ value: g.key, label: g.names.length > 1 ? `${g.names[0]} 외 ${g.names.length - 1}건` : g.names[0], sub: g.names.length > 1 ? g.names.join(" · ") : undefined, amount: g.sum }))}
        />
        <TextField help="approve.name" name="approverName" required autoComplete="name" />
        <CheckGroup help="approve.agree" name="agree" options={[{ value: "yes", label: "견적 내용을 확인했고, 고른 작업을 승인합니다(모두 빼면 승인하지 않음)" }]} />
        <SignaturePad hint="손가락으로 이 칸에 서명해 주세요" />
        <SubmitButton full>보내기</SubmitButton>
      </AssistForm>
    </div>
  );
}
