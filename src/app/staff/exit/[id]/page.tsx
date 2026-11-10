import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import {
  EXIT_ITEMS,
  EXIT_REASONS,
  getExit,
  type ExitKey,
} from "@/modules/staff/exit";
import { AssistForm } from "../../../_assist";
import { TextField } from "../../../_input";
import { requireUser, userMessage } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import {
  Badge,
  Card,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../../_ui";
import { exitAction } from "../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 퇴직 처리 점검표 한 건(F-11-07) */
export default async function ExitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  let data: Awaited<ReturnType<typeof getExit>>;
  try {
    data = await getExit(await getDb(), user, id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { x, name, hiredOn, status, sev, names } = data;
  const open = x.status === "open";
  const roster = can(user, "staff.roster");
  const today = seoulDate();
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const detail: Partial<Record<ExitKey, React.ReactNode>> = {
    return_items: status.holdings.length ? (
      <>
        남은 것: {status.holdings.join(", ")} ·{" "}
        <Link href="/fixtures" className="text-[var(--accent)]">
          비품
        </Link>{" "}
        ·{" "}
        <Link href="/tools" className="text-[var(--accent)]">
          치공구
        </Link>
      </>
    ) : (
      "들고 있는 비품·치공구 없음"
    ),
    handover: status.handover.length ? (
      <>넘길 것: {status.handover.join(", ")}</>
    ) : (
      "맡은 구역·설비·법규·업무지시 없음"
    ),
    pledge: status.pledge ? (
      status.pledge.signed ? (
        "서명 끝"
      ) : (
        <Link
          href={`/staff/docs/${status.pledge.id}`}
          className="text-[var(--accent)]"
        >
          확인서 서명 대기
        </Link>
      )
    ) : (
      <Link href="/staff/docs" className="text-[var(--accent)]">
        계약서·서약서에서 퇴직 확인서 만들기
      </Link>
    ),
    account: status.active
      ? `계정 열림 · 퇴직일(${x.leftOn})부터 잠급니다`
      : "잠김",
    settle: sev ? (
      sev.eligible ? (
        sev.amount != null ? (
          <>
            퇴직금 어림 {won(sev.amount)} — {sev.basis} [확인 필요:
            상여·연차수당 가산]
          </>
        ) : (
          sev.basis
        )
      ) : (
        `근속 ${sev.days}일(1년 미만) — 퇴직금 대상 아님. 미지급 임금만 정산`
      )
    ) : null,
  };
  return (
    <>
      <PageTitle
        help="exit.detail"
        sub={`${x.docNo} · 입사 ${hiredOn ?? "-"} · 퇴직 ${x.leftOn} · ${EXIT_REASONS[x.reason as keyof typeof EXIT_REASONS]}${x.noticeOn ? ` · 통보 ${x.noticeOn}` : ""} · 정산 기한 ${x.settleDue}`}
        actions={
          <Link href="/staff/exit" className="text-sm text-[var(--accent)]">
            ← 퇴직 처리
          </Link>
        }
      >
        퇴직 점검표 · {name}{" "}
        <Badge tone={open ? "warn" : "ok"}>{open ? "진행 중" : "끝"}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {open && x.settleDue < today && !x.items.settle?.done && (
        <ErrorBox
          message={`임금·퇴직금 지급 기한(${x.settleDue})이 지났습니다. 늦게 주려면 본인과 합의한 기록이 있어야 합니다(근로기준법 제36조)`}
        />
      )}
      <Card title="점검 항목" help={{ kind: "panel", id: "exit.items" }}>
        <ul className="divide-y divide-[var(--line)]">
          {(Object.keys(EXIT_ITEMS) as ExitKey[]).map((k) => {
            const it = x.items[k];
            const needNote =
              k === "settle" || k === "insurance" || k === "career_cert";
            return (
              <li key={k} className="grid gap-1 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={it?.done ? "ok" : "warn"}>
                    {it?.done ? "확인" : "남음"}
                  </Badge>
                  <span className="font-medium">{EXIT_ITEMS[k].label}</span>
                  <span className="text-xs text-[var(--muted)]">
                    담당 {EXIT_ITEMS[k].who}
                  </span>
                  {it?.done && (
                    <span className="text-xs text-[var(--muted)]">
                      · {it.by ? names.get(it.by) : ""}{" "}
                      {it.at ? fmtTime(new Date(it.at)) : ""}
                      {it.note ? ` · ${it.note}` : ""}
                    </span>
                  )}
                </div>
                {detail[k] && (
                  <p className="text-xs text-[var(--muted)]">{detail[k]}</p>
                )}
                {open &&
                  !it?.done &&
                  (k === "account" ? (
                    roster &&
                    status.active && (
                      <AssistForm
                        id={`exit-lock-${id}`}
                        action={exitAction}
                        guard={false}
                      >
                        {hidden("lock")}
                        <SubmitButton variant="danger">계정 잠금</SubmitButton>
                      </AssistForm>
                    )
                  ) : (
                    <AssistForm
                      id={`exit-${k}-${id}`}
                      action={exitAction}
                      guard={false}
                      className="flex flex-wrap items-end gap-2"
                    >
                      {hidden("check")}
                      <input type="hidden" name="key" value={k} />
                      {needNote && (
                        <div className="min-w-64 flex-1">
                          <TextField
                            help={
                              k === "settle"
                                ? "exit.settleNote"
                                : k === "insurance"
                                  ? "exit.insuranceNote"
                                  : "exit.certNote"
                            }
                            name="note"
                          />
                        </div>
                      )}
                      <SubmitButton variant="secondary">확인</SubmitButton>
                    </AssistForm>
                  ))}
              </li>
            );
          })}
        </ul>
      </Card>
      {open && roster && (
        <Card title="마치기" help={{ kind: "panel", id: "exit.close" }}>
          <AssistForm id={`exit-close-${id}`} action={exitAction} guard={false}>
            {hidden("close")}
            <SubmitButton>퇴직 처리 끝</SubmitButton>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
