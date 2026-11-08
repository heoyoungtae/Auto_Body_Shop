// 내 할 일 — 역할과 지금 기록으로 판단한 처리 목록(src/modules/dashboard/todo.ts). 현황은 대시보드에서 본다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myTodos, WHEN_LABEL, type TodoWhen } from "@/modules/dashboard/todo";
import { requireUser } from "../_lib/session";
import { buttonClass, Card, Empty, PageTitle } from "../_ui";

const TONE: Record<TodoWhen, string> = { late: "border-l-[var(--danger)]", today: "border-l-[var(--accent)]", soon: "border-l-[var(--line-strong)]", setup: "border-l-[var(--warn)]" };

export default async function TodoPage() {
  const user = await requireUser();
  const todos = await myTodos(await getDb(), user);
  const groups = (Object.keys(WHEN_LABEL) as TodoWhen[]).map((w) => ({ w, items: todos.filter((t) => t.when === w) })).filter((g) => g.items.length);
  const late = todos.filter((t) => t.when === "late").length;
  return (
    <>
      <PageTitle help="todo" sub={todos.length ? `처리할 일 ${todos.length}건${late ? ` · 늦은 일 ${late}건` : ""}. 위에서부터 처리하세요.` : "지금 처리할 일이 없습니다."} actions={<Link href="/home" className={buttonClass("secondary")}>대시보드</Link>}>
        내 할 일
      </PageTitle>
      {groups.length === 0 ? (
        <Empty action={<Link href="/home" className="text-[var(--accent)]">대시보드에서 현황 보기</Link>}>결재·상담·예약·동의에서 내가 처리할 것이 생기면 여기에 모입니다.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.w} title={`${WHEN_LABEL[g.w]} ${g.items.length}건`} help={{ kind: "panel", id: `todo.${g.w}` }}>
              <ul className="space-y-2">
                {g.items.map((t) => (
                  <li key={t.key} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-l-4 border-[var(--line)] px-3 py-2 ${TONE[g.w]}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.what}</p>
                      {t.detail && <p className="text-xs text-[var(--muted)]">{t.detail}</p>}
                    </div>
                    <Link href={t.href} className={buttonClass(g.w === "late" ? "primary" : "secondary")}>
                      {t.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
