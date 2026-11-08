import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/runtime";
import { listNotifications, markAllRead } from "@/modules/platform/notify";
import { SubmitButton } from "../_submit";
import { requireUser } from "../_lib/session";
import { Empty, fmtTime, PageTitle } from "../_ui";

async function readAll() {
  "use server";
  const user = await requireUser();
  await markAllRead(await getDb(), user.id);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const notes = await listNotifications(await getDb(), user.id);
  return (
    <>
      <PageTitle help="notifications" actions={<form action={readAll}><SubmitButton variant="secondary">모두 읽음</SubmitButton></form>}>알림</PageTitle>
      {notes.length === 0 ? (
        <Empty>알림이 없습니다. 결재 차례가 오거나 내 문서가 반려·확정되면 여기에 쌓입니다.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--line)] text-sm">
          {notes.map((n) => (
            <li key={n.id} className="flex justify-between gap-2 py-2.5">
              {n.link ? <Link href={n.link} className={n.readAt ? "text-[var(--muted)]" : "font-medium"}>{n.title}</Link> : <span>{n.title}</span>}
              <span className="shrink-0 text-xs text-[var(--muted)]">{fmtTime(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
