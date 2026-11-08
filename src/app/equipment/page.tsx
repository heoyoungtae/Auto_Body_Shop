import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { dueState, DUE_LABEL, DUE_TONE, EQ_KINDS, EQ_STATUS, isEqKind, ZONES } from "@/modules/equipment/rules";
import { listEquipment, listOpenFailures, todayBoard } from "@/modules/equipment/service";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";

/** 설비 대장(F-08-01) + 오늘 현황 */
export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ f?: string; all?: string; error?: string; notice?: string }> }) {
  const { f, all, error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const [list, b, fails] = await Promise.all([listEquipment(db, { includeDisposed: all === "1" }), todayBoard(db, today), listOpenFailures(db)]);
  const shown = f === "gauge" ? list.filter((e) => e.calibMonths) : f === "stopped" ? list.filter((e) => e.status === "stopped") : list;
  const manage = can(user, "equip.manage");
  const tabs = [
    ["", "전체"],
    ["gauge", "측정 장비"],
    ["stopped", "사용 금지"],
  ] as const;
  return (
    <>
      <PageTitle
        help="equip.list"
        sub="설비마다 번호(EQ-)·중요도·점검 항목·윤활 개소를 정해 두고, 점검·고장·정비 이력을 모읍니다(STD-08)."
        actions={
          manage && (
            <Link href="/equipment/new" className={buttonClass()}>
              설비 등록
            </Link>
          )
        }
      >
        설비 대장
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="설비 목록" help={{ kind: "panel", id: "equip.list" }}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
            {tabs.map(([k, label]) => (
              <Link key={k} href={k ? `/equipment?f=${k}` : "/equipment"} className={`rounded-full border px-3 py-1 ${(f ?? "") === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                {label}
              </Link>
            ))}
            <Link href={all === "1" ? "/equipment" : "/equipment?all=1"} className="ml-auto text-xs text-[var(--muted)] underline">
              {all === "1" ? "처분한 설비 숨기기" : "처분한 설비도 보기"}
            </Link>
          </div>
          {shown.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">번호</th>
                    <th className="pr-2">설비명</th>
                    <th className="pr-2">종류</th>
                    <th className="pr-2">중요도</th>
                    <th className="pr-2">구역</th>
                    <th className="pr-2">담당</th>
                    <th className="pr-2">오늘 점검</th>
                    <th className="pr-2">교정·법정 검사</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {shown.map((e) => {
                    const calib = dueState(e.calibNextOn, today, 30);
                    const legal = dueState(e.legalNextOn, today, 30);
                    return (
                      <tr key={e.id}>
                        <td className="py-2 pr-2 font-mono text-xs">{e.no}</td>
                        <td className="pr-2">
                          <Link href={`/equipment/${e.id}`} className="font-medium text-[var(--accent)]">
                            {e.name}
                          </Link>
                        </td>
                        <td className="pr-2">{isEqKind(e.kind) ? EQ_KINDS[e.kind].label : e.kind}</td>
                        <td className="pr-2">
                          <Badge tone={e.grade === "A" ? "danger" : e.grade === "B" ? "warn" : "neutral"}>{e.grade}</Badge>
                        </td>
                        <td className="pr-2 text-xs">{e.zone ? ZONES[e.zone as keyof typeof ZONES] : "-"}</td>
                        <td className="pr-2">{e.ownerName ?? "-"}</td>
                        <td className="pr-2">
                          {!e.checkDaily ? (
                            <span className="text-xs text-[var(--muted)]">안 함</span>
                          ) : b.checked.has(e.id) ? (
                            <Badge tone="ok">함</Badge>
                          ) : (
                            <Link href={`/equipment/${e.id}/check`}>
                              <Badge tone="warn">점검하기</Badge>
                            </Link>
                          )}
                        </td>
                        <td className="pr-2 text-xs">
                          {e.calibNextOn && (
                            <div>
                              교정 {e.calibNextOn} {calib && calib !== "ok" && <Badge tone={DUE_TONE[calib]}>{DUE_LABEL[calib]}</Badge>}
                            </div>
                          )}
                          {e.legalNextOn && (
                            <div>
                              검사 {e.legalNextOn} {legal && legal !== "ok" && <Badge tone={DUE_TONE[legal]}>{DUE_LABEL[legal]}</Badge>}
                            </div>
                          )}
                          {!e.calibNextOn && !e.legalNextOn && "-"}
                        </td>
                        <td>
                          <Badge tone={e.status === "in_use" ? "ok" : e.status === "stopped" ? "danger" : "neutral"}>{EQ_STATUS[e.status as keyof typeof EQ_STATUS]}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              action={
                manage && (
                  <Link href="/equipment/new" className={buttonClass("secondary")}>
                    첫 설비 등록
                  </Link>
                )
              }
            >
              등록한 설비가 없습니다. 도장 부스·컴프레서·리프트부터 등록하세요.
            </Empty>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="오늘 할 일" help={{ kind: "panel", id: "equip.today" }}>
            <ul className="space-y-2 text-sm">
              <li>
                <b>일상 점검 남음 {b.unchecked.length}대</b>
                <div className="mt-1 flex flex-wrap gap-1">
                  {b.unchecked.map((e) => (
                    <Link key={e.id} href={`/equipment/${e.id}/check`} className="rounded border border-[var(--line)] px-2 py-0.5 text-xs hover:bg-[var(--surface-2)]">
                      {e.grade === "A" && <span className="text-[var(--danger)]">A </span>}
                      {e.name}
                    </Link>
                  ))}
                </div>
              </li>
              <li>
                <Link href="/equipment/lube" className="text-[var(--accent)]">
                  윤활 {b.pol["lube.alert_days_before"]}일 안 {b.lubeDue.length}곳
                </Link>
              </li>
              <li>
                <Link href="/equipment/pm" className="text-[var(--accent)]">
                  예방정비 {b.pol["pm.alert_days_before"]}일 안 {b.pmDue.length}건
                </Link>
              </li>
              <li>교정·법정 검사 30일 안 {b.calibDue.length + b.legalDue.length}건</li>
            </ul>
          </Card>
          <Card title="사용 금지·조치 중 고장" help={{ kind: "panel", id: "equip.stopped" }}>
            {b.stopped.length || fails.length ? (
              <ul className="space-y-1.5 text-sm">
                {fails.map((x) => (
                  <li key={x.id}>
                    <Link href={`/equipment/failures/${x.id}`} className="text-[var(--accent)]">
                      {x.docNo}
                    </Link>{" "}
                    {x.eqNo} {x.eqName} — <span className="text-[var(--muted)]">{x.symptom}</span>
                  </li>
                ))}
                {b.stopped
                  .filter((e) => !e.stopReason?.startsWith("고장"))
                  .map((e) => (
                    <li key={e.id}>
                      <Link href={`/equipment/${e.id}`} className="text-[var(--accent)]">
                        {e.no} {e.name}
                      </Link>{" "}
                      — {e.stopReason}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">사용 금지인 설비가 없습니다.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
