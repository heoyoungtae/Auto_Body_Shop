// 대시보드 — 로그인하면 처음 보는 화면. 역할에 따라 패널이 달라진다(src/modules/dashboard/service.ts PANELS).
import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { inbox, myDrafts } from "@/modules/approval/service";
import { CHANNEL_LABEL, seoulParts } from "@/modules/customer/rules";
import {
  consentPanel,
  duePanel,
  intakePanel,
  moneyPanel,
  monthPanel,
  PANELS,
  panelsFor,
  safetyPanel,
  todayInfo,
  type PanelId,
} from "@/modules/dashboard/service";
import { kpiPanel } from "@/modules/report/service";
import { workBoard, workTodos } from "@/modules/repair/work";
import { INC_KIND } from "@/modules/safety/rules";
import { WASTE_ITEMS } from "@/modules/safety/env-rules";
import { listNotifications } from "@/modules/platform/notify";
import { todayBoard } from "@/modules/equipment/service";
import { listNc } from "@/modules/quality/nc";
import { fiveSBoard } from "@/modules/quality/five-s";
import {
  NC_SOURCES,
  NC_STATUS,
  NC_TONE,
  type NcStatus,
} from "@/modules/quality/rules";
import { inspectTodos } from "@/modules/repair/inspect";
import { myTodos } from "@/modules/dashboard/todo";
import { seoulDate } from "@/modules/platform/time";
import { todayRow } from "@/modules/staff/punch";
import { punchInAction } from "../attendance/actions";
import { SubmitButton } from "../_submit";
import { dayLabel } from "../_format";
import { requireUser } from "../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  fmtTime,
  PageTitle,
  StatusBadge,
} from "../_ui";

