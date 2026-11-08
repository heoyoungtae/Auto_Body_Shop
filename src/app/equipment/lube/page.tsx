import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { dueState, DUE_LABEL, DUE_TONE, LUBE_STATES } from "@/modules/equipment/rules";
import { listLubePoints } from "@/modules/equipment/service";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { lubeAction } from "../actions";

/** 윤활(F-08-03): 기한 순 윤활 개소, 개소마다 바로 기록 */
export default async function LubePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; all?: string }> }) {
  const { error, notice, all } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const pol = await loadPolicy(db);
  const alert = pol["lube.alert_days_before"];
  const rows = await listLubePoints(db);
  const shown = all === "1" ? rows : rows.filter((r) => dueState(r.p.nextDueOn, today, alert) !== "ok");
  const write = can(user, "equip.check");
  return (
    <>
      <PageTitle help="equip.lube" sub={`기한 ${alert}일 전부터 보이고 알림이 갑니다(정책값). 개소표는 설비 화면에서 공장장이 정합니다.`}>
        윤활
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mb-3 text-sm">
        <Link href={all === "1" ? "/equipment/lube" : "/equipment/lube?all=1"} className="text-[var(--accent)]">
          {all === "1" ? `기한 ${alert}일 안만 보기` : `모든 개소 보기(${rows.length}곳)`}
        </Link>
      </div>
      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map(({ p, eqNo, eqName, eqId, ownerName }) => {
            const st = dueState(p.nextDueOn, today, alert)!;
            return (
              <Card key={p.id} title={`${eqName} ${p.code}`} help={{ kind: "panel", id: "lube.point" }} actions={<Badge tone={DUE_TONE[st]}>{`${DUE_LABEL[st]} ${p.nextDueOn}`}</Badge>}>
                <div id={`p-${p.id}`} className="mb-2 text-sm">
                  <Link href={`/equipment/${eqId}#lube`} className="text-xs text-[var(--accent)]">
                    {eqNo}
                  </Link>{" "}
                  {p.spot} · <b>{p.oil}</b>
                  {p.color && ` · ${p.color} 라벨`}
                  {p.amount && ` · ${p.amount}`}
                  {p.method && ` · ${p.method}`} · {p.cycleDays}일마다 · 담당 {ownerName ?? "-"}
                  {p.lastDoneOn && <div className="text-xs text-[var(--muted)]">지난 윤활 {p.lastDoneOn}</div>}
                </div>
                {write && (
                  <AssistForm id={`lube-${p.id}`} action={lubeAction} className="space-y-2">
                    <input type="hidden" name="pid" value={p.id} />
                    <input type="hidden" name="back" value={all === "1" ? "/equipment/lube?all=1" : "/equipment/lube"} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DateField help="lube.doneOn" name="doneOn" required defaultValue={today} quick={["today"]} />
                      <TextField help="lube.used" name="used" defaultValue={p.amount ?? ""} {...(p.amount ? { from: "개소표" } : {})} />
                    </div>
                    <RadioRow help="lube.state" name="state" required defaultValue="normal" options={Object.entries(LUBE_STATES).map(([value, label]) => ({ value, label, tone: value === "normal" ? "ok" : "warn" }))} />
                    <TextField help="lube.action" name="action" />
                    <SubmitButton variant="secondary">윤활 기록</SubmitButton>
                  </AssistForm>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>{rows.length ? `기한 ${alert}일 안에 드는 윤활 개소가 없습니다.` : "윤활 개소가 없습니다. 설비 화면의 '윤활 개소표'에서 더하세요."}</Empty>
      )}
    </>
  );
}
