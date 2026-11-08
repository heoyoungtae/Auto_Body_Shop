// 내 할 일 — 역할과 지금 기록을 보고 '내가 처리해야 할 것'을 판단해 모은다(사용자 지시 2026-11-08).
// 대시보드(현황)와 달리 하나하나가 처리할 일이고, 누르면 그 일을 하는 화면으로 간다. 따로 입력하는 값은 없다.
import type { Db } from "@/db/client";
import { inbox, myDrafts } from "@/modules/approval/service";
import type { Role } from "@/modules/auth/roles";
import { listConsultations } from "@/modules/customer/service";
import { listRepairs } from "@/modules/repair/service";
import { estimateTodos } from "@/modules/repair/estimate";
import { approvalTodos } from "@/modules/repair/estimate-approval";
import { workTodos } from "@/modules/repair/work";
import { inspectTodos } from "@/modules/repair/inspect";
import { seoulParts } from "@/modules/customer/rules";
import { kakaoOverview, smsOverview } from "@/modules/messaging/service";
import { HOLIDAY_DATA_LAST_YEAR } from "@/modules/platform/business-days";
import { unreadCount } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
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
        if (d < today) out.push({ key: `rv-${c.id}`, when: "late", what: `예약일 지남: ${who}`, detail: `${d} 예약 — 차가 왔으면 입고 시작, 안 왔으면 재연락·취소로 정리`, href, action: "입고 시작·정리" });
        else if (!c.confirmSentAt) out.push({ key: `cf-${c.id}`, when: d <= addDays(today, 1) ? "today" : "soon", what: `예약 확인 안 보냄: ${who}`, detail: `입고 ${d} ${seoulParts(c.reservedAt).time}`, href, action: "확인 보내기" });
      }
      if (c.result === "recontact" && c.recontactOn && c.recontactOn <= today)
        out.push({ key: `rc-${c.id}`, when: c.recontactOn < today ? "late" : "today", what: `재연락: ${who}`, detail: `재연락일 ${c.recontactOn}`, href: `/consults/${c.id}/edit`, action: "연락하고 결과 적기" });
      if (!c.repliedAt && c.replyDue && (c.result === "open" || c.result === "recontact")) {
        if (c.replyDue < today) out.push({ key: `rp-${c.id}`, when: "late", what: `회신 기한 지남: ${who}`, detail: `기한 ${c.replyDue}`, href, action: "회신하고 표시" });
        else if (c.replyDue === today) out.push({ key: `rp-${c.id}`, when: "today", what: `오늘까지 회신: ${who}`, href, action: "회신하고 표시" });
      }
    }
    // 입고 점검을 마치지 않은 수리 건(서명 전)
    for (const r of await listRepairs(db, "intake")) {
      const late = seoulDate(r.inAt) < today;
      out.push({ key: `ro-${r.id}`, when: late ? "late" : "today", what: `입고 점검 마치기: ${r.docNo} ${r.customerName} ${r.plateNo}`, detail: `사진 ${r.photos}장 · 서명 전${late ? " — 입고 당일에 끝내는 것이 원칙" : ""}`, href: `/repairs/${r.id}`, action: "점검 이어 하기" });
    }
    for (const p of await consentPanel(db, now)) {
      const hours = (p.expiresAt.getTime() - now.getTime()) / 36e5;
      if (!p.sentOk) out.push({ key: `cs-${p.customerId}`, when: "late", what: `동의 요청 발송 실패: ${p.name}`, detail: "번호를 확인하고 다시 보내거나 전화로 동의를 받습니다", href: `/customers/${p.customerId}`, action: "다시 요청" });
      else if (hours < 24) out.push({ key: `cs-${p.customerId}`, when: "today", what: `동의 기한 임박: ${p.name}`, detail: "기한이 지나면 연락처가 지워집니다. 전화로 한 번 더 안내하세요", href: `/customers/${p.customerId}`, action: "고객 보기" });
    }
  }

  // 손상 진단: 기술자는 진단할 것, 공장장은 확인할 것(STD-02 5절, 입고 당일 원칙)
  const tech = user.roles.includes("technician");
  const boss = user.roles.some((r) => r === "plant_manager" || r === "owner");
  if (tech || boss) {
    const waiting = await listRepairs(db, "checked");
    for (const r of waiting) {
      const late = seoulDate(r.inAt) < today;
      const who = `${r.docNo} ${r.customerName} ${r.plateNo}`;
      if (tech) out.push({ key: `dg-${r.id}`, when: late ? "late" : "today", what: `손상 진단: ${who}`, detail: `진단 ${r.damages}줄${late ? " — 입고 당일에 끝내는 것이 원칙" : ""}`, href: `/repairs/${r.id}#diagnosis`, action: "진단하기" });
      else if (r.damages > 0) out.push({ key: `dc-${r.id}`, when: late ? "late" : "today", what: `진단 확인: ${who}`, detail: `진단 ${r.damages}줄 — 확인하면 견적으로 넘어갑니다`, href: `/repairs/${r.id}#diagnosis`, action: "확인하기" });
    }
  }

  // 견적: 진단 확인됐는데 견적이 없으면 상담원에게, 검토 요청은 전결 검토자에게
  if (staff) {
    for (const x of await estimateTodos(db)) {
      if (x.kind === "write" && user.roles.some((r) => r === "advisor" || r === "owner")) out.push({ key: `es-${x.roId}`, when: "today", what: `견적 쓰기: ${x.label}`, detail: "진단 확인됨 — 입고 후 1영업일 안에 고객에게 제시(STD-03 5절)", href: `/repairs/${x.roId}`, action: "견적 쓰기" });
      if (x.kind === "review" && x.reviewer && (user.roles.includes(x.reviewer) || user.roles.includes("owner"))) out.push({ key: `er-${x.id}`, when: "today", what: `견적 검토: ${x.label}`, detail: `${x.total.toLocaleString("ko-KR")}원`, href: `/repairs/${x.roId}/estimate/${x.id}`, action: "검토하기" });
      if (x.kind === "draft" && user.roles.some((r) => r === "advisor")) out.push({ key: `ed-${x.id}`, when: "soon", what: `작성 중인 견적: ${x.label}`, href: `/repairs/${x.roId}/estimate/${x.id}`, action: "이어 쓰기" });
    }
    // 고객 승인: 발급했는데 승인 링크를 안 보냈거나, 보낸 뒤 재연락할 날이 됐거나, 기한이 지난 견적(STD-03 5절)
    if (user.roles.some((r) => r === "advisor" || r === "owner")) {
      for (const a of await approvalTodos(db, now)) {
        const href = `/repairs/${a.roId}/estimate/${a.id}#approval`;
        if (a.kind === "ask") out.push({ key: `ea-${a.id}`, when: "today", what: `견적 승인 받기: ${a.label}`, detail: `${a.total.toLocaleString("ko-KR")}원 — 승인 링크를 보내거나 매장에서 서명을 받습니다`, href, action: "승인 받기" });
        if (a.kind === "followup") out.push({ key: `ef-${a.id}`, when: "late", what: `견적 승인 재연락: ${a.label}`, detail: "링크를 보냈는데 답이 없습니다. 전화로 안내하되 승인은 링크·서명으로 받습니다", href, action: "재연락" });
        if (a.kind === "expired") out.push({ key: `ex-${a.id}`, when: "late", what: `견적 유효기간 지남: ${a.label}`, detail: `${a.validUntil}까지였습니다. 고객이 원하면 새 차수로 다시 견적합니다`, href, action: "보기" });
      }
    }
  }

  // 작업(STD-04): 공장장은 지시서 만들기·배정, 기술자는 내 공정
  for (const t of await workTodos(db, user, now)) {
    if (t.kind === "order") out.push({ key: t.key, when: "today", what: `작업 지시서 만들기: ${t.label}`, detail: t.detail, href: t.href, action: "지시하기" });
    if (t.kind === "assign") out.push({ key: t.key, when: "today", what: `공정 담당 정하기: ${t.label}`, detail: t.detail, href: t.href, action: "배정하기" });
    if (t.kind === "mine") out.push({ key: t.key, when: t.started ? "late" : "today", what: t.label, detail: t.detail, href: t.href, action: t.started ? "이어 하기" : "시작하기" });
  }

  // 검사·출고(STD-05): 품질·공장장은 검사 대기, 상담원은 출고 대기(완료 안내·인도)
  for (const r of await inspectTodos(db)) {
    const who = `${r.docNo} ${r.customerName} ${r.plateNo}`;
    if (r.status === "inspecting" && user.roles.some((x) => x === "quality" || x === "plant_manager")) out.push({ key: `qc-${r.id}`, when: "today", what: `최종 검사: ${who}`, detail: "작업이 모두 끝났습니다. 주 작업자가 아닌 사람이 검사합니다", href: `/repairs/${r.id}/inspect`, action: "검사하기" });
    if (r.status === "ready" && user.roles.some((x) => x === "advisor" || x === "owner")) out.push({ key: `dl-${r.id}`, when: r.readyNoticeAt ? "soon" : "today", what: `${r.readyNoticeAt ? "출고" : "완료 안내·출고"}: ${who}`, detail: r.readyNoticeAt ? "인도 때 정비명세서 발급·설명·인수 서명" : "검사 합격 — 고객에게 완료 안내를 보내고 인도 일시를 정합니다", href: `/repairs/${r.id}/delivery`, action: r.readyNoticeAt ? "출고하기" : "안내 보내기" });
  }

  if (unread > 0) out.push({ key: "unread", when: "soon", what: `안 읽은 알림 ${unread}건`, href: "/notifications", action: "알림 보기" });

  // 대표: 개업 준비·운영 설정에서 빠진 것
  if (user.roles.includes("owner")) {
    const [sms, kakao, policy] = await Promise.all([smsOverview(db), kakaoOverview(db), loadPolicy(db, today)]);
    if (sms.current === "demo") out.push({ key: "set-sms", when: "setup", what: "문자 발송 서비스가 데모 상태입니다", detail: "대행사를 연결해야 예약 확인·동의 요청이 실제로 나갑니다", href: "/settings/messaging", action: "연결하기" });
    if (!kakao.enabled) out.push({ key: "set-kakao", when: "setup", what: "카카오 알림톡을 아직 켜지 않았습니다", detail: "켜지 않으면 같은 문구를 문자로 보냅니다", href: "/settings/kakao", action: "설정 보기" });
    const missing = shopMissing(await loadShopInfo(db));
    if (missing.length) out.push({ key: "set-shop", when: "setup", what: "사업장 정보가 비어 있습니다", detail: `법정 견적서에 찍힐 ${missing.slice(0, 3).join("·")}${missing.length > 3 ? " 등" : ""}`, href: "/settings/shop", action: "넣기" });
    if (policy["intake.daily_capacity"] === 0) out.push({ key: "set-cap", when: "setup", what: "일별 입고 한도가 정해지지 않았습니다", detail: "정하면 예약이 넘칠 때 경고합니다(부록 D 1.2)", href: "/settings/policies?key=intake.daily_capacity", action: "정하기" });
    if (Number(today.slice(0, 4)) >= HOLIDAY_DATA_LAST_YEAR) out.push({ key: "set-hol", when: "setup", what: `${HOLIDAY_DATA_LAST_YEAR + 1}년 공휴일을 넣어야 합니다`, href: "/settings/calendar", action: "넣기" });
  }

  const order: TodoWhen[] = ["late", "today", "soon", "setup"];
  return out.sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
}
