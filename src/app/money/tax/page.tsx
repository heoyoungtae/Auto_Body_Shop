import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { taxCalendar, taxOverview } from "@/modules/money/tax-profile";
import { keysFor, lawWatchStatus, LAW_API_GUIDE } from "@/modules/money/law-watch";
import { BIZ_FORMS, entityCompare, REGIONS, RELIEF_KINDS } from "@/modules/money/tax-rules";
import { DEFAULT_POLICY, isPolicyKey, loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { ackLawAction, checkLawsAction, saveLawKeyAction } from "./actions";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[,\s원]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** 세금·절세: 사업 형태별 신고·납부 일정, 감면 — 대표·회계만 */
export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ profit?: string; salary?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "payroll.view"))
    return <p className="text-sm text-[var(--muted)]">세금·절세 화면은 대표·회계 담당만 봅니다.</p>;
  const db = await getDb();
  const today = seoulDate();
  const o = await taxOverview(db, user, today);
  const cal = await taxCalendar(db, today);
  const pol = await loadPolicy(db, today);
  const law = await lawWatchStatus(db);
  const owner = user.roles.includes("owner");
  const profit = num(q.profit);
  const salary = num(q.salary);
  const reliefRate = !o.rec
    ? 0
    : o.p.relief === "none"
      ? 0
      : o.p.relief === "startup"
        ? o.rec.startup
        : o.p.relief === "sme"
          ? o.rec.sme
          : o.rec.rate;
  const cmp = profit
    ? entityCompare({
        profit,
        ceoSalary: salary,
        reliefRate,
        pensionRate: pol["ins.pension_rate"] * 2,
        pensionCap: pol["ins.pension_cap"],
        healthRate: pol["ins.health_rate"] * 2,
        ltcRatio: pol["ins.ltc_ratio"],
      })
    : null;
  const checkKeys = keysFor(law.pending.map((p) => p.name));
  return (
    <>
      <PageTitle help="money.tax" sub="앱에 쌓인 기록으로 신고 일정과 절세 항목을 챙깁니다. 금액은 어림이며 최종 판단은 세무사가 합니다.">
        세금·절세
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="사업 형태와 감면" help={{ kind: "panel", id: "tax.summary" }}>
        {!o.form ? (
          <Empty>
            사업 형태가 정해지지 않았습니다.{" "}
            <Link href="/settings/shop#tax" className="text-[var(--accent)]">
              설정 › 사업장 정보
            </Link>
            에서 정해 주세요.
          </Empty>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["사업 형태", `${BIZ_FORMS[o.form]}${o.formGuessed ? "(사업자등록번호로 짐작)" : ""}`],
              ["지역", o.region ? REGIONS[o.region] : "주소를 넣으면 짐작합니다"],
              ["받는 감면", o.p.relief ? RELIEF_KINDS[o.p.relief] : "아직 안 정함"],
              ["추천", o.rec ? `${RELIEF_KINDS[o.rec.kind]} ${o.rec.rate}% — ${o.rec.why}` : "대표 청년 여부를 넣으면 추천합니다"],
              ["원천세", o.p.halfYearWithholding ? "반기납부(1·7월)" : "매달 10일"],
              ["세무 대리인", [o.p.agentName, o.p.agentPhone].filter(Boolean).join(" ") || "—"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr]">
                <dt className="text-[var(--muted)]">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-2 text-xs">
          <Link href="/settings/shop#tax" className="text-[var(--accent)]">
            설정 고치기 →
          </Link>
        </p>
      </Card>
      <div className="mt-4">
        <Card title="신고·납부 일정(앞으로 12개월)" help={{ kind: "panel", id: "tax.calendar" }}>
          {cal.length === 0 ? (
            <Empty>사업 형태를 정하면 일정이 보입니다.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {cal.map((d) => (
                <li key={d.key} className="flex flex-wrap items-baseline gap-2 py-1.5">
                  <span className="w-24 tabular-nums">{d.due}</span>
                  {d.days <= 14 && <Badge tone={d.days <= 3 ? "warn" : "neutral"}>{d.days === 0 ? "오늘" : `${d.days}일 남음`}</Badge>}
                  <span className="font-medium">{d.what}</span>
                  <span className="text-xs text-[var(--muted)]">{d.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="개인 vs 법인 세금 어림(1년)" help={{ kind: "panel", id: "tax.compare" }}>
          <form method="get" className="grid gap-3 md:grid-cols-3">
            <TextField help="tax.cmpProfit" name="profit" inputMode="numeric" defaultValue={profit ? String(profit) : ""} />
            <TextField help="tax.cmpSalary" name="salary" inputMode="numeric" defaultValue={salary ? String(salary) : ""} />
            <div className="self-end">
              <SubmitButton variant="secondary">비교</SubmitButton>
            </div>
          </form>
          {cmp ? (
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-md border border-[var(--line)] p-3">
                <p className="font-medium">개인사업자</p>
                <p className="text-xs text-[var(--muted)]">종합소득세·지방소득세 {won(cmp.individual.incomeTax)} · 지역 국민연금·건강보험 {won(cmp.individual.insurance)}</p>
                <p className="mt-1 text-base font-semibold">합계 {won(cmp.individual.total)}</p>
              </div>
              <div className="rounded-md border border-[var(--line)] p-3">
                <p className="font-medium">법인사업자(대표 연봉 {won(cmp.salary)})</p>
                <p className="text-xs text-[var(--muted)]">
                  법인세·지방소득세 {won(cmp.corporate.corpTax)} · 대표 근로소득세 {won(cmp.corporate.ceoTax)} · 대표 국민연금·건강보험(회사+본인) {won(cmp.corporate.insurance)}
                </p>
                <p className="mt-1 text-base font-semibold">합계 {won(cmp.corporate.total)}</p>
                <p className="text-xs text-[var(--muted)]">법인에 남는 돈 {won(cmp.corporate.retained)}(배당으로 꺼내면 배당소득세 15.4%~ 추가)</p>
              </div>
              <p className="text-xs text-[var(--muted)] md:col-span-2">
                감면 {reliefRate}%를 두 형태에 같게 넣었습니다. 노란우산공제·기장세액공제·고용 관련 세액공제·성실신고 비용 등은 빠진 대략값입니다. 차이가 연 수백만 원 이상이고 이익이 2년 넘게 이어질 때 세무사와 법인 전환을 상의하세요.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted)]">이익을 넣고 &lsquo;비교&rsquo;를 누르면 1년 세금·보험료를 나란히 보여 줍니다.</p>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="업무용 차량" help={{ kind: "panel", id: "tax.vehicle" }}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>화물차(트럭·밴)·9인승 이상 승합·경차: 업무용 승용차 규제 없이 비용 처리</li>
            <li>일반 승용차: 운행기록부 없으면 연 1,500만 원까지만 비용, 감가상각비는 1대 연 800만 원까지</li>
            <li>법인: 임직원 전용 자동차보험 필수, 8,000만 원 이상 차는 연두색 번호판</li>
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            차를 사면 <Link href="/fixtures" className="text-[var(--accent)]">비품·설비 대장</Link>에 올리고, 승용차면 운행기록부를 매일 적으세요 [확인 필요].
          </p>
        </Card>
      </div>
      <div className="mt-4" id="law">
        <Card title="법령 개정 알림" help={{ kind: "panel", id: "tax.law" }}>
          {law.pending.length > 0 && (
            <div className="mb-3 rounded-md bg-[var(--warn-soft,#fff7e6)] p-2 text-sm">
              <p className="font-medium">바뀐 법령 {law.pending.length}건</p>
              <ul className="list-disc pl-5 text-xs">
                {law.pending.map((p) => (
                  <li key={p.name}>
                    {p.name}: {p.promulgated} 공포, {p.effective} 시행
                  </li>
                ))}
              </ul>
              {checkKeys.length > 0 && (
                <p className="mt-1 text-xs">
                  확인할 정책값:{" "}
                  {checkKeys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <Link href={`/settings/policies?key=${k}`} className="text-[var(--accent)]">
                        {isPolicyKey(k) ? DEFAULT_POLICY[k].label : k}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              <AssistForm id="law-ack" action={ackLawAction} guard={false} className="mt-2">
                <SubmitButton variant="secondary">확인했음</SubmitButton>
              </AssistForm>
            </div>
          )}
          <p className="text-sm">
            {law.hasKey ? "매달 1일 확인합니다." : "OC 값이 없어 확인하지 않습니다."}
            {law.lastAt && (
              <span className="text-xs text-[var(--muted)]">
                {" "}
                · 마지막 {fmtTime(new Date(law.lastAt))}: {law.lastMessage}
              </span>
            )}
          </p>
          {owner && (
            <div className="mt-2 grid gap-2">
              <AssistForm id="law-key" action={saveLawKeyAction} className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                <TextField help="tax.lawKey" name="lawKey" type="password" autoComplete="off" required={!law.hasKey} />
                <SubmitButton variant="secondary">{law.hasKey ? "바꾸기" : "저장"}</SubmitButton>
              </AssistForm>
              {law.hasKey && (
                <div className="flex flex-wrap gap-2">
                  <AssistForm id="law-check" action={checkLawsAction} guard={false}>
                    <SubmitButton variant="secondary">지금 확인</SubmitButton>
                  </AssistForm>
                  <AssistForm id="law-clear" action={saveLawKeyAction} guard={false}>
                    <input type="hidden" name="intent" value="clear" />
                    <SubmitButton variant="danger">OC 값 지우기</SubmitButton>
                  </AssistForm>
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">
                OC 값은{" "}
                <a href={LAW_API_GUIDE} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                  국가법령정보 공동활용
                </a>
                에서 회원 가입 후 &lsquo;OPEN API 사용 신청&rsquo;을 하면 받습니다(무료).
              </p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
