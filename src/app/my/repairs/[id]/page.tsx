// 수리 한 건: 단계·출고 예정, 부위별 작업 진행 그림, 수리 전·후 사진, 견적서·명세서, 보증·보증 신청.
// 그림·사진·서류는 모두 정비소 전표(진단·작업 지시서·검사·명세서)에서 불러온다. 사내 메모·담당 이름은 보내지 않는다
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { myRepair } from "@/modules/carbook/service";
import { daysLeft } from "@/modules/carbook/rules";
import { CP_STATUS, VERDICTS } from "@/modules/cs/rules";
import { processLabel } from "@/modules/repair/work-rules";
import { seoulDate } from "@/modules/platform/time";
import { UserError } from "@/modules/platform/errors";
import { Badge, buttonClass, Card, Notice, PageTitle } from "../../../_ui";
import { CarMap } from "../../../repairs/car-map";
import { progressFills, progressPins, ProgressLegend } from "../../../repairs/damage-map";
import { requireMy } from "../../_session";
import { LinkOnlyNote, MySteps, PhotoGrid } from "../../_parts";

export default async function MyRepairPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ claimed?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const s = await requireMy();
  let r: Awaited<ReturnType<typeof myRepair>>;
  try {
    r = await myRepair(await getDb(), s, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const today = seoulDate();
  const prog = r.progress ?? new Map();
  const raw = r.damages.map((d) => d.raw);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.repair" sub={`${r.plateNo} ${r.car} · ${r.inOn} 입고${r.mileage != null ? ` · ${r.mileage.toLocaleString("ko-KR")}km` : ""}`}>
        {r.statusLabel}
      </PageTitle>
      {q.claimed && <Notice>보증 신청을 받았습니다. 정비소가 1영업일 안에 연락드립니다.</Notice>}
      {s.scope === "link" && <LinkOnlyNote next={`/my/repairs/${r.id}`} />}
      {r.status !== "cancelled" && <MySteps steps={r.steps} />}
      {r.dueDate && !["ready", "delivered", "cancelled"].includes(r.status) && <p className="text-sm">출고 예정 <b>{r.dueDate}</b> <span className="text-[var(--muted)]">(바뀌면 연락드립니다)</span></p>}

      {r.awaiting.map((a) => (
        <Link key={a.id} href={`/my/estimate/${a.id}`} className="flex items-center justify-between rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-3 py-3">
          <span>
            <b>견적 승인이 필요합니다</b>
            <span className="block text-xs text-[var(--muted)]">
              {a.total.toLocaleString("ko-KR")}원 · {a.validUntil}까지
            </span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      ))}

      {r.damages.length > 0 && (
        <Card title="부위별 작업 진행" help={{ kind: "panel", id: "my.progress" }}>
          <CarMap label="부위별 작업 진행(회색=작업 전, 주황=작업 중, 초록=끝)" fills={progressFills(raw, prog)} pins={progressPins(raw, prog, processLabel)} car={r.look} />
          <ProgressLegend list={raw} prog={prog} processName={processLabel} />
        </Card>
      )}

      {(r.before.length > 0 || r.after.length > 0) && (
        <Card title="사진" help={{ kind: "panel", id: "my.photos" }}>
          <div className="space-y-3">
            <PhotoGrid paths={r.before} label="입고 때" />
            <PhotoGrid paths={r.after} label="수리 후(출고 검사)" />
          </div>
        </Card>
      )}

      {(r.estimates.length > 0 || r.statement) && (
        <Card title="서류" help={{ kind: "panel", id: "my.papers" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {r.statement && (
              <li>
                <Link href={`/my/docs/statement/${r.id}`} className="flex justify-between gap-2 py-2.5 hover:underline">
                  <span>정비명세서 {r.statement.docNo}</span>
                  <span className="text-[var(--muted)]">{r.statement.total.toLocaleString("ko-KR")}원 →</span>
                </Link>
              </li>
            )}
            {r.estimates.map((e) => (
              <li key={e.id}>
                <Link href={`/my/docs/estimate/${e.id}`} className="flex justify-between gap-2 py-2.5 hover:underline">
                  <span>
                    견적서{e.rev > 1 ? `(${e.rev}차)` : ""} {e.docNo} <span className="text-xs text-[var(--muted)]">{e.kind}</span>
                  </span>
                  <span className="text-[var(--muted)]">{e.total.toLocaleString("ko-KR")}원 →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.status === "delivered" && (
        <Card title="보증" help={{ kind: "panel", id: "my.warranty" }}>
          {r.warranty.all.length ? (
            <ul className="space-y-1 text-sm">
              {r.warranty.all.map((w) => {
                const left = daysLeft(w.until, today);
                return (
                  <li key={w.kind} className="flex justify-between gap-2">
                    <span>{w.kind}</span>
                    <span className={left >= 0 ? "" : "text-[var(--muted)]"}>{left >= 0 ? `${w.until}까지(남은 ${left}일)` : `${w.until} 끝남`}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">명세서에 적힌 사내 보증이 없습니다.</p>
          )}
          <Link href={`/my/warranty/${r.id}`} className={`${buttonClass(r.warranty.inWarranty ? "primary" : "secondary")} mt-3 w-full`}>
            이상이 있어요 · 보증 신청
          </Link>
        </Card>
      )}

      {r.claims.length > 0 && (
        <Card title="보증 신청 기록" help={{ kind: "panel", id: "my.claims" }}>
          <ul className="space-y-2 text-sm">
            {r.claims.map((c) => (
              <li key={c.id}>
                <p className="flex items-center justify-between gap-2">
                  <span>{seoulDate(c.receivedAt)} 신청</span>
                  <Badge tone={c.status === "closed" ? "ok" : "warn"}>{CP_STATUS[c.status as keyof typeof CP_STATUS] ?? c.status}</Badge>
                </p>
                <p className="text-[var(--muted)]">{c.content}</p>
                {c.verdict && <p>판정: {VERDICTS[c.verdict as keyof typeof VERDICTS] ?? c.verdict}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
