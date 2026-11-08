// 내 할 일 — 역할과 지금 기록을 보고 '내가 처리해야 할 것'을 판단해 모은다(사용자 지시 2026-11-08).
// 대시보드(현황)와 달리 하나하나가 처리할 일이고, 누르면 그 일을 하는 화면으로 간다. 따로 입력하는 값은 없다.
import type { Db } from "@/db/client";
import { inbox, myDrafts } from "@/modules/approval/service";
import type { Role } from "@/modules/auth/roles";
import { listConsultations } from "@/modules/customer/service";
import { seoulParts } from "@/modules/customer/rules";
import { kakaoOverview, smsOverview } from "@/modules/messaging/service";
import { HOLIDAY_DATA_LAST_YEAR } from "@/modules/platform/business-days";
import { unreadCount } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import { consentPanel } from "./service";

export type TodoWhen = "late" | "today" | "soon" | "setup";
export type Todo = { key: string; when: TodoWhen; what: string; detail?: string; href: string; action: string };

export const WHEN_LABEL: Record<TodoWhen, string> = { late: "늦은 일", today: "오늘 할 일", soon: "곧 할 일", setup: "준비할 일(설정)" };

const STAFF: Role[] = ["owner", "plant_manager", "advisor"];

export async function myTodos(db: Db, user: { id: string; roles: Role[] }, now = new Date()): Promise<Todo[]> {
  const today = seoulDate(now);
  const out: Todo[] = [];
  const staff = user.roles.some((r) => STAFF.includes(r));

  // 결재: 내 차례(대리 포함), 반려된 내 문서
  const [todo, mine, unread] = await Promise.all([inbox(db, user.id, now), myDrafts(db, user.id), unreadCount(db, user.id)]);
  for (const d of todo) out.push({ key: `ap-${d.id}`, when: "today", what: `결재: ${d.docNo} ${d.title}`, detail: "내 차례입니다", href: `/approvals/${d.id}`, action: "결재하기" });
  for (const d of mine.filter((x) => x.status === "rejected")) out.push({ key: `rj-${d.id}`, when: "today", what: `반려된 문서: ${d.docNo} ${d.title}`, detail: "사유를 보고 고쳐 다시 올리거나 폐기합니다", href: `/approvals/${d.id}`, action: "열기" });
  for (const d of mine.filter((x) => x.status === "draft")) out.push({ key: `dr-${d.id}`, when: "soon", what: `임시저장: ${d.docNo} ${d.title}`, detail: "아직 올리지 않았습니다", href: `/approvals/${d.id}`, action: "이어 쓰기" });

  // 상담·예약: 상담을 쓰는 역할만
  if (staff) {
    const active = await listConsultations(db, "active", now);
    for (const c of active) {
      const who = `${c.docNo} ${c.customerName}${c.plateNo ? ` ${c.plateNo}` : ""}`;
      const href = `/consults/${c.id}`;
      if (c.result === "reserved" && c.reservedAt) {
        const d = seoulParts(c.reservedAt).date;
        if (d < today) out.push({ key: `rv-${c.id}`, when: "late", what: `예약일 지남: ${who}`, detail: `${d} 예약 — 입고했으면 접수로, 안 왔으면 재연락·취소로 정리`, href: `/consults/${c.id}/edit`, action: "정리하기" });
        else if (!c.confirmSentAt) out.push({ key: `cf-${c.id}`, when: d <= addDays(today, 1) ? "today" : "soon", what: `예약 확인 안 보냄: ${who}`, detail: `입고 ${d} ${seoulParts(c.reservedAt).time}`, href, action: "확인 보내기" });
      }
      if (c.result === "recontact" && c.recontactOn && c.recontactOn <= today)
        out.push({ key: `rc-${c.id}`, when: c.recontactOn < today ? "late" : "today", what: `재연락: ${who}`, detail: `재연락일 ${c.recontactOn}`, href: `/consults/${c.id}/edit`, action: "연락하고 결과 적기" });
      if (!c.repliedAt && c.replyDue && (c.result === "open" || c.result === "recontact")) {
        if (c.replyDue < today) out.push({ key: `rp-${c.id}`, when: "late", what: `회신 기한 지남: ${who}`, detail: `기한 ${c.replyDue}`, href, action: "회신하고 표시" });
        else if (c.replyDue === today) out.push({ key: `rp-${c.id}`, when: "today", what: `오늘까지 회신: ${who}`, href, action: "회신하고 표시" });
      }
    }
    for (const p of await consentPanel(db, now)) {
      const hours = (p.expiresAt.getTime() - now.getTime()) / 36e5;
      if (!p.sentOk) out.push({ key: `cs-${p.customerId}`, when: "late", what: `동의 요청 발송 실패: ${p.name}`, detail: "번호를 확인하고 다시 보내거나 전화로 동의를 받습니다", href: `/customers/${p.customerId}`, action: "다시 요청" });
      else if (hours < 24) out.push({ key: `cs-${p.customerId}`, when: "today", what: `동의 기한 임박: ${p.name}`, detail: "기한이 지나면 연락처가 지워집니다. 전화로 한 번 더 안내하세요", href: `/customers/${p.customerId}`, action: "고객 보기" });
    }
  }

  if (unread > 0) out.push({ key: "unread", when: "soon", what: `안 읽은 알림 ${unread}건`, href: "/notifications", action: "알림 보기" });

  // 대표: 개업 준비·운영 설정에서 빠진 것
  if (user.roles.includes("owner")) {
    const [sms, kakao, policy] = await Promise.all([smsOverview(db), kakaoOverview(db), loadPolicy(db, today)]);
    if (sms.current === "demo") out.push({ key: "set-sms", when: "setup", what: "문자 발송 서비스가 데모 상태입니다", detail: "대행사를 연결해야 예약 확인·동의 요청이 실제로 나갑니다", href: "/settings/messaging", action: "연결하기" });
    if (!kakao.enabled) out.push({ key: "set-kakao", when: "setup", what: "카카오 알림톡을 아직 켜지 않았습니다", detail: "켜지 않으면 같은 문구를 문자로 보냅니다", href: "/settings/kakao", action: "설정 보기" });
    if (policy["intake.daily_capacity"] === 0) out.push({ key: "set-cap", when: "setup", what: "일별 입고 한도가 정해지지 않았습니다", detail: "정하면 예약이 넘칠 때 경고합니다(부록 D 1.2)", href: "/settings/policies?key=intake.daily_capacity", action: "정하기" });
    if (Number(today.slice(0, 4)) >= HOLIDAY_DATA_LAST_YEAR) out.push({ key: "set-hol", when: "setup", what: `${HOLIDAY_DATA_LAST_YEAR + 1}년 공휴일을 넣어야 합니다`, href: "/settings/calendar", action: "넣기" });
  }

  const order: TodoWhen[] = ["late", "today", "soon", "setup"];
  return out.sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
}
