// 서류 보관함: 견적서·정비명세서(최근 것부터). 누르면 법정 서식 그대로 열린다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myDocs } from "@/modules/carbook/service";
import { Empty, PageTitle } from "../../_ui";
import { requireMy } from "../_session";
import { LinkOnlyNote } from "../_parts";

export default async function MyDocsPage() {
  const s = await requireMy();
  const docs = await myDocs(await getDb(), s);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.docs" sub={`${docs.length}장`}>
        서류 보관함
      </PageTitle>
      {s.scope === "link" && <LinkOnlyNote next="/my/docs" />}
      {docs.length ? (
        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          {docs.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="flex items-center justify-between gap-2 px-3 py-3 hover:bg-[var(--surface-2)]">
                <span>
                  <span className="block font-medium">
                    {d.title} <span className="text-xs font-normal text-[var(--muted)]">{d.docNo}</span>
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {d.on} · {d.plateNo}
                  </span>
                </span>
                <span className="text-sm whitespace-nowrap">{d.total.toLocaleString("ko-KR")}원 →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>아직 받은 서류가 없습니다. 견적서는 발급되면, 정비명세서는 출고 때 여기에 들어옵니다.</Empty>
      )}
    </div>
  );
}
