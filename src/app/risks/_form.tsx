"use client";
// 리스크·기회 칸(등록·고치기 같이 씀). 가능성·영향을 고르면 점수와 대표 알림 여부를 바로 보여 준다
import { useState } from "react";
import {
  LEVEL,
  RISK_KIND,
  riskScore,
  STD_CHAPTERS,
} from "@/modules/quality/risk-rules";
import { RadioRow, SelectField, TextAreaField, TextField } from "../_input";

type R = {
  kind: string;
  content: string;
  chapter: string | null;
  likelihood: number;
  impact: number;
  control: string | null;
};
const levels = (Object.entries(LEVEL) as [string, string][]).map(
  ([value, label]) => ({
    value,
    label: `${value} ${label}`,
    tone:
      value === "3"
        ? ("danger" as const)
        : value === "2"
          ? ("warn" as const)
          : ("ok" as const),
  }),
);

export function RiskFields({ r, threshold }: { r?: R; threshold: number }) {
  const [l, setL] = useState(r?.likelihood ?? 0);
  const [i, setI] = useState(r?.impact ?? 0);
  const score = l && i ? riskScore(l, i) : 0;
  return (
    <>
      <div className="md:col-span-2">
        <RadioRow
          help="risk.kind"
          name="kind"
          required
          defaultValue={r?.kind ?? "risk"}
          options={Object.entries(RISK_KIND).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <div className="md:col-span-2">
        <TextAreaField
          help="risk.content"
          name="content"
          required
          rows={2}
          defaultValue={r?.content}
        />
      </div>
      <SelectField
        help="risk.chapter"
        name="chapter"
        defaultValue={r?.chapter ?? ""}
        placeholder="관련 장 고르기"
        options={STD_CHAPTERS.map((c) => ({ value: c, label: c }))}
      />
      <TextField
        help="risk.control"
        name="control"
        defaultValue={r?.control ?? ""}
      />
      <div onChange={(e) => setL(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="risk.likelihood"
          name="likelihood"
          required
          defaultValue={r ? String(r.likelihood) : undefined}
          options={levels}
        />
      </div>
      <div onChange={(e) => setI(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="risk.impact"
          name="impact"
          required
          defaultValue={r ? String(r.impact) : undefined}
          options={levels}
        />
      </div>
      <p
        role="status"
        className={`rounded-md px-3 py-2 text-sm md:col-span-2 ${score >= threshold ? "border border-[var(--danger)] bg-[var(--danger-soft)]" : "bg-[var(--accent-soft)]"}`}
      >
        {score
          ? `점수 ${l} × ${i} = ${score}점. ${score >= threshold ? `${threshold}점 이상이라 저장하면 대표에게 알림이 가고 대응 계획을 정해야 합니다.` : `${threshold}점 미만이라 현재 관리로 두고 분기 검토 때 다시 봅니다.`}`
          : "가능성과 영향을 고르면 점수가 나옵니다."}
      </p>
    </>
  );
}

/** 대응 끝에서 잔여 가능성·영향 */
export function ResidualFields({
  likelihood,
  impact,
  threshold,
}: {
  likelihood: number;
  impact: number;
  threshold: number;
}) {
  const [l, setL] = useState(likelihood);
  const [i, setI] = useState(impact);
  const score = riskScore(l, i);
  return (
    <>
      <div onChange={(e) => setL(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="risk.resLikelihood"
          name="likelihood"
          required
          from="지금 점수"
          defaultValue={String(likelihood)}
          options={levels}
        />
      </div>
      <div onChange={(e) => setI(Number((e.target as HTMLInputElement).value))}>
        <RadioRow
          help="risk.resImpact"
          name="impact"
          required
          from="지금 점수"
          defaultValue={String(impact)}
          options={levels}
        />
      </div>
      <p
        role="status"
        className={`rounded-md px-3 py-2 text-sm md:col-span-2 ${score >= threshold ? "border border-[var(--danger)] bg-[var(--danger-soft)]" : "bg-[var(--accent-soft)]"}`}
      >
        대응 뒤 점수 {score}점
        {score >= threshold
          ? ` — 아직 ${threshold}점 이상이라 대표에게 추가 대응 검토 알림이 갑니다.`
          : "."}
      </p>
    </>
  );
}
