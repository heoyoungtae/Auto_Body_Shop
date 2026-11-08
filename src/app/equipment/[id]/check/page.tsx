import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { CHECK_KINDS, MARKS } from "@/modules/equipment/rules";
import { getEquipment } from "@/modules/equipment/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { DateField, RadioRow, TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Card, ErrorBox, PageTitle } from "../../../_ui";
import { checkAction } from "../../actions";

/** 설비 점검(F-08-02): 휴대폰에서 항목마다 ○△×- 를 누른다. ×면 사용 금지·고장 기록 */
export default async function EquipmentCheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; error?: string }> }) {
  const { id } = await params;
  const { kind: k, error } = await searchParams;
  const kind = k === "monthly" ? "monthly" : "daily";
  const user = await requireUser();
  const db = await getDb();
  const r = await getEquipment(db, id).catch(() => null);
  if (!r) notFound();
  const { e, checks } = r;
  const items = kind === "monthly" ? e.monthlyItems : e.dailyItems;
  const last = checks.find((c) => c.kind === kind);
  const today = seoulDate();
  const back = (
    <Link href={`/equipment/${id}`} className="text-sm text-[var(--accent)]">
      ← {e.name}
    </Link>
  );
  const title = `${e.name} ${CHECK_KINDS[kind]}`;
  if (!can(user, "equip.check")) {
    return (
      <>
        <PageTitle help="equip.check" actions={back}>
          {title}
        </PageTitle>
        <ErrorBox message="설비 점검은 기술자·공장장·안전환경·품질 담당이 합니다." />
      </>
    );
  }
  return (
    <>
      <PageTitle help="equip.check" sub={`${e.no} · ○ 양호 · △ 주의(조치 후 사용) · × 이상(사용 금지) · - 비가동`} actions={back}>
        {title}
      </PageTitle>
      <ErrorBox message={error} />
      {e.status === "stopped" && <ErrorBox message={`이 설비는 지금 사용 금지입니다(${e.stopReason}). 점검은 기록할 수 있지만 공장장 확인 전에는 쓰지 마세요.`} />}
      <Card title="점검 항목" help={{ kind: "panel", id: "equip.checkForm" }}>
        {items.length ? (
          <AssistForm id={`check-${id}-${kind}-${today}`} action={checkAction} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="n" value={items.length} />
            <DateField help="chk.date" name="date" required defaultValue={today} quick={["today"]} />
            <p className="text-xs text-[var(--muted)]">점검은 실제로 보고 고르도록 미리 골라 두지 않습니다. 항목 아래에 지난 점검 결과가 보입니다.</p>
            <ol className="space-y-4">
              {items.map((it, i) => {
                const prev = last?.results.find((x) => x.item === it.item);
                return (
                  <li key={it.item} className="rounded-md border border-[var(--line)] p-3">
                    <RadioRow
                      help="chk.mark"
                      label={`${i + 1}. ${it.item}${it.std ? ` — 기준: ${it.std}` : ""}`}
                      name={`m${i}`}
                      required
                      options={Object.entries(MARKS).map(([value, label]) => ({ value, label, tone: value === "o" ? "ok" : value === "tri" ? "warn" : value === "x" ? "danger" : undefined }))}
                    />
                    {prev && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        지난 점검({last!.checkDate}): {MARKS[prev.mark]}
                        {prev.note && ` — ${prev.note}`}
                      </p>
                    )}
                    <div className="mt-2">
                      <TextField help="chk.note" name={`n${i}`} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <TextField help="chk.memo" name="note" />
            <SubmitButton full>점검 저장</SubmitButton>
          </AssistForm>
        ) : (
          <ErrorBox message="점검 항목이 없습니다. 공장장이 설비 대장에서 점검 항목을 먼저 정해야 합니다." />
        )}
      </Card>
    </>
  );
}