const More = ({
  href,
  children = "전체",
}: {
  href: string;
  children?: ReactNode;
}) => (
  <Link href={href} className="text-sm text-[var(--accent)]">
    {children}
  </Link>
);
const Nothing = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-[var(--muted)]">{children}</p>
);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const ids = panelsFor(user.roles);
  const has = (p: PanelId) => ids.includes(p);
  const punch = await todayRow(db, user.id, seoulDate());
  const [todos, day, todo, mine, notes, intake, due, consents, month] =
    await Promise.all([
      myTodos(db, user),
      todayInfo(db),
      inbox(db, user.id),
      myDrafts(db, user.id),
      listNotifications(db, user.id),
      has("intake") ? intakePanel(db) : null,
      has("due") ? duePanel(db) : null,
      has("consent") ? consentPanel(db) : null,
      has("month") ? monthPanel(db) : null,
    ]);
  const canWrite = can(user, "repair.write");
  const [ncs, qcWait, eqBoard, fs] = await Promise.all([
    has("quality") ? listNc(db) : null,
    has("quality") ? inspectTodos(db) : null,
    has("equipment") ? todayBoard(db, day.today) : null,
    has("equipment") ? fiveSBoard(db, day.today) : null,
  ]);
  const [kpi, wb, myw, sp, mp] = await Promise.all([
    has("kpi") ? kpiPanel(db, user) : null,
    has("work") ? workBoard(db) : null,
    has("mywork")
      ? workTodos(db, user).then((r) => r.filter((t) => t.kind === "mine"))
      : null,
    has("safety") ? safetyPanel(db) : null,
    has("money") ? moneyPanel(db) : null,
  ]);
  const won = (n: number | null) =>
    n == null
      ? "—"
      : n >= 1e8
        ? `${(n / 1e8).toFixed(1)}억`
        : n >= 1e4
          ? `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`
          : `${n.toLocaleString("ko-KR")}`;
  const Tiles = ({
    items,
  }: {
    items: { k: string; v: string; tone?: "danger" }[];
  }) => (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {items.map((x) => (
        <div key={x.k} className="rounded-md bg-[var(--surface-2)] px-2 py-2">
          <dt className="text-xs text-[var(--muted)]">{x.k}</dt>
          <dd
            className={`text-lg font-semibold tabular-nums ${x.tone === "danger" ? "text-[var(--danger)]" : ""}`}
          >
            {x.v}
          </dd>
        </div>
      ))}
    </dl>
  );

  const live: Partial<Record<PanelId, ReactNode>> = {
    kpi: kpi && (
      <Card
        key="kpi"
        title={`경영 현황 · ${Number(kpi.today.slice(5, 7))}월 1일~오늘`}
        help={{ kind: "panel", id: "dash.kpi" }}
        actions={
          can(user, "report.view") ? (
            <More href="/reports">보고서</More>
          ) : undefined
        }
      >
        <Tiles
          items={[
            ...(kpi.sales != null && !has("money")
              ? [
                  { k: "매출(원)", v: won(kpi.sales) },
                  { k: "수금(원)", v: won(kpi.collected) },
                  {
                    k: "미수(원)",
                    v: won((kpi.arCustomer ?? 0) + (kpi.arInsurer ?? 0)),
                  },
                ]
              : []),
            { k: "상담", v: `${kpi.consults}건` },
            { k: "입고·출고", v: `${kpi.intake}·${kpi.delivered}대` },
            {
              k: "목표 미달",
              v: `${kpi.goalMiss}개`,
              tone: kpi.goalMiss ? "danger" : undefined,
            },
          ]}
        />
        <p className="mt-2 text-xs text-[var(--muted)]">
          목표 미달은 이번 달 지금까지 기록으로 본 품질목표 지표 수입니다.{" "}
          <Link href="/qms/goals" className="text-[var(--accent)]">
            관리표
          </Link>
        </p>
      </Card>
    ),
    work: wb && (
      <Card
        key="work"
        title={`작업 현황 · 진행 ${wb.board.length}대`}
        help={{ kind: "panel", id: "dash.work" }}
        actions={<More href="/work" />}
      >
        <p className="mb-2 text-sm">
          약속일 지남{" "}
          <b
            className={
              wb.board.some((b) => b.late) ? "text-[var(--danger)]" : ""
            }
          >
            {wb.board.filter((b) => b.late).length}
          </b>
          대 · 지시서 만들 차량 <b>{wb.needOrder.length}</b>대 · 담당 없는 공정{" "}
          <b>{wb.board.reduce((a, b) => a + b.unassigned, 0)}</b>개
        </p>
        {wb.board.length === 0 ? (
          <Nothing>진행 중인 작업이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {wb.board.slice(0, 6).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <Link
                  href={`/work/${b.id}`}
                  className="min-w-0 truncate hover:underline"
                >
                  {b.plateNo} {b.customerName} ·{" "}
                  {b.current
                    ? `${b.current.process}${b.current.started ? " 작업 중" : " 대기"}${b.current.assignee ? `(${b.current.assignee})` : ""}`
                    : "공정 끝"}
                </Link>
                <span className="shrink-0 whitespace-nowrap">
                  {b.dueDate && (
                    <Badge tone={b.late ? "danger" : "neutral"}>
                      출고 {b.dueDate.slice(5)}
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    mywork: myw && (
      <Card
        key="mywork"
        title={`내 작업 ${myw.length}건`}
        help={{ kind: "panel", id: "dash.mywork" }}
        actions={<More href="/todo">내 할 일</More>}
      >
        {myw.length === 0 ? (
          <Nothing>지금 시작할 공정이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {myw.slice(0, 8).map((t) => (
              <li
                key={t.key}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <Link
                  href={t.href}
                  className="min-w-0 truncate hover:underline"
                >
                  {t.label}
                </Link>
                <Badge tone={t.started ? "accent" : "neutral"}>
                  {t.started ? "작업 중" : "시작 가능"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    safety: sp && (
      <Card
        key="safety"
        title="안전·환경"
        help={{ kind: "panel", id: "dash.safety" }}
      >
        <p className="mb-2 text-sm">
          열린 사고 보고{" "}
          <b
            className={
              sp.incidents.some((i) => i.kind === "accident")
                ? "text-[var(--danger)]"
                : ""
            }
          >
            {sp.incidents.length}
          </b>
          건 · 기한 지난 법규{" "}
          <b
            className={
              sp.legal.some((l) => l.late) ? "text-[var(--danger)]" : ""
            }
          >
            {sp.legal.filter((l) => l.late).length}
          </b>
          건
        </p>
        <ul className="divide-y divide-[var(--line)] text-sm">
          {sp.incidents.slice(0, 3).map((i) => (
            <li key={i.id} className="py-1.5">
              <Link href={`/incidents/${i.id}`} className="hover:underline">
                {i.docNo} {INC_KIND[i.kind as keyof typeof INC_KIND] ?? i.kind}{" "}
                · {i.place}
              </Link>
            </li>
          ))}
          {sp.waste.slice(0, 3).map((w) => (
            <li
              key={w.item}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <Link href="/environment" className="hover:underline">
                {WASTE_ITEMS[w.item as keyof typeof WASTE_ITEMS]?.label ??
                  w.item}{" "}
                보관
              </Link>
              <Badge tone={w.left! <= 7 ? "danger" : "neutral"}>
                {w.left! < 0 ? `${-w.left!}일 지남` : `${w.left}일 남음`}
              </Badge>
            </li>
          ))}
          {sp.legal.slice(0, 4).map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <Link
                href={`/legal/${l.id}`}
                className="min-w-0 truncate hover:underline"
              >
                {l.law} · {l.name}
              </Link>
              <Badge tone={l.late ? "danger" : "warn"}>
                기한 {l.due!.slice(5)}
              </Badge>
            </li>
          ))}
        </ul>
        {!sp.incidents.length && !sp.waste.length && !sp.legal.length && (
          <Nothing>챙길 안전·환경 일이 없습니다.</Nothing>
        )}
      </Card>
    ),
    money: mp && (
      <Card
        key="money"
        title={`매출·미수 · ${Number(mp.month.slice(5))}월`}
        help={{ kind: "panel", id: "dash.money" }}
        actions={<More href="/money" />}
      >
        <Tiles
          items={[
            { k: `매출 ${mp.salesCount}건(원)`, v: won(mp.sales) },
            { k: "수금(원)", v: won(mp.collected) },
            {
              k: "고객 미수(원)",
              v: won(mp.arCustomer),
              tone: mp.arOld ? "danger" : undefined,
            },
          ]}
        />
        <p className="mt-2 text-sm">
          보험사 미수 <b>{won(mp.arInsurer)}</b>원({mp.arInsurerCount}건) · 30일
          넘은 고객 미수{" "}
          <b className={mp.arOld ? "text-[var(--danger)]" : ""}>{mp.arOld}</b>건
        </p>
        <p className="mt-1 text-sm">
          수납 안 적은 출고{" "}
          <b className={mp.unrecorded ? "text-[var(--danger)]" : ""}>
            {mp.unrecorded}
          </b>
          건 · 지급 기다리는 지출 결의{" "}
          <Link
            href="/money/expenses"
            className="font-semibold text-[var(--accent)]"
          >
            {mp.expWaiting}
          </Link>
          건 · 결재 중 {mp.expInFlow}건
        </p>
      </Card>
    ),
    intake: intake && (
      <Card
        key="intake"
        title={`입고 예약 · 오늘 ${intake.todayRows.length}대`}
        help={{ kind: "panel", id: "dash.intake" }}
        actions={<More href="/repairs">입고 받기</More>}
      >
        {[
          { label: "오늘", date: intake.today, rows: intake.todayRows },
          {
            label: `다음 영업일 ${dayLabel(intake.next, intake.today)}`,
            date: intake.next,
            rows: intake.nextRows,
          },
        ].map((g) => (
          <div key={g.label} className="mb-2 last:mb-0">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {g.label} · {g.rows.length}대
            </p>
            {g.rows.length === 0 ? (
              <Nothing>예약 없음</Nothing>
            ) : (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {g.rows.slice(0, 6).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <Link
                      href={`/consults/${r.id}`}
                      className="hover:underline"
                    >
                      <b className="tabular-nums">
                        {r.reservedAt ? seoulParts(r.reservedAt).time : ""}
                      </b>{" "}
                      {r.customerName}{" "}
                      {r.plateNo && (
                        <span className="text-[var(--muted)]">{r.plateNo}</span>
                      )}
                    </Link>
                    {!r.confirmSentAt && (
                      <Badge tone="warn">확인 안 보냄</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Card>
    ),
    due: due && (
      <Card
        key="due"
        title={`챙길 상담 ${due.length}건`}
        help={{ kind: "panel", id: "dash.due" }}
        actions={<More href="/consults?f=due" />}
      >
        {due.length === 0 ? (
          <Nothing>재연락·회신 기한·지난 예약 모두 처리했습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {due.slice(0, 6).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <Link href={`/consults/${r.id}`} className="hover:underline">
                  {r.docNo} {r.customerName}
                </Link>
                <span className="flex flex-wrap gap-1">
                  {r.flags.map((f) => (
                    <Badge key={f.label} tone={f.tone}>
                      {f.label}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    consent: consents && (
      <Card
        key="consent"
        title={`개인정보 동의 대기 ${consents.length}명`}
        help={{ kind: "panel", id: "dash.consent" }}
      >
        {consents.length === 0 ? (
          <Nothing>링크로 요청하고 답을 기다리는 고객이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {consents.slice(0, 6).map((c) => (
              <li
                key={c.customerId + String(c.expiresAt)}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <Link
                  href={`/customers/${c.customerId}`}
                  className="hover:underline"
                >
                  {c.name}{" "}
                  <span className="text-[var(--muted)]">{c.phone}</span>
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {fmtTime(c.expiresAt)}까지
                  {!c.sentOk && <Badge tone="danger">발송 실패</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    month: month && (
      <Card
        key="month"
        title={`이번 달 상담·문자 (${Number(month.month.slice(5))}월)`}
        help={{ kind: "panel", id: "dash.month" }}
      >
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { k: "상담", v: `${month.total}건` },
            { k: "예약 전환", v: month.rate == null ? "—" : `${month.rate}%` },
            { k: "문자·알림톡", v: `${month.messages}건` },
          ].map((x) => (
            <div
              key={x.k}
              className="rounded-md bg-[var(--surface-2)] px-2 py-2"
            >
              <dt className="text-xs text-[var(--muted)]">{x.k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {month.byChannel.length
            ? month.byChannel
                .map(
                  (c) =>
                    `${CHANNEL_LABEL[c.channel as keyof typeof CHANNEL_LABEL] ?? c.channel} ${c.n}`,
                )
                .join(" · ")
            : "아직 상담 없음"}
          {month.declined > 0 && ` · 거절·보류 ${month.declined}`}
          {month.failedMessages > 0 && (
            <span className="text-[var(--danger)]">
              {" "}
              · 발송 실패 {month.failedMessages}
            </span>
          )}
        </p>
        {can(user, "report.view") && (
          <p className="mt-1 text-xs">
            <Link href="/reports" className="text-[var(--accent)]">
              기간별 통계·보고서
            </Link>
          </p>
        )}
      </Card>
    ),
    todo: (
      <Card
        key="todo"
        title={`결재 대기 ${todo.length}건`}
        help={{ kind: "panel", id: "home.todo" }}
        actions={<More href="/approvals">결재함</More>}
      >
        {todo.length === 0 ? (
          <Nothing>처리할 결재가 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {todo.slice(0, 6).map((d) => (
              <li key={d.id} className="py-2">
                <Link href={`/approvals/${d.id}`} className="hover:underline">
                  {d.docNo} {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    quality: ncs && (
      <Card
        key="quality"
        title={`검사·부적합 · 열린 부적합 ${ncs.length}건`}
        help={{ kind: "panel", id: "dash.quality" }}
        actions={<More href="/nc" />}
      >
        <p className="mb-2 text-sm">
          최종 검사 대기{" "}
          <b>{qcWait!.filter((r) => r.status === "inspecting").length}</b>대 ·
          기한 지난 시정 조치{" "}
          {(() => {
            const late = ncs.filter(({ n }) => n.status === "planned" && n.dueOn && n.dueOn < day.today).length;
            return <b className={late ? "text-[var(--danger)]" : ""}>{late}</b>;
          })()}
          건
        </p>
        {ncs.length === 0 ? (
          <Nothing>열린 부적합이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {ncs.slice(0, 6).map(({ n }) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <Link
                  href={`/nc/${n.id}`}
                  className="min-w-0 truncate hover:underline"
                >
                  {n.docNo} {NC_SOURCES[n.source as keyof typeof NC_SOURCES]} ·{" "}
                  {n.content}
                </Link>
                <span className="shrink-0 whitespace-nowrap">
                  <Badge tone={NC_TONE[n.status as NcStatus]}>
                    {n.dueOn && n.status === "planned"
                      ? `기한 ${n.dueOn.slice(5)}`
                      : NC_STATUS[n.status as NcStatus]}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    equipment: eqBoard && fs && (
      <Card
        key="equipment"
        title={`설비 점검 · 오늘 남은 점검 ${eqBoard.unchecked.length}대`}
        help={{ kind: "panel", id: "dash.equipment" }}
        actions={<More href="/equipment" />}
      >
        {eqBoard.unchecked.length === 0 ? (
          <Nothing>오늘 일상 점검을 모두 했습니다.</Nothing>
        ) : (
          <div className="mb-2 flex flex-wrap gap-1">
            {eqBoard.unchecked.map((e) => (
              <Link
                key={e.id}
                href={`/equipment/${e.id}/check`}
                className="rounded border border-[var(--line)] px-2 py-0.5 text-xs hover:bg-[var(--surface-2)]"
              >
                {e.grade === "A" && <b className="text-[var(--danger)]">A </b>}
                {e.name}
              </Link>
            ))}
          </div>
        )}
        <p className="text-sm">
          사용 금지{" "}
          <b className={eqBoard.stopped.length ? "text-[var(--danger)]" : ""}>
            {eqBoard.stopped.length}
          </b>
          대 · 윤활 예정 <b>{eqBoard.lubeDue.length}</b>곳 · 예방정비{" "}
          <b>{eqBoard.pmDue.length}</b>건
        </p>
        <p className="mt-1 text-sm">
          이번 달 5S:{" "}
          {fs.zones.some((z) => z.scores[fs.ym]) ? (
            fs.zones
              .filter((z) => z.scores[fs.ym])
              .map((z) => (
                <span
                  key={z.code}
                  className={
                    z.scores[fs.ym].total < fs.threshold
                      ? "font-bold text-[var(--danger)]"
                      : ""
                  }
                >
                  {z.code} {z.scores[fs.ym].total}{" "}
                </span>
              ))
          ) : (
            <span className="text-[var(--muted)]">아직 평가 전</span>
          )}
        </p>
      </Card>
    ),
    notes: (
      <Card
        key="notes"
        title="최근 알림"
        help={{ kind: "panel", id: "home.notes" }}
        actions={<More href="/notifications" />}
      >
        {notes.length === 0 ? (
          <Nothing>알림이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id} className="flex justify-between gap-2 py-2">
                {n.link ? (
                  <Link
                    href={n.link}
                    className={n.readAt ? "text-[var(--muted)]" : "font-medium"}
                  >
                    {n.title}
                  </Link>
                ) : (
                  <span>{n.title}</span>
                )}
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {fmtTime(n.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    mine: (
      <Card
        key="mine"
        title="내가 올린 문서"
        help={{ kind: "panel", id: "home.mine" }}
      >
        {mine.length === 0 ? (
          <Nothing>아직 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {mine.slice(0, 6).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <Link href={`/approvals/${d.id}`} className="hover:underline">
                  {d.docNo} {d.title}
                </Link>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
  };
  const planned = ids.filter((id) => PANELS[id].stage);
  // 챙길 것이 없는 패널은 큰 칸 대신 아래 '이상 없음' 한 줄로 모은다(UI 개선 1, 2026-11-12).
  // 경영 현황·매출·이번 달처럼 숫자를 보는 요약 패널은 늘 보인다.
  const quiet: Partial<Record<PanelId, { href: string; note: string }>> = {};
  if (wb && !wb.board.length && !wb.needOrder.length) quiet.work = { href: "/work", note: "진행 중인 작업 없음" };
  if (myw && !myw.length) quiet.mywork = { href: "/todo", note: "시작할 공정 없음" };
  if (sp && !sp.incidents.length && !sp.waste.length && !sp.legal.length) quiet.safety = { href: "/incidents", note: "챙길 일 없음" };
  if (intake && !intake.todayRows.length && !intake.nextRows.length) quiet.intake = { href: "/repairs", note: "오늘·다음 영업일 예약 없음" };
  if (due && !due.length) quiet.due = { href: "/consults", note: "모두 처리함" };
  if (consents && !consents.length) quiet.consent = { href: "/consults", note: "기다리는 고객 없음" };
  if (!todo.length) quiet.todo = { href: "/approvals", note: "처리할 결재 없음" };
  if (ncs && !ncs.length && !qcWait!.some((r) => r.status === "inspecting")) quiet.quality = { href: "/nc", note: "열린 부적합·검사 대기 없음" };
  if (eqBoard && !eqBoard.unchecked.length && !eqBoard.stopped.length && !eqBoard.lubeDue.length && !eqBoard.pmDue.length) quiet.equipment = { href: "/equipment", note: "오늘 점검 끝" };
  if (!notes.length) quiet.notes = { href: "/notifications", note: "새 알림 없음" };
  if (!mine.length) quiet.mine = { href: "/approvals", note: "올린 문서 없음" };
  const shown = ids.filter((id) => !PANELS[id].stage && !quiet[id]);
  const calm = ids.filter((id) => !PANELS[id].stage && quiet[id]);

  return (
    <>
      <PageTitle
        help="home"
        sub={
          <>
            {dayLabel(day.today, day.today)} ·{" "}
            {day.open ? (
              "영업일"
            ) : (
              <b className="text-[var(--warn)]">쉬는 날({day.reason})</b>
            )}
            {day.nextOff &&
              ` · 다음 쉬는 날 ${dayLabel(day.nextOff.date, day.today)} ${day.nextOff.reason}`}
          </>
        }
        actions={
          <>
            {!punch ? (
              <form action={punchInAction}>
                <SubmitButton>출근</SubmitButton>
              </form>
            ) : !punch.outAt ? (
              <Link href={`/journal?d=${seoulDate()}#close`} className={buttonClass("secondary")}>
                퇴근(업무일지 마감)
              </Link>
            ) : null}
            <Link
              href="/todo"
              className={buttonClass(
                todos.some((t) => t.when === "late") ? "primary" : "secondary",
              )}
            >
              내 할 일 {todos.length}건
              {todos.some((t) => t.when === "late") &&
                ` · 늦은 일 ${todos.filter((t) => t.when === "late").length}`}
            </Link>
            {canWrite && (
              <Link href="/consults/new" className={buttonClass("secondary")}>
                새 상담
              </Link>
            )}
          </>
        }
      >
        대시보드
      </PageTitle>
      <ErrorBox message={error} />
      {todo.length === 0 && mine.length === 0 && (
        <div className="mb-4 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5 text-sm">
          처음 쓰시나요?{" "}
          <Link href="/help" className="font-medium text-[var(--accent)]">
            도움말 센터
          </Link>
          에서 내 역할의 &lsquo;처음 할 일&rsquo;을 보세요. 화면 제목·패널
          제목·입력 칸 이름 옆의 ? 를 누르면 오른쪽에 그 도움말이 열립니다.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {shown.map((id) => live[id])}
      </div>
      {calm.length > 0 && (
        <section aria-label="이상 없음" className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
          <h2 className="mb-2 text-sm font-semibold text-[var(--ok)]">✓ 이상 없음 · {calm.length}개</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {calm.map((id) => (
              <li key={id}>
                <Link href={quiet[id]!.href} className="hover:underline">
                  <b className="font-medium">{PANELS[id].title}</b> <span className="text-[var(--muted)]">{quiet[id]!.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {planned.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-[var(--muted)]">
            내 역할에 열릴 패널(개발 예정)
          </h2>
          <div className="grid gap-4 opacity-60 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {planned.map((id) => (
              <Card
                key={id}
                title={`${PANELS[id].title} · ${PANELS[id].stage}`}
                help={{ kind: "panel", id: "dash.planned" }}
              >
                <Nothing>{PANELS[id].body}</Nothing>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
