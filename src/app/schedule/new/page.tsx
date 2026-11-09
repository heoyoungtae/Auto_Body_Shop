import Link from "next/link";
import { getDb } from "@/db/runtime";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { seoulDate } from "@/modules/platform/time";
import { canPostShop } from "@/modules/schedule/service";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { EventForm } from "../_form";
import { createEventAction } from "../actions";

/** 일정 올리기. ?scope=shop|personal&date= (달력에서 고른 날이 채워져 온다) */
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ scope?: string; date?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const shopOk = canPostShop(user);
  const scope = q.scope === "shop" && shopOk ? "shop" : "personal";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : seoulDate();
  const users = scope === "shop" ? (await listUsers(db)).filter((u) => u.active).map((u) => ({ id: u.id, label: `${u.name}(${u.roles.map((r) => ROLE_LABEL[r as Role]).join("·")})` })) : [];
  return (
    <>
      <PageTitle
        help="schedule.new"
        sub={scope === "shop" ? "모든 직원의 일정표에 올라가고, 참석자(비우면 전 직원)에게 알림이 갑니다." : "나만 보는 일정입니다. 대표도 남의 개인 일정은 볼 수 없습니다."}
        actions={
          <Link href={`/schedule?m=${date.slice(0, 7)}&d=${date}`} className="text-sm text-[var(--accent)]">
            ← 일정표
          </Link>
        }
      >
        {scope === "shop" ? "사내 공용 일정 올리기" : "개인 일정 올리기"}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.scope === "shop" && !shopOk && <p className="mb-3 text-sm text-[var(--warn)]">공용 일정은 권한표 '공용 일정 올리기' 역할이 올립니다. 개인 일정으로 올립니다.</p>}
      <Card title="일정 내용" help={{ kind: "panel", id: "schedule.form" }}>
        {date !== seoulDate() && <p className="mb-2 text-xs text-[var(--muted)]">날짜는 일정표에서 고른 날({date})에서 불러옴</p>}
        <EventForm
          formId={`sch-new-${scope}`}
          action={createEventAction}
          scope={scope}
          users={users}
          submit="올리기"
          values={{ kind: scope === "shop" ? "meeting" : "etc", title: "", startOn: date, endOn: date, startTime: null, endTime: null, place: null, note: null, attendeeIds: [], repeat: "none", repeatUntil: null, remindDays: scope === "shop" ? 1 : null }}
        />
      </Card>
    </>
  );
}
