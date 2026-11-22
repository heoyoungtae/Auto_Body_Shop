// 설정 › 홈페이지: 화면 글 칸 묶음 하나(첫 화면 단락 하나, 보험 수리 안내 등)를 고치는 양식 + '처음 문구로 되돌리기'.
// 칸 모양은 page-text.ts 의 종류대로: 한 줄 글·여러 줄 글 / 제목+설명 목록 / 한 줄에 하나씩 목록.
import type { ReactNode } from "react";
import { editValue, type SitePagesData } from "@/modules/site/pages";
import { pageTextDef, type Pair } from "@/modules/site/page-text";
import { AssistForm } from "../../_assist";
import { TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Card } from "../../_ui";
import { resetTextsAction, saveTextsAction } from "./actions";

const Edited = () => <span className="ml-1 rounded bg-[var(--accent-soft)] px-1.5 py-px text-[11px] font-semibold text-[var(--accent)]">고침</span>;

export function TextItems({ id, title, keys, raw, back, aside }: { id: string; title: ReactNode; keys: string[]; raw: SitePagesData; back: string; aside?: ReactNode }) {
  const edited = keys.filter((k) => editValue(raw, k).edited);
  return (
    <Card title={title} help={{ kind: "panel", id: "site.pageTexts" }}>
      {aside}
      <AssistForm id={`site-text-${id}`} action={saveTextsAction} className="space-y-4">
        <input type="hidden" name="keys" value={keys.join(",")} />
        <input type="hidden" name="back" value={back} />
        {keys.map((k) => {
          const d = pageTextDef(k)!;
          const { value, edited: own } = editValue(raw, k);
          const label = d.label;
          if (d.kind === "text")
            return (
              <div key={k}>
                {d.multi ? (
                  <TextAreaField help="site.text.para" name={`t:${k}`} label={label} rows={Math.min(5, Math.max(2, Math.ceil(d.def.length / 60)))} defaultValue={value as string} />
                ) : (
                  <TextField help="site.text.line" name={`t:${k}`} label={label} defaultValue={value as string} maxLength={d.max} />
                )}
                {own && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    <Edited /> 처음 문구: {d.def.replace(/\n/g, " / ")}
                  </p>
                )}
              </div>
            );
          if (d.kind === "lines") {
            const xs = value as string[];
            return (
              <div key={k}>
                <TextAreaField help="site.list.lines" name={`l:${k}`} label={`${label}(한 줄에 하나, ${d.max}줄까지)`} rows={Math.min(d.max, xs.length + 1)} defaultValue={xs.join("\n")} />
                {own && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    <Edited /> 처음 문구는 {d.def.length}줄입니다. 아래 &lsquo;처음 문구로 되돌리기&rsquo;로 되살립니다.
                  </p>
                )}
              </div>
            );
          }
          if (d.kind === "rows") {
            // 칸이 여럿인 목록(수리 방법): 지금 줄 + 빈 줄 1개. 모든 칸을 비운 줄은 지운다
            const rs = value as Record<string, string>[];
            const n = Math.min(d.max, rs.length + 1);
            return (
              <fieldset key={k} className="space-y-2 rounded-md border border-[var(--line)] p-3">
                <legend className="px-1 text-sm font-semibold">
                  {label}({d.max}개까지){own && <Edited />}
                </legend>
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className="grid gap-2 border-b border-dashed border-[var(--line)] pb-2 last:border-0 last:pb-0">
                    {d.fields.map((f) => (
                      <TextField key={f.k} help="site.list.cell" name={`r:${k}:${i}:${f.k}`} label={`${i + 1}. ${f.label}`} defaultValue={rs[i]?.[f.k] ?? ""} maxLength={f.max} />
                    ))}
                  </div>
                ))}
              </fieldset>
            );
          }
          // 제목+설명 목록: 지금 줄 + 빈 줄 2개(최대 개수까지). 둘 다 비운 줄은 지운다
          const xs = value as Pair[];
          const n = Math.min(d.max, xs.length + 2);
          return (
            <fieldset key={k} className="space-y-2 rounded-md border border-[var(--line)] p-3">
              <legend className="px-1 text-sm font-semibold">
                {label}({d.max}개까지{own ? "" : ", 처음 문구"}){own && <Edited />}
              </legend>
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="grid gap-2 border-b border-dashed border-[var(--line)] pb-2 last:border-0 last:pb-0">
                  <TextField help="site.list.title" name={`p:${k}:${i}:t`} label={`${i + 1}. 제목`} defaultValue={xs[i]?.t ?? ""} maxLength={40} />
                  <TextField help="site.list.desc" name={`p:${k}:${i}:d`} label={`${i + 1}. 설명`} defaultValue={xs[i]?.d ?? ""} maxLength={300} />
                </div>
              ))}
            </fieldset>
          );
        })}
        <SubmitButton>저장</SubmitButton>
      </AssistForm>
      {edited.length > 0 && (
        <form action={resetTextsAction} className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
          <input type="hidden" name="keys" value={edited.join(",")} />
          <input type="hidden" name="back" value={back} />
          <span className="text-xs text-[var(--muted)]">고친 칸 {edited.length}개</span>
          <SubmitButton variant="secondary">처음 문구로 되돌리기</SubmitButton>
        </form>
      )}
    </Card>
  );
}

/** 글에 넣을 수 있는 자리표시(정책값) 안내 */
export function TokenList({ tokens }: { tokens: { name: string; label: string; now: string }[] }) {
  return (
    <Card title="넣을 수 있는 값" help={{ kind: "panel", id: "site.tokens" }}>
      <p className="mb-2 text-sm text-[var(--muted)]">글에 중괄호로 적으면 정책값이 들어갑니다. 정책을 바꾸면 홈페이지 글도 함께 바뀝니다.</p>
      <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-sm">
        {tokens.map((t) => (
          <div key={t.name} className="contents">
            <dt>
              <code className="rounded bg-[var(--surface-2)] px-1">{`{${t.name}}`}</code>
            </dt>
            <dd className="text-[var(--muted)]">{t.label}</dd>
            <dd className="text-right tabular-nums">{t.now}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
