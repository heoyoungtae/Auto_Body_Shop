// 보고서 센터 분류 탭(사용자 결정 2026-11-13 "분류별 탭으로 분리"). 볼 권한 있는 분류만 탭으로 나오고,
// 보고서 안에서는 같은 분류 보고서들이 작은 탭으로 이어진다(고른 기간·비교 기준 유지). 인쇄·PDF에서는 빠진다.
import Link from "next/link";
import { MENU } from "@/app/_menu";
import { can } from "@/modules/auth/permissions";
import { canReport, FAMILIES, type FamilyId, type ReportDef, REPORTS } from "@/modules/report/catalog";
import type { Role } from "@/modules/auth/roles";

export type TabId = FamilyId | "lists";
type Who = { id: string; roles: Role[] };

/** 탭 이름(짧게) */
export const TAB_LABEL: Record<TabId, string> = { mgmt: "경영", acct: "회계", quality: "품질", stock: "재고·구매", people: "인사·안전·설비", lists: "대장·전표" };
export const LAST_TAB_COOKIE = "rep_tab";

export const isTab = (s: unknown): s is TabId => typeof s === "string" && s in TAB_LABEL;

/** 이 사람이 볼 수 있는 대장·전표 목록 화면(메뉴 묶음별) */
export function listGroups(user: Who) {
  return MENU.filter((g) => g.id !== "settings" && g.id !== "me")
    .map((g) => ({ g, items: g.items.filter((i) => i.href && (!i.roles || i.roles.some((r) => user.roles.includes(r))) && (!i.perm || i.perm.some((k) => can(user, k)))) }))
    .filter((x) => x.items.length);
}

/** 이 사람에게 보이는 탭(보고서가 하나라도 있는 분류 + 목록 화면이 있으면 대장·전표) */
export function visibleTabs(user: Who): TabId[] {
  const fams = (Object.keys(FAMILIES) as FamilyId[]).filter((f) => REPORTS.some((r) => r.family === f && canReport(user, r)));
  return listGroups(user).length ? [...fams, "lists"] : fams;
}

export const familyReports = (user: Who, f: FamilyId): ReportDef[] => REPORTS.filter((r) => r.family === f && canReport(user, r));

const tabCls = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm ${on ? "border-[var(--accent)] font-semibold text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--fg,inherit)]"}`;

/** 분류 탭 한 줄(화면 위에 고정, 휴대폰은 좌우로 밀기) */
export function FamilyTabs({ tabs, current, link = false }: { tabs: TabId[]; current: TabId; link?: boolean }) {
  return (
    <nav aria-label="보고서 분류" className="no-print sticky top-14 z-10 -mx-2 mb-3 overflow-x-auto border-b border-[var(--line)] bg-[var(--bg)] px-2 sm:-mx-4 sm:px-4">
      <div className="flex gap-1" role="tablist">
        {tabs.map((t) => (
          <Link key={t} href={`/reports?tab=${t}`} role="tab" aria-selected={t === current} aria-current={t === current && !link ? "page" : undefined} className={tabCls(t === current)}>
            {TAB_LABEL[t]}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** 같은 분류 보고서 작은 탭(보고서 안). qs = 지금 고른 기간·비교 기준 */
export function ReportTabs({ list, current, qs }: { list: ReportDef[]; current: string; qs: string }) {
  if (list.length < 2) return null;
  return (
    <nav aria-label="같은 분류 보고서" className="no-print -mt-1 mb-3 overflow-x-auto">
      <div className="flex gap-1">
        {list.map((r) => (
          <Link
            key={r.id}
            href={r.phase ? `/reports/${r.id}` : `/reports/${r.id}${qs}`}
            aria-current={r.id === current ? "page" : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs ${r.id === current ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-white" : "border-[var(--line)] hover:bg-[var(--surface-2)]"} ${r.phase ? "opacity-60" : ""}`}
            title={r.phase ? `${r.phase}에 만듦` : r.desc}
          >
            {r.no}. {r.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}
