import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { EXIT_REASONS, listExits } from "@/modules/staff/exit";
import { AssistForm } from "../../_assist";
import { DateField, SelectField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { startExitAction } from "./actions";

/** 퇴직 처리(F-11-07): 진행 중·끝난 점검표와 새로 시작 */
export default async function ExitListPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "staff.roster") && !can(user, "staff.assess"))
    return (
      <p className="text-sm text-[var(--muted)]">
        퇴직 처리는 대표·공장장·회계 담당이 봅니다.
      </p>
    );
  const db = await getDb();
  const list = await listExits(db);
  const users = can(user, "staff.roster")
    ? (await listUsers(db)).filter(
        (u) =>
          u.active &&
          !u.roles.includes("owner") &&
          u.id !== user.id &&
          !list.some((l) => l.x.userId === u.id && l.x.status === "open"),
      )
    : [];
  return (
    <>
      <PageTitle
        help="exit"
        sub="퇴직이 정해지면 점검표를 열어 반납·인계·비밀유지 확인서·계정 잠금·임금 정산(14일 안)·4대 보험 상실 신고를 빠짐없이 처리합니다."
      >
        퇴직 처리
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {users.length > 0 && (
        <Card title="퇴직 처리 시작" help={{ kind: "panel", id: "exit.start" }}>
          <AssistForm
            id="exit-start"
            action={startExitAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <SelectField
              help="exit.userId"
              name="userId"
              required
              placeholder="직원 고르기"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
            <SelectField
              help="exit.reason"
              name="reason"
              required
              placeholder="사유 고르기"
              options={Object.entries(EXIT_REASONS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <DateField
              help="exit.leftOn"
              name="leftOn"
              required
              quick={["week", "nextMonth"]}
            />
            <DateField help="exit.noticeOn" name="noticeOn" quick={["today"]} />
            <div className="md:col-span-2">
              <SubmitButton>점검표 열기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
      <Card title="점검표" help={{ kind: "panel", id: "exit.list" }}>
        {list.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map(({ x, name }) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/staff/exit/${x.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {name}
                </Link>
                <Badge tone={x.status === "closed" ? "ok" : "warn"}>
                  {x.status === "closed" ? "끝" : "진행 중"}
                </Badge>
                <span className="text-xs text-[var(--muted)]">
                  {x.docNo} · {x.leftOn} 퇴직 ·{" "}
                  {EXIT_REASONS[x.reason as keyof typeof EXIT_REASONS]} · 정산
                  기한 {x.settleDue}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>퇴직 처리 기록이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
