import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { getDoc } from "@/modules/approval/service";
import { getSuggestion } from "@/modules/equipment/suggestion";
import {
  DEFAULT_DELEGATION,
  isDelegationTask,
  loadBands,
} from "@/modules/platform/delegation";
import {
  DEFAULT_POLICY,
  isPolicyKey,
  loadPolicy,
} from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { NumberField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { ErrorBox, Notice, PageTitle } from "../../_ui";
import { createRevisionRequestAction } from "../actions";
import { getDocEntry } from "@/modules/quality/qms";

type Prefill = {
  title?: string;
  docId?: string;
  target?: string;
  current?: string;
  proposed?: string;
  reason?: string;
  policyKey?: string;
  proposedValue?: number;
  delegationTask?: string;
  /** 어디서 불러왔는지(칸 옆 '○○에서 불러옴') */
  source?: string;
};

const bandText = (
  task: keyof typeof DEFAULT_DELEGATION,
  bands: { upTo: number | null; role: keyof typeof ROLE_LABEL }[],
) => {
  const unit = DEFAULT_DELEGATION[task].unit;
  return bands
    .map(
      (b) =>
        `${unit ? (b.upTo == null ? "그 이상" : `${b.upTo.toLocaleString("ko-KR")}${unit} 이하`) + " → " : ""}${ROLE_LABEL[b.role]}`,
    )
    .join(", ");
};

/**
 * 앞선 기록에서 값을 끌어와 다시 치지 않게 한다.
 * ?from=문서  반려·지난 요청서를 그대로 복사 / ?policy=키  정책값 화면에서 / ?task=업무  전결 화면에서 / ?suggest=제안  채택한 개선 제안에서
 */
async function prefill(q: {
  from?: string;
  policy?: string;
  task?: string;
  suggest?: string;
  doc?: string;
}): Promise<Prefill> {
  const db = await getDb();
  if (q.doc) {
    try {
      const { d } = await getDocEntry(db, q.doc);
      return {
        title: `${d.no} ${d.name} 개정`,
        target: `${d.no} ${d.name}`,
        current: `현행 ${d.rev}${d.effectiveOn ? ` (${d.effectiveOn} 시행)` : ""}`,
        docId: d.id,
        source: "문서 목록",
      };
    } catch {
      /* 없는 문서면 빈 양식 */
    }
  }
  if (q.suggest) {
    try {
      const { s } = await getSuggestion(db, q.suggest);
      return {
        title: s.title,
        current: s.problem,
        proposed: s.proposal,
        reason: [
          `개선 제안 ${s.docNo} 채택`,
          s.effectNote
            ? `효과 확인: ${s.effectNote}`
            : s.effect
              ? `기대 효과: ${s.effect}`
              : null,
        ]
          .filter(Boolean)
          .join(" · "),
        source: s.docNo,
      };
    } catch {
      /* 없는 제안이면 빈 양식 */
    }
  }
  if (q.from) {
    try {
      const d = await getDoc(db, q.from);
      if (d.formCode === "F-Q-05" && !d.cancelsId) {
        const x = d.data as Record<string, unknown>;
        const s = (k: string) => (x[k] == null ? undefined : String(x[k]));
        return {
          title: d.title,
          docId: s("docId"),
          target: s("target"),
          current: s("current"),
          proposed: s("proposed"),
          reason: s("reason"),
          policyKey: s("policyKey"),
          proposedValue:
            x.proposedValue == null ? undefined : Number(x.proposedValue),
          delegationTask: s("delegationTask"),
          source: d.docNo,
        };
      }
    } catch {
      /* 없는 문서면 빈 양식 */
    }
  }
  if (q.policy && isPolicyKey(q.policy)) {
    const def = DEFAULT_POLICY[q.policy];
    const now = (await loadPolicy(db))[q.policy];
    return {
      title: `${def.label} ${now.toLocaleString("ko-KR")}${def.unit} → `,
      target: `부록 D ${def.label}(${def.clause})`,
      current: `${now.toLocaleString("ko-KR")} ${def.unit}`,
      policyKey: q.policy,
      source: "정책값",
    };
  }
  if (q.task && isDelegationTask(q.task)) {
    const def = DEFAULT_DELEGATION[q.task];
    return {
      title: `전결: ${def.label} 구간 변경`,
      target: `부록 B ${def.label}`,
      current: bandText(q.task, await loadBands(db, q.task)),
      delegationTask: q.task,
      source: "전결 규정",
    };
  }
  return {};
}

export default async function NewRevisionRequest({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    from?: string;
    policy?: string;
    task?: string;
    suggest?: string;
    doc?: string;
  }>;
}) {
  const q = await searchParams;
  await requireUser();
  const p = await prefill(q);
  const policy =
    p.policyKey && isPolicyKey(p.policyKey)
      ? {
          key: p.policyKey,
          def: DEFAULT_POLICY[p.policyKey] as {
            value: number;
            unit: string;
            label: string;
            min?: number;
            max?: number;
          },
          now: (await loadPolicy(await getDb()))[p.policyKey],
        }
      : null;
  // 불러온 값이 있으면 임시 저장본 대신 그 값으로 시작한다
  const formId = `revision-new${q.from ? `-${q.from}` : q.policy ? `-p-${q.policy}` : q.task ? `-t-${q.task}` : q.suggest ? `-s-${q.suggest}` : q.doc ? `-d-${q.doc}` : ""}`;
  return (
    <div>
      <PageTitle
        help="approvals.new" std="F-Q-05 · 표준서 Q.5"
        sub="표준서·양식을 바꾸자고 요청합니다. 결재: 요청 → 품질 담당 검토 → 대표 승인(부록 B)"
      >
        문서 개정 요청서
      </PageTitle>
      <AssistForm
        id={formId}
        draft
        action={createRevisionRequestAction}
        className="space-y-4"
      >
        <ErrorBox message={q.error} />
        {p.source ? (
          <Notice>
            {p.source}에서 값을 불러왔습니다. 바뀌는 부분만 고치면 됩니다.{" "}
            <Link className="text-[var(--accent)]" href="/approvals/new">
              빈 양식으로
            </Link>
          </Notice>
        ) : (
          <Notice>
            표준서·양식·정책값·전결을 바꾸려면 이 요청서를 먼저 올립니다.
            정책값이나 전결이면{" "}
            <Link className="text-[var(--accent)]" href="/settings/policies">
              정책값
            </Link>
            ·
            <Link className="text-[var(--accent)]" href="/settings/delegation">
              전결 규정
            </Link>{" "}
            화면의 &lsquo;개정 요청&rsquo;으로 들어오면 대상·현재 내용이
            자동으로 채워집니다.
          </Notice>
        )}
        {p.policyKey && (
          <input type="hidden" name="policyKey" value={p.policyKey} />
        )}
        {p.delegationTask && (
          <input type="hidden" name="delegationTask" value={p.delegationTask} />
        )}
        {p.docId && <input type="hidden" name="docId" value={p.docId} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField
            help="revision.title"
            name="title"
            required
            defaultValue={p.title}
            from={p.source}
          />
          <TextField
            help="revision.target"
            name="target"
            required
            defaultValue={p.target}
            from={p.source}
          />
        </div>
        {/* 넓은 화면에서는 현재 내용과 바꿀 내용을 나란히 놓아 비교하기 쉽게 */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <TextAreaField
            help="revision.current"
            name="current"
            defaultValue={p.current}
            from={p.source}
          />
          <div className="space-y-4">
            {policy && (
              <NumberField
                help="revision.proposedValue"
                name="proposedValue"
                required
                unit={policy.def.unit}
                min={policy.def.min ?? 0}
                max={policy.def.max}
                current={policy.now}
                suggested={policy.def.value}
                defaultValue={p.proposedValue}
              />
            )}
            <TextAreaField
              help="revision.proposed"
              name="proposed"
              required={!policy}
              label={policy ? "바꿀 내용(덧붙일 말)" : undefined}
              defaultValue={p.proposed}
              from={p.proposed ? p.source : undefined}
            />
          </div>
        </div>
        <TextAreaField
          help="revision.reason"
          name="reason"
          required
          defaultValue={p.reason}
          from={p.reason ? p.source : undefined}
        />
        <SubmitButton>상신</SubmitButton>
      </AssistForm>
    </div>
  );
}
