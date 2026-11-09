import Link from "next/link";
import { getDb } from "@/db/runtime";
import { csMonthly, listComplaints, type CpFilter } from "@/modules/cs/service";
import { CATEGORIES, CHANNELS, CP_STATUS, CP_TONE, REPEAT_PER_QUARTER, SURVEY_QUESTIONS, VERDICTS, type CpStatus } from "@/modules/cs/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, fmtTime, PageTitle } from "../_ui";

const FILTERS: [CpFilter, string][] = [
  ["open", "진행 중"],
  ["warranty", "보증 수리(해당·일부)"],
  ["closed", "종결"],
  ["all", "전체"],
];

const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** 불만·보증 목록과 월간 집계(STD-06 7.3) */
export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ f?: string; ym?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const f = (FILTERS.find(([k]) => k === q.f)?.[0] ?? "open") as CpFilter;
  const ym = q.ym && /^\d{4}-\d{2}$/.test(q.ym) ? q.ym : today.slice(0, 7);
  const [rows, m] = await Promise.all([listComplaints(db, f), csMonthly(db, ym)]);
  const tile = (label: string, value: React.ReactNode, sub?: string) => (
    <div className="rounded-md border border-[var(--line)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
  return (
    <>
      <PageTitle
        help="complaints"
        sub="출고 뒤 보증 수리 요청과 모든 불만·칭찬을 접수해 접수 안내 → 판정 → 고객 동의 → 처리 → 종결까지 따라갑니다. 만족도 설문은 출고 뒤 저절로 나갑니다(STD-06)."
        actions={
          <Link href="/complaints/new" className={buttonClass()}>
            불만 접수
          </Link>
        }
      >
        만족도·불만·보증
      </PageTitle>
      <div className="grid gap-4 2xl:grid-cols-[3fr_2fr]">
        <Card title="불만 처리부" help={{ kind: "panel", id: "cp.list" }}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
            {FILTERS.map(([k, label]) => (
              <Link key={k} href={`/complaints?f=${k}&ym=${ym}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                {label}
              </Link>
            ))}
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">번호</th>
                    <th className="pr-2">고객·차량</th>
                    <th className="pr-2">경로·유형</th>
                    <th className="pr-2">내용</th>
                    <th className="pr-2">판정</th>
                    <th className="pr-2">접수</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map(({ c, plateNo, customerName }) => {
                    const st = c.status as CpStatus;
                    const late = st !== "closed" && (c.replyDue < today || (st === "received" && c.ackDue < today) || ((st === "received" || st === "acked") && c.judgeDue < today));
                    return (
                      <tr key={c.id}>
                        <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                          <Link href={`/complaints/${c.id}`} className="text-[var(--accent)]">
                            {c.docNo}
                          </Link>
                          {c.urgent && <Badge tone="danger">긴급</Badge>}
                        </td>
                        <td className="pr-2">{plateNo ? `${plateNo} ${customerName ?? ""}` : (c.who ?? "-")}</td>
                        <td className="pr-2 text-xs">
                          {CHANNELS[c.channel as keyof typeof CHANNELS]} · {CATEGORIES[c.category as keyof typeof CATEGORIES]}
                        </td>
                        <td className="max-w-sm truncate pr-2">{c.content}</td>
                        <td className="pr-2 text-xs">{c.verdict ? VERDICTS[c.verdict as keyof typeof VERDICTS] : "-"}</td>
                        <td className="pr-2 text-xs whitespace-nowrap">{fmtTime(c.receivedAt)}</td>
                        <td className="whitespace-nowrap">
                          <Badge tone={CP_TONE[st] ?? "neutral"}>{CP_STATUS[st]}</Badge>
                          {late && <Badge tone="danger">기한 지남</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>해당하는 불만이 없습니다.</Empty>
          )}
        </Card>

        <Card
          title={`월간 집계 · ${ym}`}
          help={{ kind: "panel", id: "cp.monthly" }}
          actions={
            <span className="flex gap-2 text-sm">
              <Link href={`/complaints?f=${f}&ym=${prevYm(ym)}`} className="text-[var(--accent)]">
                ← 전달
              </Link>
              {ym < today.slice(0, 7) && (
                <Link href={`/complaints?f=${f}&ym=${nextYm(ym)}`} className="text-[var(--accent)]">
                  다음 달 →
                </Link>
              )}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tile("설문 평균", m.avg == null ? "-" : `${m.avg}점`, "5점 만점")}
            {tile("응답률", m.responseRate == null ? "-" : `${m.responseRate}%`, `${m.answered}/${m.sent}건`)}
            {tile("불만", `${m.complaints}건`, `진행 중 ${m.open}`)}
            {tile("보증 수리율", m.warrantyRate == null ? "-" : `${m.warrantyRate}%`, `${m.warrantyRepairs}/출고 ${m.delivered}대`)}
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-[var(--line)]">
              {SURVEY_QUESTIONS.map((x, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-xs">{x.q}</td>
                  <td className={`text-right tabular-nums ${m.perQ[i] != null && m.perQ[i]! <= 3 ? "font-bold text-[var(--danger)]" : ""}`}>{m.perQ[i] ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--muted)]">
            유형별: {Object.entries(m.byCategory).filter(([, n]) => n).map(([k, n]) => `${CATEGORIES[k as keyof typeof CATEGORIES]} ${n}`).join(" · ") || "없음"}
            <br />
            경로별: {Object.entries(m.byChannel).filter(([, n]) => n).map(([k, n]) => `${CHANNELS[k as keyof typeof CHANNELS]} ${n}`).join(" · ") || "없음"}
          </p>
          {m.repeats.length > 0 && (
            <p className="mt-2 rounded-md bg-[var(--danger-soft)] p-2 text-sm">
              {m.quarter} 같은 유형 {REPEAT_PER_QUARTER}건 이상: {m.repeats.map((x) => `${CATEGORIES[x.category]} ${x.n}건`).join(", ")} — 경영 검토 안건으로 올립니다(STD-06 6.4).
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
