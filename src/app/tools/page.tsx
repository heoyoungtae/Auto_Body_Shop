import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { TOOL_KEEP, TOOL_STATUS, TOOL_TONE, type ToolKeep, type ToolStatus } from "@/modules/equipment/rules";
import { listTools, type ToolFilter } from "@/modules/equipment/tools";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, fmtTime, Notice, PageTitle } from "../_ui";

const TABS: [ToolFilter, string][] = [
  ["active", "쓰는 것 전체"],
  ["out", "반출 중"],
  ["special", "고가·특수"],
  ["mine", "내 공구·반출"],
  ["problem", "확인할 것"],
  ["disposed", "폐기"],
  ["all", "전체"],
];

/** 치공구 대장(F-08-08) */
export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ f?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const manage = can(user, "equip.manage");
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "active") as ToolFilter;
  const { list, names } = await listTools(db, user, f);
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : null);
  return (
    <>
      <PageTitle
        help="tools"
        sub="치공구를 관리 번호(TL-)로 등록하고, 공용은 쉐도우 보드 자리, 개인 공구는 쓰는 사람을 남깁니다. 고가·특수 치공구는 반출·반납을 기록하고, 분기마다 상태를 점검합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {manage && (
              <Link href="/tools/new" className={buttonClass()}>
                치공구 등록
              </Link>
            )}
            {manage && (
              <Link href="/tools/check" className={buttonClass("secondary")}>
                분기 점검
              </Link>
            )}
            {manage && (
              <Link href="/tools/labels" className={buttonClass("secondary")}>
                라벨 인쇄
              </Link>
            )}
          </div>
        }
      >
        치공구
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="치공구 대장(F-08-08)" help={{ kind: "panel", id: "tool.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/tools?f=${k}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
        </div>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">관리 번호</th>
                  <th className="pr-2">품명·규격</th>
                  <th className="pr-2">보관</th>
                  <th className="pr-2">위치·사용자</th>
                  <th className="pr-2">반출</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                      <Link href={`/tools/${t.id}`} className="text-[var(--accent)]">
                        {t.no}
                      </Link>
                    </td>
                    <td className="pr-2">
                      {t.name}
                      {t.spec && <span className="text-xs text-[var(--muted)]"> · {t.spec}</span>} {t.special && <Badge tone="accent">고가·특수</Badge>}
                    </td>
                    <td className="pr-2 text-xs whitespace-nowrap">{TOOL_KEEP[t.keep as ToolKeep]}</td>
                    <td className="pr-2 text-xs">{t.keep === "personal" ? nm(t.holderId) : (t.location ?? "-")}</td>
                    <td className="pr-2 text-xs whitespace-nowrap">{t.outAt ? `${nm(t.outBy)} · ${fmtTime(t.outAt)}` : "-"}</td>
                    <td className="whitespace-nowrap">
                      <Badge tone={TOOL_TONE[t.status as ToolStatus]}>{TOOL_STATUS[t.status as ToolStatus]}</Badge> {t.outAt && <Badge tone="warn">반출 중</Badge>} {!t.labeledAt && t.status !== "disposed" && <Badge tone="warn">라벨 없음</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-right text-xs text-[var(--muted)]">{list.length}개</p>
          </div>
        ) : (
          <Empty>해당하는 치공구가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
