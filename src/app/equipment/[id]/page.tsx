import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { CHECK_KINDS, dueState, DUE_LABEL, DUE_TONE, EQ_KINDS, EQ_STATUS, FAIL_CAUSES, FAIL_STATUS, isEqKind, LUBE_COLORS, LUBE_METHODS, LUBE_STATES, MARK_SHORT, ZONES } from "@/modules/equipment/rules";
import { getEquipment } from "@/modules/equipment/service";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { PROCESSES } from "@/modules/repair/work-rules";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { assetView } from "@/modules/asset/service";
import { ArrivalBox, FinanceCard, ManagersCard, RepairsCard } from "../../_asset/cards";
import { addLubePointAction, calibrationAction, disposeAction, removeLubePointAction, reportFailureAction, resumeAction, runLogAction } from "../actions";

/** 설비 한 대: 대장 내용과 점검·윤활·운전·고장·교정·정비 이력 */
export default async function EquipmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; failure?: string }> }) {
  const { id } = await params;
  const { error, notice, failure } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getEquipment(db, id).catch(() => null);
  if (!r) notFound();
  const { e, names, checks, points, lubes, runs, failures, calibrations, tasks } = r;
  const today = seoulDate();
  const pol = await loadPolicy(db);
  const manage = can(user, "equip.manage");
  const doCheck = can(user, "equip.check");
  const kind = isEqKind(e.kind) ? EQ_KINDS[e.kind] : EQ_KINDS.other;
  const live = e.status !== "disposed";
  const users = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name);
  const av = await assetView(db, "equipment", id);
  const nm = (u: string | null | undefined) => (u ? (names.get(u) ?? "-") : "-");
  const todayDone = checks.some((c) => c.kind === "daily" && c.checkDate === today);
  const pointCode = new Map(points.map((p) => [p.id, p.code]));
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 border-b border-[var(--line)] py-1.5 last:border-0">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="equip.detail"
        sub={`${e.no} · ${kind.label} · 중요도 ${e.grade}`}
        actions={
          <>
            <Link href="/equipment" className="text-sm text-[var(--accent)]">
              ← 설비 대장
            </Link>
            {live && doCheck && e.checkDaily && (
              <Link href={`/equipment/${id}/check`} className={buttonClass(todayDone ? "secondary" : "primary")}>
                {todayDone ? "다시 점검" : "오늘 일상 점검"}
              </Link>
            )}
            {live && doCheck && e.checkMonthly && (
              <Link href={`/equipment/${id}/check?kind=monthly`} className={buttonClass("secondary")}>
                월간 점검
              </Link>
            )}
            {live && manage && (
              <Link href={`/equipment/new?edit=${id}`} className={buttonClass("secondary")}>
                고치기
              </Link>
            )}
          </>
        }
      >
        {e.name} <Badge tone={e.status === "in_use" ? "ok" : e.status === "stopped" ? "danger" : e.status === "pending" ? "accent" : "neutral"}>{EQ_STATUS[e.status as keyof typeof EQ_STATUS]}</Badge>
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {e.status === "stopped" && (
        <div className="mb-4 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
          <b>사용 금지</b> — {e.stopReason} {e.stoppedAt && `(${fmtTime(e.stoppedAt)})`}. 공장장이 고장 기록을 확인하거나 사용 재개해야 다시 씁니다.
          {manage && !e.stopReason?.startsWith("고장") && (
            <form action={resumeAction} className="mt-2">
              <input type="hidden" name="id" value={id} />
              <SubmitButton variant="secondary">사용 재개</SubmitButton>
            </form>
          )}
        </div>
      )}
      <ArrivalBox a={av} user={user} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="설비 대장(F-08-01)" help={{ kind: "panel", id: "equip.info" }}>
          <dl className="text-sm">
            {row("모델·제조번호", e.model)}
            {row("제조사·공급사", [e.maker, e.makerContact].filter(Boolean).join(" · "))}
            {row("구입", [e.boughtOn, e.price != null && `${e.price.toLocaleString("ko-KR")}원`].filter(Boolean).join(" · "))}
            {row("구역", e.zone ? ZONES[e.zone as keyof typeof ZONES] : "")}
            {row("정격", e.rating)}
            {row("관리자(정·부)", `${nm(e.ownerId)} · ${nm(e.subManagerId)}`)}
            {row("라벨", e.labeledAt ? `부착 ${fmtTime(e.labeledAt)}` : <Link href={`/equipment/labels?ids=${id}`} className="text-[var(--warn)]">아직 안 붙임 — 인쇄</Link>)}
            {e.expenseId && row("지출 결의", <Link href={`/money/expenses/${e.expenseId}`} className="text-[var(--accent)]">결의 보기</Link>)}
            {row("운전 가능자", e.operators.map(nm).join(", "))}
            {row("법정 검사", e.legalKind ? (e.legalNextOn ? `${e.legalKind} · 다음 ${e.legalNextOn}` : <>{e.legalKind} · <span className="text-[var(--warn)]">다음 검사일을 &apos;고치기&apos;에서 적어 주세요</span></>) : "아니오")}
            {row("매뉴얼", e.manualRef)}
            {row("점검 주기", [e.checkDaily && "일상", e.checkMonthly && "월간"].filter(Boolean).join(" · "))}
            {row("쓰는 공정", e.processes.map((p) => PROCESSES[p as keyof typeof PROCESSES]?.label ?? p).join(", "))}
            {row("시운전 확인", e.trialOn ?? <Badge tone="warn">없음</Badge>)}
            {e.calibMonths && row("측정 장비", `범위 ${e.measureRange ?? "-"} · 허용 오차 ${e.tolerance ?? "-"} · 교정 ${e.calibMonths}개월`)}
            {e.note && row("비고", e.note)}
          </dl>
        </Card>

        <ManagersCard a={av} user={user} users={users} />
        <FinanceCard db={db} a={av} user={user} />
        <RepairsCard db={db} a={av} user={user} failureId={failure} />

        <Card title="점검 기록(F-08-02)" help={{ kind: "panel", id: "equip.checks" }} actions={<Link href={`/equipment/checks?eq=${id}`} className="text-xs text-[var(--accent)]">월 점검표</Link>}>
          {checks.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {checks.slice(0, 12).map((c) => (
                <li key={c.id} className="py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {c.checkDate} {CHECK_KINDS[c.kind as keyof typeof CHECK_KINDS]}
                    </span>
                    {c.idle ? <Badge>비가동</Badge> : c.ok ? <Badge tone="ok">이상 없음</Badge> : <Badge tone="danger">× 이상</Badge>}
                  </div>
                  <div className="font-mono text-xs text-[var(--muted)]">
                    {c.results.map((x) => MARK_SHORT[x.mark]).join(" ")} · {nm(c.checkedBy)}
                  </div>
                  {c.results
                    .filter((x) => x.note)
                    .map((x) => (
                      <div key={x.item} className="text-xs">
                        {MARK_SHORT[x.mark]} {x.item}: {x.note}
                      </div>
                    ))}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>점검 기록이 없습니다.</Empty>
          )}
        </Card>

        <Card title="고장 기록(F-08-04)" help={{ kind: "panel", id: "equip.failures" }}>
          <div id="fail" />
          {failures.length ? (
            <ul className="mb-3 divide-y divide-[var(--line)] text-sm">
              {failures.map((f) => (
                <li key={f.id} className="py-1.5">
                  <Link href={`/equipment/failures/${f.id}`} className="font-mono text-xs text-[var(--accent)]">
                    {f.docNo}
                  </Link>{" "}
                  <Badge tone={f.status === "open" ? "danger" : "ok"}>{FAIL_STATUS[f.status as keyof typeof FAIL_STATUS]}</Badge>
                  <div>{f.symptom}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {fmtTime(f.occurredAt)}
                    {f.downMinutes != null && ` · 정지 ${f.downMinutes}분`}
                    {f.cause && ` · ${FAIL_CAUSES[f.cause as keyof typeof FAIL_CAUSES]}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-[var(--muted)]">고장 기록이 없습니다.</p>
          )}
          {live && doCheck && (
            <AssistForm id={`fail-${id}`} action={reportFailureAction} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <TextAreaField help="eqf.symptom" name="symptom" rows={2} required />
              <SubmitButton variant="danger">고장 신고(사용 금지)</SubmitButton>
            </AssistForm>
          )}
        </Card>

        <Card title="윤활 개소표(F-08-03)" help={{ kind: "panel", id: "equip.lube" }} actions={<Link href="/equipment/lube" className="text-xs text-[var(--accent)]">윤활 기록</Link>}>
          <div id="lube" />
          {points.length ? (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1 pr-2">번호</th>
                    <th className="pr-2">위치·유종</th>
                    <th className="pr-2">주기</th>
                    <th className="pr-2">다음</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {points.map((p) => {
                    const st = p.active ? dueState(p.nextDueOn, today, pol["lube.alert_days_before"]) : null;
                    return (
                      <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                        <td className="py-1.5 pr-2 font-mono text-xs">{p.code}</td>
                        <td className="pr-2">
                          {p.spot}
                          <div className="text-xs text-[var(--muted)]">
                            {[p.oil, p.color && `${p.color} 라벨`, p.amount, p.method].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="pr-2">{p.cycleDays}일</td>
                        <td className="pr-2 text-xs">
                          {p.active ? p.nextDueOn : "뺌"} {st && st !== "ok" && <Badge tone={DUE_TONE[st]}>{DUE_LABEL[st]}</Badge>}
                        </td>
                        <td>
                          {manage && p.active && (
                            <form action={removeLubePointAction}>
                              <input type="hidden" name="id" value={id} />
                              <input type="hidden" name="pid" value={p.id} />
                              <button className="text-xs text-[var(--muted)] underline">빼기</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-3 text-sm text-[var(--muted)]">윤활 개소가 없습니다. 제조사 매뉴얼의 윤활 위치를 더하세요.</p>
          )}
          {lubes.length > 0 && (
            <details className="mb-3 text-sm">
              <summary className="cursor-pointer text-[var(--accent)]">윤활 기록 {lubes.length}건</summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {lubes.map((l) => (
                  <li key={l.id}>
                    {l.doneOn} {pointCode.get(l.pointId)} {LUBE_STATES[l.state as keyof typeof LUBE_STATES]} {l.used && `· ${l.used}`} {l.action && `· ${l.action}`} · {nm(l.doneBy)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {live && manage && (
            <details>
              <summary className="cursor-pointer text-sm text-[var(--accent)]">윤활 개소 더하기</summary>
              <AssistForm id={`lubept-${id}`} action={addLubePointAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <TextField help="lp.spot" name="spot" required />
                <TextField help="lp.oil" name="oil" required />
                <SelectField help="lp.color" name="color" placeholder="없음" options={LUBE_COLORS.map((c) => ({ value: c, label: c }))} />
                <TextField help="lp.amount" name="amount" />
                <NumberField help="lp.cycleDays" name="cycleDays" unit="일" min={1} max={730} required />
                <SelectField help="lp.method" name="method" placeholder="고르세요" options={LUBE_METHODS.map((c) => ({ value: c, label: c }))} />
                <SelectField help="lp.owner" name="ownerId" defaultValue={e.ownerId ?? ""} from={e.ownerId ? "설비 담당" : undefined} placeholder="설비 담당과 같음" options={users.map((u) => ({ value: u.id, label: u.name }))} />
                <DateField help="lp.firstDue" name="firstDue" quick={["today", "week"]} />
                <div className="sm:col-span-2">
                  <SubmitButton variant="secondary">개소 더하기</SubmitButton>
                </div>
              </AssistForm>
            </details>
          )}
        </Card>

        {kind.log.length > 0 && (
          <Card title="운전 일지(F-08-04)" help={{ kind: "panel", id: "equip.run" }}>
            <div id="run" />
            {live && doCheck && e.status === "in_use" && (
              <AssistForm id={`run-${id}`} action={runLogAction} className="mb-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <DateField help="run.date" name="date" defaultValue={today} quick={["today"]} />
                {kind.log.map((f) =>
                  f.num ? <NumberField key={f.key} help="run.value" label={f.label} name={`log_${f.key}`} unit={f.unit} /> : f.time ? <TextField key={f.key} help="run.time" type="time" label={f.label} name={`log_${f.key}`} /> : <TextField key={f.key} help="run.text" label={f.label} name={`log_${f.key}`} />,
                )}
                <div className="sm:col-span-2">
                  <TextField help="run.abnormal" name="abnormal" />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton variant="secondary">운전 일지 저장</SubmitButton>
                </div>
              </AssistForm>
            )}
            {runs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[var(--muted)]">
                    <tr>
                      <th className="py-1 pr-2">일자</th>
                      {kind.log.map((f) => (
                        <th key={f.key} className="pr-2">
                          {f.label}
                        </th>
                      ))}
                      <th>운전자</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {runs.map((rl) => (
                      <tr key={rl.id}>
                        <td className="py-1 pr-2">{rl.logDate}</td>
                        {kind.log.map((f) => (
                          <td key={f.key} className="pr-2">
                            {rl.data[f.key] ? `${rl.data[f.key]}${f.unit ?? ""}` : "-"}
                          </td>
                        ))}
                        <td>{nm(rl.operatorId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">운전 일지가 없습니다. 가동일마다 적습니다.</p>
            )}
          </Card>
        )}

        {e.calibMonths && (
          <Card title="교정(측정 장비)" help={{ kind: "panel", id: "equip.calib" }}>
            <div id="calib" />
            <p className="mb-2 text-sm">
              다음 교정일 <b>{e.calibNextOn ?? "-"}</b>{" "}
              {(() => {
                const st = dueState(e.calibNextOn, today, 30);
                return st && st !== "ok" ? <Badge tone={DUE_TONE[st]}>{DUE_LABEL[st]}</Badge> : null;
              })()}
            </p>
            {calibrations.length > 0 && (
              <ul className="mb-3 divide-y divide-[var(--line)] text-sm">
                {calibrations.map((c) => (
                  <li key={c.id} className="py-1">
                    {c.calibratedOn} {c.agency} {c.pass ? <Badge tone="ok">합격</Badge> : <Badge tone="danger">불합격</Badge>} {c.certNo && <span className="text-xs">성적서 {c.certNo}</span>} <span className="text-xs text-[var(--muted)]">→ 다음 {c.nextOn}</span>
                  </li>
                ))}
              </ul>
            )}
            {live && can(user, "equip.calibrate") && (
              <AssistForm id={`calib-${id}`} action={calibrationAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <DateField help="cal.on" name="calibratedOn" required defaultValue={today} quick={["today"]} />
                <TextField help="cal.agency" name="agency" required defaultValue={calibrations[0]?.agency ?? ""} from={calibrations[0] ? "지난 교정" : undefined} />
                <RadioRow help="cal.pass" name="pass" required options={[
                  { value: "1", label: "합격", tone: "ok" },
                  { value: "0", label: "불합격", tone: "danger" },
                ]} />
                <TextField help="cal.certNo" name="certNo" />
                <div className="sm:col-span-2">
                  <SubmitButton variant="secondary">교정 기록</SubmitButton>
                </div>
              </AssistForm>
            )}
          </Card>
        )}

        <Card title="예방정비 일정(F-08-07)" help={{ kind: "panel", id: "equip.pmTasks" }} actions={<Link href="/equipment/pm" className="text-xs text-[var(--accent)]">예방정비</Link>}>
          {tasks.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {t.dueOn} {t.task} {t.external && <Badge>외부</Badge>}
                  </span>
                  {t.doneOn ? <Badge tone="ok">{t.doneOn} 실시</Badge> : t.dueOn < today ? <Badge tone="danger">미실시</Badge> : <Badge>예정</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">승인한 예방정비 계획에 이 설비 항목이 없습니다.</p>
          )}
        </Card>

        {live && manage && (
          <Card title="처분" help={{ kind: "panel", id: "equip.dispose" }}>
            <AssistForm id={`dispose-${id}`} action={disposeAction} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <TextField help="eq.disposeReason" name="reason" required />
              <SubmitButton variant="danger">처분으로 바꾸기</SubmitButton>
            </AssistForm>
          </Card>
        )}
      </div>
    </>
  );
}
