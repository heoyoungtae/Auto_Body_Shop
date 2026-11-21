// 내 차 수첩 이용 동의(F-13-01 차계부 항목) 카드. 동의해야 '내 기록'과 알림이 열린다
import { CARBOOK_CONSENT_TEXT } from "@/modules/carbook/rules";
import { SubmitButton } from "../../_submit";
import { Card } from "../../_ui";
import { consentAction } from "../actions";

export function ConsentCard({ back }: { back: string }) {
  return (
    <Card title="내 기록 쓰기 전에" help={{ kind: "panel", id: "my.logConsent" }}>
      <p className="mb-2 text-sm">주유·소모품·비용을 적어 두면 연비와 한 달 비용을 보여 드리고, 검사·보증·소모품·보험 만기를 알려 드립니다. 그러려면 적으신 기록을 보관해도 되는지 동의가 필요합니다.</p>
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm">
        <p className="mb-1 font-semibold">{CARBOOK_CONSENT_TEXT.title}</p>
        <ul className="list-disc space-y-1 pl-5">
          {CARBOOK_CONSENT_TEXT.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <form action={consentAction} className="mt-3">
        <input type="hidden" name="agree" value="yes" />
        <input type="hidden" name="back" value={back} />
        <SubmitButton full>동의하고 내 기록 쓰기</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-[var(--muted)]">동의하지 않으셔도 수리 이력·서류·보증은 그대로 보실 수 있습니다. 동의는 더보기에서 언제든 철회할 수 있고, 철회하면 기록을 바로 지웁니다.</p>
    </Card>
  );
}
