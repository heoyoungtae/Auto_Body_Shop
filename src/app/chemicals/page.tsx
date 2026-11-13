import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { chemicalsList } from "@/modules/listq/defs/quality";
import { can } from "@/modules/auth/permissions";
import { listChemicals } from "@/modules/safety/chemical";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../_ui";

const TABS = [
  ["all", "쓰는 물질"],
  ["nomsds", "MSDS 없음"],
  ["notrained", "교육 안 함"],
  ["flammable", "인화성"],
  ["retired", "사용 중지"],
] as const;

/** 화학물질 목록·MSDS(F-09-02). 누구나 MSDS를 열어 볼 수 있다 */
export default async function ChemicalsPage({
  searchParams,
}: {
  searchParams: Promise<Q>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const f = TABS.find(([k]) => k === q.f)?.[0] ?? "all";
  const lr = await runList(await getDb(), chemicalsList, user, q);
  const list = lr.rows;
  return (
    <>
      <PageTitle
        help="chemicals"
        sub="작업장에서 쓰는 화학물질과 MSDS입니다. 쓰기 전에 MSDS에서 위험과 보호구를 확인하세요. 이름 없는 소분 용기는 쓰지 않습니다."
        actions={
          can(user, "safety.manage") && (
            <Link href="/chemicals/new" className={buttonClass()}>
              화학물질 등록
            </Link>
          )
        }
      >
        화학물질·MSDS
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card
        title="화학물질 목록(F-09-02)"
        help={{ kind: "panel", id: "chem.list" }}
      >
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/chemicals${lr.qs({ f: k === "all" ? null : k })}`}
              className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >
              {label}
            </Link>
          ))}
        </div>
          <ListBar r={lr} bare />
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">분류</th>
                  <th className="pr-2">제품명</th>
                  <th className="pr-2">보관 장소</th>
                  <th className="pr-2">보호구</th>
                  <th>MSDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {list.map((x) => (
                  <tr key={x.id} className="align-top">
                    <td className="py-2 pr-2 text-xs whitespace-nowrap">
                      {x.category}
                    </td>
                    <td className="pr-2">
                      <Link
                        href={`/chemicals/${x.id}`}
                        className="font-medium text-[var(--accent)]"
                      >
                        {x.name}
                      </Link>{" "}
                      {x.flammable && <Badge tone="danger">인화성</Badge>}
                      <p className="text-xs text-[var(--muted)]">
                        {x.maker}
                        {x.hazards && ` · ${x.hazards}`}
                      </p>
                    </td>
                    <td className="pr-2 text-xs">{x.location}</td>
                    <td className="pr-2 text-xs">{x.ppe.join(", ") || "-"}</td>
                    <td className="text-xs whitespace-nowrap">
                      {x.msdsPath ? (
                        <a
                          href={`/api/files/${x.msdsPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)]"
                        >
                          열기{x.msdsRevisedOn && ` (${x.msdsRevisedOn})`}
                        </a>
                      ) : (
                        <Badge tone="danger">없음</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>해당하는 물질이 없습니다.</Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
