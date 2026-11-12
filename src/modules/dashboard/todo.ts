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
import { claimTodos } from "@/modules/repair/claims";
import { seoulParts } from "@/modules/customer/rules";
import { kakaoOverview, smsOverview } from "@/modules/messaging/service";
import { unreadCount } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { addDays, seoulDate } from "@/modules/platform/time";
import { consentPanel } from "./service";
import { can } from "@/modules/auth/permissions";
import { listOpenFailures, todayBoard } from "@/modules/equipment/service";
import { listNc } from "@/modules/quality/nc";
import { listComplaints } from "@/modules/cs/service";
import { taskTodos } from "@/modules/task/service";
import { journalTodos } from "@/modules/journal/entry";
import { punchTodos } from "@/modules/staff/punch";
import { supplierBankTodos, supplierTodos } from "@/modules/purchase/supplier";
import { orderTodos } from "@/modules/purchase/order";
import { stockTodos } from "@/modules/purchase/stock";
import { outsourceTodos } from "@/modules/purchase/outsource";
import { fixtureTodos } from "@/modules/purchase/fixture";
import { toolTodos } from "@/modules/equipment/tools";
import { suggestionTodos } from "@/modules/equipment/suggestion";
import { legalTodos } from "@/modules/quality/legal";
import { riskTodos } from "@/modules/quality/risk";
import { auditTodos } from "@/modules/quality/audit";
import { chemicalTodos } from "@/modules/safety/chemical";
import { hazardTodos } from "@/modules/safety/hazard";
import { envTodos } from "@/modules/safety/environment";
import { trainingTodos } from "@/modules/staff/training";
import { payrollTodos } from "@/modules/staff/payroll";
import { reviewTodos } from "@/modules/staff/review";
import { exitTodos } from "@/modules/staff/exit";
import { staffFileTodos } from "@/modules/staff/files";
import { receiptTodos } from "@/modules/money/receipts";
import { expenseTodos } from "@/modules/money/expense";
import { closeTodos } from "@/modules/money/close";
import { goalTodos } from "@/modules/quality/goals";
import { contextTodos, mgmtReviewTodos } from "@/modules/quality/qms";
import { incidentTodos } from "@/modules/safety/incident";
import { upcomingForMe } from "@/modules/schedule/service";
import { timeLabel } from "@/modules/schedule/rules";
import {
  MIN_WAGE_CHECK_FROM,
  MIN_WAGE_TODO_FROM,
  nextMinWage,
} from "@/modules/staff/min-wage";
import { NC_SOURCES } from "@/modules/quality/rules";
import { fiveSBoard, myZonesToday } from "@/modules/quality/five-s";
import { isBusinessDay } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { holidayTodo } from "@/modules/platform/holidays";

export type TodoWhen = "late" | "today" | "soon" | "setup";
export type Todo = {
  key: string;
  when: TodoWhen;
  what: string;
  detail?: string;
  href: string;
  action: string;
};

export const WHEN_LABEL: Record<TodoWhen, string> = {
  late: "늦은 일",
  today: "오늘 할 일",
  soon: "곧 할 일",
  setup: "준비할 일(설정)",
};

const STAFF: Role[] = ["owner", "plant_manager", "advisor"];

