import { getDb } from "@/db/runtime";
import { listLogs } from "@/modules/messaging/service";
import { requireUser } from "../../_lib/session";
import { Badge, Empty, fmtTime, Notice, PageTitle } from "../../_ui";

export default async function MessageLogPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  await requireUser();
  const rows = await listLogs(await getDb());
  return (
    <>
      <PageTitle help="messages.log" sub="문자·알림톡·기프티콘 발송 기록. 최근 200건.">
        발송 이력
      </PageTitle>
      {notice && <Notice>{notice}</Notice>}
      {rows.length === 0 ? (
        <Empty>아직 보낸 것이 없습니다. 설정 &gt; 문자 발송 서비스에서 시험 발송을 해 보세요.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">보낸 때</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2 pr-3">용도</th>
                <th className="py-2 pr-3">받는 사람</th>
                <th className="py-2 pr-3">내용</th>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2 pr-3">서비스</th>
                <th className="py-2">보낸 사람</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-3">{fmtTime(r.createdAt)}</td>
                  <td className="py-2 pr-3">{r.channel}</td>
                  <td className="py-2 pr-3">{r.purpose}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {r.customerName ? `${r.customerName} ` : ""}
                    {r.to}
                  </td>
                  <td className="max-w-[40ch] py-2 pr-3">
                    <span className="line-clamp-2 whitespace-pre-line" title={r.body}>
                      {r.body}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {r.status === "성공" ? <Badge tone="ok">성공</Badge> : <Badge tone="danger">실패</Badge>}
                    {r.error && <span className="block text-xs text-[var(--danger)]">{r.error}</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--muted)]">{r.provider === "demo" ? "데모" : r.provider}</td>
                  <td className="py-2">{r.sentBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
