// 그쪽 앱(테크베이 등) 진행 상태 '등록함' 단추 줄 — 업체 주문 앱 화면과 수리 건 화면이 같이 쓴다
import { PORTAL_STEPS } from "@/modules/money/credit-rules";
import type { portalOrderView } from "@/modules/partner/service";
import { SubmitButton } from "../_submit";
import { portalStepAction } from "./actions";

type V = NonNullable<Awaited<ReturnType<typeof portalOrderView>>>;

export function PortalSteps({ v, back }: { v: V; back: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(PORTAL_STEPS) as (keyof typeof PORTAL_STEPS)[]).map((s) => {
        const done = v.posted.find((p) => p.step === s);
        if (done)
          return (
            <span key={s} className="rounded-md border border-[var(--ok)] bg-[var(--ok-soft)] px-2 py-1 text-xs">
              ✓ {PORTAL_STEPS[s]} {done.at.slice(5, 16).replace("T", " ")}
            </span>
          );
        if (!v.reached.includes(s))
          return (
            <span key={s} className="rounded-md border border-dashed border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">
              {PORTAL_STEPS[s]}
            </span>
          );
        return (
          <form key={s} action={portalStepAction}>
            <input type="hidden" name="orderId" value={v.o.id} />
            <input type="hidden" name="step" value={s} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton variant="secondary">{PORTAL_STEPS[s]} 등록함</SubmitButton>
          </form>
        );
      })}
      {v.url && (
        <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline">
          그쪽 앱 열기 ↗
        </a>
      )}
    </div>
  );
}