export async function myTodos(
  db: Db,
  user: { id: string; roles: Role[] },
  now = new Date(),
): Promise<Todo[]> {
  const today = seoulDate(now);
  const out: Todo[] = [];
  const staff = user.roles.some((r) => STAFF.includes(r));

  // 결재: 내 차례(대리 포함), 반려된 내 문서
  const [todo, mine, unread] = await Promise.all([
    inbox(db, user.id, now),
    myDrafts(db, user.id),
    unreadCount(db, user.id),
  ]);
  for (const d of todo)
    out.push({
      key: `ap-${d.id}`,
      when: "today",
      what: `결재: ${d.docNo} ${d.title}`,
      detail: "내 차례입니다",
      href: `/approvals/${d.id}`,
      action: "결재하기",
    });
  for (const d of mine.filter((x) => x.status === "rejected"))
    out.push({
      key: `rj-${d.id}`,
      when: "today",
      what: `반려된 문서: ${d.docNo} ${d.title}`,
      detail: "사유를 보고 고쳐 다시 올리거나 폐기합니다",
      href: `/approvals/${d.id}`,
      action: "열기",
    });
  for (const d of mine.filter((x) => x.status === "draft"))
    out.push({
      key: `dr-${d.id}`,
      when: "soon",
      what: `임시저장: ${d.docNo} ${d.title}`,
      detail: "아직 올리지 않았습니다",
      href: `/approvals/${d.id}`,
      action: "이어 쓰기",
    });

  // 상담·예약: 상담을 쓰는 역할만
  if (staff) {
    const active = await listConsultations(db, "active", now);
    for (const c of active) {
      const who = `${c.docNo} ${c.customerName}${c.plateNo ? ` ${c.plateNo}` : ""}`;
      const href = `/consults/${c.id}`;
      if (c.result === "reserved" && c.reservedAt) {
        const d = seoulParts(c.reservedAt).date;
        if (d < today)
          out.push({
            key: `rv-${c.id}`,
            when: "late",
            what: `예약일 지남: ${who}`,
            detail: `${d} 예약 — 차가 왔으면 입고 시작, 안 왔으면 재연락·취소로 정리`,
            href,
            action: "입고 시작·정리",
          });
        else if (!c.confirmSentAt)
          out.push({
            key: `cf-${c.id}`,
            when: d <= addDays(today, 1) ? "today" : "soon",
            what: `예약 확인 안 보냄: ${who}`,
            detail: `입고 ${d} ${seoulParts(c.reservedAt).time}`,
            href,
            action: "확인 보내기",
          });
      }
      if (c.result === "recontact" && c.recontactOn && c.recontactOn <= today)
        out.push({
          key: `rc-${c.id}`,
          when: c.recontactOn < today ? "late" : "today",
          what: `재연락: ${who}`,
          detail: `재연락일 ${c.recontactOn}`,
          href: `/consults/${c.id}/edit`,
          action: "연락하고 결과 적기",
        });
      if (
        !c.repliedAt &&
        c.replyDue &&
        (c.result === "open" || c.result === "recontact")
      ) {
        if (c.replyDue < today)
          out.push({
            key: `rp-${c.id}`,
            when: "late",
            what: `회신 기한 지남: ${who}`,
            detail: `기한 ${c.replyDue}`,
            href,
            action: "회신하고 표시",
          });
        else if (c.replyDue === today)
          out.push({
            key: `rp-${c.id}`,
            when: "today",
            what: `오늘까지 회신: ${who}`,
            href,
            action: "회신하고 표시",
          });
      }
    }
    // 입고 점검을 마치지 않은 수리 건(서명 전)
    for (const r of await listRepairs(db, "intake")) {
      const late = seoulDate(r.inAt) < today;
      out.push({
        key: `ro-${r.id}`,
        when: late ? "late" : "today",
        what: `입고 점검 마치기: ${r.docNo} ${r.customerName} ${r.plateNo}`,
        detail: `사진 ${r.photos}장 · 서명 전${late ? " — 입고 당일에 끝내는 것이 원칙" : ""}`,
        href: `/repairs/${r.id}`,
        action: "점검 이어 하기",
      });
    }
    for (const p of await consentPanel(db, now)) {
      const hours = (p.expiresAt.getTime() - now.getTime()) / 36e5;
      if (!p.sentOk)
        out.push({
          key: `cs-${p.customerId}`,
          when: "late",
          what: `동의 요청 발송 실패: ${p.name}`,
          detail: "번호를 확인하고 다시 보내거나 전화로 동의를 받습니다",
          href: `/customers/${p.customerId}`,
          action: "다시 요청",
        });
      else if (hours < 24)
        out.push({
          key: `cs-${p.customerId}`,
          when: "today",
          what: `동의 기한 임박: ${p.name}`,
          detail:
            "기한이 지나면 연락처가 지워집니다. 전화로 한 번 더 안내하세요",
          href: `/customers/${p.customerId}`,
          action: "고객 보기",
        });
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
      if (tech)
        out.push({
          key: `dg-${r.id}`,
          when: late ? "late" : "today",
          what: `손상 진단: ${who}`,
          detail: `진단 ${r.damages}줄${late ? " — 입고 당일에 끝내는 것이 원칙" : ""}`,
          href: `/repairs/${r.id}#diagnosis`,
          action: "진단하기",
        });
      else if (r.damages > 0)
        out.push({
          key: `dc-${r.id}`,
          when: late ? "late" : "today",
          what: `진단 확인: ${who}`,
          detail: `진단 ${r.damages}줄 — 확인하면 견적으로 넘어갑니다`,
          href: `/repairs/${r.id}#diagnosis`,
          action: "확인하기",
        });
    }
  }

  // 견적: 진단 확인됐는데 견적이 없으면 상담원에게, 검토 요청은 전결 검토자에게
  if (staff) {
    for (const x of await estimateTodos(db)) {
      if (
        x.kind === "write" &&
        user.roles.some((r) => r === "advisor" || r === "owner")
      )
        out.push({
          key: `es-${x.roId}`,
          when: "today",
          what: `견적 쓰기: ${x.label}`,
          detail:
            "진단 확인됨 — 입고 후 1영업일 안에 고객에게 제시(STD-03 5절)",
          href: `/repairs/${x.roId}`,
          action: "견적 쓰기",
        });
      if (
        x.kind === "review" &&
        x.reviewer &&
        (user.roles.includes(x.reviewer) || user.roles.includes("owner"))
      )
        out.push({
          key: `er-${x.id}`,
          when: "today",
          what: `견적 검토: ${x.label}`,
          detail: `${x.total.toLocaleString("ko-KR")}원`,
          href: `/repairs/${x.roId}/estimate/${x.id}`,
          action: "검토하기",
        });
      if (x.kind === "draft" && user.roles.some((r) => r === "advisor"))
        out.push({
          key: `ed-${x.id}`,
          when: "soon",
          what: `작성 중인 견적: ${x.label}`,
          href: `/repairs/${x.roId}/estimate/${x.id}`,
          action: "이어 쓰기",
        });
    }
    // 고객 승인: 발급했는데 승인 링크를 안 보냈거나, 보낸 뒤 재연락할 날이 됐거나, 기한이 지난 견적(STD-03 5절)
    if (user.roles.some((r) => r === "advisor" || r === "owner")) {
      for (const a of await approvalTodos(db, now)) {
        const href = `/repairs/${a.roId}/estimate/${a.id}#approval`;
        if (a.kind === "ask")
          out.push({
            key: `ea-${a.id}`,
            when: "today",
            what: `견적 승인 받기: ${a.label}`,
            detail: `${a.total.toLocaleString("ko-KR")}원 — 승인 링크를 보내거나 매장에서 서명을 받습니다`,
            href,
            action: "승인 받기",
          });
        if (a.kind === "followup")
          out.push({
            key: `ef-${a.id}`,
            when: "late",
            what: `견적 승인 재연락: ${a.label}`,
            detail:
              "링크를 보냈는데 답이 없습니다. 전화로 안내하되 승인은 링크·서명으로 받습니다",
            href,
            action: "재연락",
          });
        if (a.kind === "expired")
          out.push({
            key: `ex-${a.id}`,
            when: "late",
            what: `견적 유효기간 지남: ${a.label}`,
            detail: `${a.validUntil}까지였습니다. 고객이 원하면 새 차수로 다시 견적합니다`,
            href,
            action: "보기",
          });
      }
    }
  }

  // 작업(STD-04): 공장장은 지시서 만들기·배정, 기술자는 내 공정
  for (const t of await workTodos(db, user, now)) {
    if (t.kind === "order")
      out.push({
        key: t.key,
        when: "today",
        what: `작업 지시서 만들기: ${t.label}`,
        detail: t.detail,
        href: t.href,
        action: "지시하기",
      });
    if (t.kind === "assign")
      out.push({
        key: t.key,
        when: "today",
        what: `공정 담당 정하기: ${t.label}`,
        detail: t.detail,
        href: t.href,
        action: "배정하기",
      });
    if (t.kind === "mine")
      out.push({
        key: t.key,
        when: t.started ? "late" : "today",
        what: t.label,
        detail: t.detail,
        href: t.href,
        action: t.started ? "이어 하기" : "시작하기",
      });
  }

  // 보험 청구(STD-03 6절): 상담원 쪽은 접수·요청·회신·청구, 회계는 30일 미입금 독촉
  {
    const desk = user.roles.some(
      (x) => x === "advisor" || x === "plant_manager" || x === "owner",
    );
    const money = user.roles.some((x) => x === "accounting" || x === "owner");
    const TEXT = {
      info: [
        "보험 접수 정보 확인",
        "보험사·사고접수번호·자기부담금·손해사정사를 입고 당일 확인합니다",
        "확인하기",
      ],
      request: [
        "손해사정 요청",
        "손상 사진·견적을 보험사에 보냅니다(입고 후 1영업일)",
        "요청 기록",
      ],
      scope: [
        "보험사 회신 확인",
        "손해사정 금액이 오면 승인 범위를 적고 미승인분을 고객과 합의합니다",
        "범위 적기",
      ],
      claim: [
        "보험 청구",
        "출고 후 3영업일 안에 서류 4가지를 갖춰 청구합니다",
        "청구하기",
      ],
      dun: ["보험 미입금 독촉", "청구 후 30일이 지났습니다", "독촉·입금 확인"],
    } as const;
    for (const t of await claimTodos(db, now)) {
      if (t.kind === "dun" ? !money : !desk) continue;
      const [what, detail, action] = TEXT[t.kind];
      out.push({
        key: `cl-${t.kind}-${t.id}`,
        when: t.late
          ? "late"
          : t.kind === "scope" || (t.due && t.due > today)
            ? "soon"
            : "today",
        what: `${what}: ${t.who}`,
        detail: t.due ? `${detail} · 기한 ${t.due}` : detail,
        href: `/repairs/${t.id}/claim`,
        action,
      });
    }
  }

  // 검사·출고(STD-05): 품질·공장장은 검사 대기, 상담원은 출고 대기(완료 안내·인도)
  for (const r of await inspectTodos(db)) {
    const who = `${r.docNo} ${r.customerName} ${r.plateNo}`;
    if (
      r.status === "inspecting" &&
      user.roles.some((x) => x === "quality" || x === "plant_manager")
    )
      out.push({
        key: `qc-${r.id}`,
        when: "today",
        what: `최종 검사: ${who}`,
        detail: "작업이 모두 끝났습니다. 주 작업자가 아닌 사람이 검사합니다",
        href: `/repairs/${r.id}/inspect`,
        action: "검사하기",
      });
    if (
      r.status === "ready" &&
      user.roles.some((x) => x === "advisor" || x === "owner")
    )
      out.push({
        key: `dl-${r.id}`,
        when: r.readyNoticeAt ? "soon" : "today",
        what: `${r.readyNoticeAt ? "출고" : "완료 안내·출고"}: ${who}`,
        detail: r.readyNoticeAt
          ? "인도 때 정비명세서 발급·설명·인수 서명"
          : "검사 합격 — 고객에게 완료 안내를 보내고 인도 일시를 정합니다",
        href: `/repairs/${r.id}/delivery`,
        action: r.readyNoticeAt ? "출고하기" : "안내 보내기",
      });
  }

  // 설비(STD-08): 내 설비 일상 점검·윤활, 공장장은 A등급 미점검·고장·예방정비
  const open = isBusinessDay(await loadShopCalendar(db), today);
  if (can(user, "equip.check")) {
    const b = await todayBoard(db, today);
    const boss = can(user, "equip.manage");
    if (open)
      for (const e of b.unchecked.filter(
        (x) => x.ownerId === user.id || (boss && x.grade === "A"),
      ))
        out.push({
          key: `eqc-${e.id}`,
          when: "today",
          what: `일상 점검: ${e.no} ${e.name}`,
          detail:
            e.grade === "A"
              ? "A등급 — 작업 전에 점검합니다"
              : "작업 전에 점검합니다",
          href: `/equipment/${e.id}/check`,
          action: "점검하기",
        });
    for (const l of b.lubeDue.filter(
      (x) => x.p.ownerId === user.id || (boss && !x.p.ownerId),
    ))
      out.push({
        key: `lub-${l.p.id}`,
        when:
          l.p.nextDueOn < today
            ? "late"
            : l.p.nextDueOn === today
              ? "today"
              : "soon",
        what: `윤활: ${l.eqName} ${l.p.code} ${l.p.spot}`,
        detail: `기한 ${l.p.nextDueOn} · ${l.p.oil}`,
        href: "/equipment/lube",
        action: "기록하기",
      });
    if (boss) {
      for (const f of await listOpenFailures(db))
        out.push({
          key: `eqf-${f.id}`,
          when: "late",
          what: `설비 사용 금지: ${f.eqNo} ${f.eqName}`,
          detail: `${f.docNo} ${f.symptom.slice(0, 40)} — 조치 확인 뒤 사용 재개`,
          href: `/equipment/failures/${f.id}`,
          action: "확인하기",
        });
      for (const r of b.pmDue)
        out.push({
          key: `pm-${r.t.id}`,
          when: r.t.dueOn < today ? "late" : "soon",
          what: `예방정비: ${r.eqNo} ${r.eqName} — ${r.task}`,
          detail: `예정 ${r.t.dueOn}`,
          href: "/equipment/pm",
          action: "실적 적기",
        });
    }
  }

  // 3정5S: 내 구역 일일 점검, 공장장은 매월 첫 주 월간 평가
  if (open)
    for (const z of await myZonesToday(db, user.id, today))
      out.push({
        key: `5s-${z.code}`,
        when: "today",
        what: `3정5S 일일 점검: ${z.code} ${z.name}`,
        detail: "작업 끝에 체크하고 사진 1장",
        href: `/five-s/${z.code}`,
        action: "점검하기",
      });
  if (can(user, "five_s.audit") && +today.slice(8, 10) <= 7) {
    const fb = await fiveSBoard(db, today);
    const left = fb.zones.filter((z) => !z.scores[fb.ym]);
    if (left.length)
      out.push({
        key: `5sm-${fb.ym}`,
        when: "today",
        what: `3정5S 월간 평가 ${left.length}개 구역 남음`,
        detail: "매월 첫 주(STD-08 14.2)",
        href: "/five-s",
        action: "평가하기",
      });
  }

  // 부적합(F-Q-10): 내 시정 조치, 품질·공장장은 처리 결정·효과 확인
  const handle = can(user, "nc.handle");
  for (const { n } of await listNc(db)) {
    const href = `/nc/${n.id}`;
    const label = `${n.docNo} ${NC_SOURCES[n.source as keyof typeof NC_SOURCES] ?? ""} ${n.content.slice(0, 30)}`;
    if (n.status === "planned" && n.assigneeId === user.id)
      out.push({
        key: `nca-${n.id}`,
        when: n.dueOn && n.dueOn < today ? "late" : "today",
        what: `시정 조치: ${label}`,
        detail: `기한 ${n.dueOn}`,
        href,
        action: "조치 적기",
      });
    if (handle && n.status === "open")
      out.push({
        key: `nco-${n.id}`,
        when: "today",
        what: `부적합 처리 결정: ${label}`,
        detail: "원인 분석·시정 조치·담당·기한을 정합니다",
        href,
        action: "결정하기",
      });
    if (handle && n.status === "done")
      out.push({
        key: `ncv-${n.id}`,
        when: "soon",
        what: `효과 확인·종결: ${label}`,
        detail: "재발이 없으면 종결합니다",
        href,
        action: "확인하기",
      });
  }

  // 불만·보증(STD-06): 상담원은 접수 안내·고객 동의·종결, 품질 담당은 판정, 대표는 보상 승인
  const cpContact = can(user, "complaint.contact");
  const cpJudge = can(user, "complaint.judge");
  const cpOwner = can(user, "complaint.compensate");
  if (cpContact || cpJudge || cpOwner) {
    for (const { c, plateNo } of await listComplaints(db, "open")) {
      const href = `/complaints/${c.id}`;
      const label = `${c.docNo} ${plateNo ?? c.who ?? ""} ${c.content.slice(0, 30)}`;
      if (cpContact && c.status === "received")
        out.push({
          key: `cpk-${c.id}`,
          when: c.ackDue < today ? "late" : "today",
          what: `불만 접수 안내: ${label}`,
          detail: `기한 ${c.ackDue}${c.urgent ? " · 긴급" : ""}`,
          href,
          action: "안내하기",
        });
      if (cpJudge && c.status === "acked")
        out.push({
          key: `cpj-${c.id}`,
          when:
            c.judgeDue < today
              ? "late"
              : c.judgeDue === today
                ? "today"
                : "soon",
          what: `불만 현물 확인·판정: ${label}`,
          detail: `기한 ${c.judgeDue}`,
          href,
          action: "판정하기",
        });
      if (cpContact && c.status === "judged")
        out.push({
          key: `cpa-${c.id}`,
          when: c.replyDue < today ? "late" : "today",
          what: `불만 판정 설명·고객 동의: ${label}`,
          detail: `회신 기한 ${c.replyDue}`,
          href,
          action: "동의 받기",
        });
      if (cpContact && c.status === "agreed" && c.satisfied !== false)
        out.push({
          key: `cpc-${c.id}`,
          when: c.replyDue < today ? "late" : "soon",
          what: `불만 처리 뒤 만족 확인·종결: ${label}`,
          detail:
            c.resolution === "warranty_repair"
              ? "보증 수리 출고 뒤 종결"
              : undefined,
          href,
          action: "종결하기",
        });
      if (cpOwner && (c.compWon || c.compNote) && !c.compApprovedAt)
        out.push({
          key: `cpo-${c.id}`,
          when: "today",
          what: `불만 보상 승인: ${label}`,
          detail: `${c.compNote ?? ""}${c.compWon ? ` ${c.compWon.toLocaleString("ko-KR")}원` : ""}`,
          href,
          action: "승인하기",
        });
      if (cpOwner && c.satisfied === false && c.status !== "closed")
        out.push({
          key: `cpm-${c.id}`,
          when: "today",
          what: `불만 고객 미수용(대표 면담): ${label}`,
          detail: c.closeNote ?? undefined,
          href,
          action: "열기",
        });
    }
  }

  // 업무지시: 받은 일·확인할 보고·기한 지난 지시
  out.push(...(await taskTodos(db, user, today)));
  out.push(...(await journalTodos(db, user, now)));
  // 출퇴근: 출근 누르기, 빠진 날 정정, 승인 없는 연장 사후 신청, 지각 신고, 받은 연장 지시
  out.push(...(await punchTodos(db, user, now)));

  // 구매·자재·외주(STD-07): 협력업체 승인·평가, 발주 승인·보내기·입고, 재고 미달·유효기간·실사, 외주 진행
  out.push(
    ...(await supplierTodos(db, user, today)),
    ...(await supplierBankTodos(db, user)),
    ...(await orderTodos(db, user, today)),
    ...(await stockTodos(db, user, today, now)),
    ...(await outsourceTodos(db, user, today)),
    ...(await fixtureTodos(db, user, today)),
    ...(await toolTodos(db, user, today)),
    ...(await suggestionTodos(db, user, today)),
    ...(await legalTodos(db, user, today)),
    ...(await riskTodos(db, user, today)),
    ...(await auditTodos(db, user, today)),
    ...(await incidentTodos(db, user, now)),
    ...(await chemicalTodos(db, user)),
    ...(await hazardTodos(db, user, today)),
    ...(await envTodos(db, user, today)),
    ...(await trainingTodos(db, user, today)),
    ...(await payrollTodos(db, user, today)),
    ...(await reviewTodos(db, user, today)),
    ...(await exitTodos(db, user, today)),
    ...(await staffFileTodos(db, user, today)),
    ...(await receiptTodos(db, user, today)),
    ...(await expenseTodos(db, user, today)),
    ...(await closeTodos(db, user, today)),
    ...(await goalTodos(db, user, today)),
    ...(await contextTodos(db, user, today)),
    ...(await mgmtReviewTodos(db, user, today)),
  );

  // 일정표: 오늘·내일 내 일정(공용 중 나 대상 + 개인)
  for (const it of await upcomingForMe(db, user, now)) {
    const isToday = it.date <= today;
    out.push({
      key: `sch-${it.key}`,
      when: isToday ? "today" : "soon",
      what: `${isToday ? "오늘" : "내일"} ${timeLabel(it.startTime, it.endTime)} ${it.title}`,
      detail: [it.layer === "shop" ? "사내 공용" : "개인 일정", it.place]
        .filter(Boolean)
        .join(" · "),
      href: it.href ?? "/schedule",
      action: "일정 보기",
    });
  }

  if (unread > 0)
    out.push({
      key: "unread",
      when: "soon",
      what: `안 읽은 알림 ${unread}건`,
      href: "/notifications",
      action: "알림 보기",
    });

  // 대표: 개업 준비·운영 설정에서 빠진 것
  if (user.roles.includes("owner")) {
    const [sms, kakao, policy] = await Promise.all([
      smsOverview(db),
      kakaoOverview(db),
      loadPolicy(db, today),
    ]);
    if (sms.current === "demo")
      out.push({
        key: "set-sms",
        when: "setup",
        what: "문자 발송 서비스가 데모 상태입니다",
        detail: "대행사를 연결해야 예약 확인·동의 요청이 실제로 나갑니다",
        href: "/settings/messaging",
        action: "연결하기",
      });
    if (!kakao.enabled)
      out.push({
        key: "set-kakao",
        when: "setup",
        what: "카카오 알림톡을 아직 켜지 않았습니다",
        detail: "켜지 않으면 같은 문구를 문자로 보냅니다",
        href: "/settings/kakao",
        action: "설정 보기",
      });
    const missing = shopMissing(await loadShopInfo(db));
    if (missing.length)
      out.push({
        key: "set-shop",
        when: "setup",
        what: "사업장 정보가 비어 있습니다",
        detail: `법정 견적서에 찍힐 ${missing.slice(0, 3).join("·")}${missing.length > 3 ? " 등" : ""}`,
        href: "/settings/shop",
        action: "넣기",
      });
    if (policy["intake.daily_capacity"] === 0)
      out.push({
        key: "set-cap",
        when: "setup",
        what: "일별 입고 한도가 정해지지 않았습니다",
        detail: "정하면 예약이 넘칠 때 경고합니다(부록 D 1.2)",
        href: "/settings/policies?key=intake.daily_capacity",
        action: "정하기",
      });
    // 다음 해 최저임금: 8월 중순(15일)까지 정책값에 없으면 대표 할 일(사용자 지시 2026-11-09). 8월 말일부터는 앱이 자동으로도 가져온다
    if (today.slice(5) >= MIN_WAGE_TODO_FROM) {
      const next = await nextMinWage(db, today);
      if (next == null)
        out.push({
          key: "set-minwage",
          when: today.slice(5) >= MIN_WAGE_CHECK_FROM ? "late" : "today",
          what: `${Number(today.slice(0, 4)) + 1}년 최저임금이 아직 없습니다`,
          detail: `매년 8월 5일 고시 · 정책값 '최저임금(시급)'에 ${Number(today.slice(0, 4)) + 1}-01-01 시행으로 넣거나 '지금 가져오기'를 누릅니다`,
          href: "/settings/policies?key=wage.minimum_hourly",
          action: "넣기",
        });
    }
    // 내년 공휴일: 9월부터 하나도 없으면(특일 정보 자동 갱신 실패·인증키 없음 포함)
    const hol = await holidayTodo(db, today);
    if (hol)
      out.push({
        key: "set-hol",
        when: today.slice(5) >= "11-01" ? "late" : "today",
        what: `${hol.next}년 공휴일이 아직 없습니다`,
        detail: hol.hasKey
          ? `자동 가져오기: ${hol.lastMessage ?? "아직 안 함"} · '지금 가져오기'를 누르거나 직접 넣습니다`
          : "공공데이터포털 인증키를 넣으면 앱이 저절로 가져옵니다. 직접 넣어도 됩니다",
        href: "/settings/calendar",
        action: hol.hasKey ? "가져오기" : "설정하기",
      });
  }

  const order: TodoWhen[] = ["late", "today", "soon", "setup"];
  return out.sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
}
