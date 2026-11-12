// 교육 한 건 화면의 '앱 학습' 카드(관리자): 진행 방식 → 자료 → 확인 문제 → 대상 배정 → 현황
import Link from "next/link";
import type { training, trainingMaterial, trainingQuestion } from "@/db/schema";
import { LINK_SUGGESTIONS, MATERIAL_KINDS, monthEnd, TR_MODES } from "@/modules/staff/training-rules";
import { AssistForm } from "../_assist";
import { CheckGroup, DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, Card, Empty } from "../_ui";
import { EvidenceFiles } from "../money/evidence-files";
import { ShowWhen } from "../consults/show-when";
import { learnAdminAction } from "./actions";

type Opt = { value: string; label: string };
type Progress = { id: number; name: string; dueOn: string | null; seen: number; total: number; studiedSec: number; score: number | null; attempts: number; signedAt: Date | null; how: string | null; certFile: { path: string; name: string } | null };

const HOW: Record<string, string> = { online: "앱 학습", cert: "수료증", class: "집합" };

export function LearnAdmin({
  t,
  materials,
  questions,
  progress,
  users,
  manuals,
  docs,
  stdRev,
  today,
}: {
  t: typeof training.$inferSelect;
  materials: (typeof trainingMaterial.$inferSelect)[];
  questions: (typeof trainingQuestion.$inferSelect)[];
  progress: Progress[];
  users: Opt[];
  manuals: Opt[];
  docs: Opt[];
  /** 표준서 개정 교육이면 최근 개정한 표준서를 먼저 골라 둔다 */
  stdRev?: string;
  today: string;
}) {
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const online = t.mode !== "class";
  const due = t.plannedMonth && monthEnd(t.plannedMonth) >= today ? monthEnd(t.plannedMonth) : "";
  const assigned = new Set(progress.map((p) => p.name));
  return (
    <div id="learn" className="space-y-4">
      <Card title="진행 방식" help={{ kind: "panel", id: "learn.mode" }}>
        <AssistForm id={`learn-mode-${t.id}`} action={learnAdminAction} className="grid gap-3 md:grid-cols-3">
          {hidden("settings")}
          <div className="md:col-span-3">
            <RadioRow help="learn.mode" name="mode" required defaultValue={t.mode} options={Object.entries(TR_MODES).map(([value, label]) => ({ value, label }))} />
          </div>
          <NumberField help="learn.passScore" name="passScore" unit="점" min={50} max={100} defaultValue={t.passScore} />
          <CheckGroup help="learn.allowCert" name="allowCert" defaultChecked={t.allowCert ? ["1"] : []} options={[{ value: "1", label: "외부 기관 수료증으로 이수 허용" }]} />
          <div className="md:col-span-3">
            <SubmitButton variant="secondary">저장</SubmitButton>
          </div>
        </AssistForm>
      </Card>

      {online && (
        <>
          <Card title={`교육 자료 ${materials.length}개`} help={{ kind: "panel", id: "learn.materials" }}>
            {materials.length ? (
              <ol className="mb-3 divide-y divide-[var(--line)] text-sm">
                {materials.map((m, i) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-[var(--muted)]">{i + 1}.</span>
                    <Badge>{MATERIAL_KINDS[m.kind as keyof typeof MATERIAL_KINDS]}</Badge>
                    <span className="font-medium">{m.title}</span>
                    {m.minutes && <span className="text-xs text-[var(--muted)]">{m.minutes}분</span>}
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)]">
                        열기
                      </a>
                    )}
                    {m.linkOk === false && <Badge tone="danger">링크 끊김</Badge>}
                    <span className="ml-auto flex items-center gap-2">
                      {m.linkOk === false && (
                        <AssistForm id={`relink-${m.id}`} action={learnAdminAction} guard={false} className="flex items-center gap-1">
                          {hidden("relink")}
                          <input type="hidden" name="materialId" value={m.id} />
                          <input type="url" data-assist="grid" aria-label={`${m.title} 새 주소`} name="newUrl" placeholder="https://" className="h-9 w-56 rounded-md border border-[var(--line-strong)] px-2 text-sm" />
                          <SubmitButton variant="secondary">바꾸기</SubmitButton>
                        </AssistForm>
                      )}
                      <AssistForm id={`unmat-${m.id}`} action={learnAdminAction} guard={false}>
                        {hidden("unmaterial")}
                        <input type="hidden" name="materialId" value={m.id} />
                        <SubmitButton variant="danger">빼기</SubmitButton>
                      </AssistForm>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>아직 자료가 없습니다. 우리만의 방법은 사내 교재, 공공 자료는 링크로 넣습니다.</Empty>
            )}
            <details className="mt-2" open={!materials.length}>
              <summary className="cursor-pointer text-sm text-[var(--accent)]">+ 자료 넣기</summary>
              <AssistForm id={`learn-mat-${t.id}`} action={learnAdminAction} className="mt-3 grid gap-3 md:grid-cols-2">
                {hidden("material")}
                <div className="md:col-span-2">
                  <ShowWhen
                    field="matKind"
                    initial={stdRev ? "std" : ""}
                    cases={{
                      manual: manuals.length ? (
                        <SelectField help="learn.manualId" name="manualId" required placeholder="교재 고르기" options={manuals} />
                      ) : (
                        <p className="text-sm text-[var(--muted)]">
                          승인된 사내 교재가 없습니다.{" "}
                          <Link href="/training/manuals/new" className="text-[var(--accent)]">
                            사내 교재 만들기
                          </Link>
                        </p>
                      ),
                      std: <SelectField help="learn.docId" name="docId" required defaultValue={stdRev} placeholder="표준서 고르기" from={stdRev ? "최근 개정한 표준서" : undefined} options={docs} />,
                      video: <TextField help="learn.videoUrl" name="matUrl" required type="url" inputMode="url" />,
                      link: <TextField help="learn.linkUrl" name="matUrl" required type="url" inputMode="url" suggestions={LINK_SUGGESTIONS.map((l) => ({ value: l.url, label: l.title }))} />,
                      file: <EvidenceFiles help="learn.file" name="matFile" pickLabel="+ PDF·사진·짧은 영상" multiple={false} video />,
                    }}
                  >
                    <SelectField help="learn.kind" name="matKind" required defaultValue={stdRev ? "std" : ""} placeholder="종류 고르기" options={Object.entries(MATERIAL_KINDS).map(([value, label]) => ({ value, label }))} />
                  </ShowWhen>
                </div>
                <TextField help="learn.title" name="matTitle" />
                <NumberField help="learn.minutes" name="minutes" unit="분" min={1} max={600} />
                <div className="md:col-span-2">
                  <SubmitButton variant="secondary">자료 넣기</SubmitButton>
                </div>
              </AssistForm>
            </details>
          </Card>

          <Card title={`확인 문제 ${questions.length}개 · 합격 ${t.passScore}점`} help={{ kind: "panel", id: "learn.quiz" }}>
            {questions.length ? (
              <ol className="mb-3 space-y-2 text-sm">
                {questions.map((q, i) => (
                  <li key={q.id} className="rounded-md border border-[var(--line)] p-2">
                    <div className="flex items-start gap-2">
                      <span className="font-medium">
                        {i + 1}. {q.question}
                      </span>
                      <AssistForm id={`unq-${q.id}`} action={learnAdminAction} guard={false} className="ml-auto">
                        {hidden("unquestion")}
                        <input type="hidden" name="questionId" value={q.id} />
                        <SubmitButton variant="danger">빼기</SubmitButton>
                      </AssistForm>
                    </div>
                    <ol className="mt-1 list-decimal pl-6 text-[var(--muted)]">
                      {q.choices.map((c, j) => (
                        <li key={j} className={j === q.answer ? "font-medium text-[var(--ok)]" : ""}>
                          {c}
                          {j === q.answer ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-2 text-sm text-[var(--muted)]">문제가 없으면 자료를 다 보고 &apos;다 봤음&apos;만 누르면 이수입니다. 3~5문제를 권합니다.</p>
            )}
            <details open={!questions.length}>
              <summary className="cursor-pointer text-sm text-[var(--accent)]">+ 문제 넣기</summary>
              <AssistForm id={`learn-q-${t.id}`} action={learnAdminAction} className="mt-3 grid gap-3 md:grid-cols-2">
                {hidden("question")}
                <div className="md:col-span-2">
                  <TextField help="learn.question" name="question" required />
                </div>
                <TextAreaField help="learn.choices" name="choices" required rows={4} />
                <NumberField help="learn.answer" name="answer" required unit="번" min={1} max={5} />
                <div className="md:col-span-2">
                  <SubmitButton variant="secondary">문제 넣기</SubmitButton>
                </div>
              </AssistForm>
            </details>
          </Card>

          <Card title="대상 배정" help={{ kind: "panel", id: "learn.assign" }}>
            <AssistForm id={`learn-assign-${t.id}`} action={learnAdminAction} className="grid gap-3">
              {hidden("assign")}
              <CheckGroup help="learn.learnerIds" name="learnerIds" defaultChecked={[]} options={users.filter((u) => !assigned.has(u.label))} />
              <DateField help="learn.dueOn" name="dueOn" defaultValue={due} min={today} quick={["week", "nextMonth"]} />
              <p className="text-xs text-[var(--muted)]">
                시한을 비우면 {t.plannedMonth ? `계획 달 말일(${monthEnd(t.plannedMonth)})` : "오늘부터 14일"}
                {t.kind === "safety_hire" ? ", 채용 시 교육은 입사일 + 14일" : ""}입니다. 배정하면 각자 내 할 일에 뜨고 3일 전에 알림이 갑니다.
              </p>
              <div>
                <SubmitButton>배정</SubmitButton>
              </div>
            </AssistForm>
          </Card>

          <Card title="학습 현황" help={{ kind: "panel", id: "learn.progress" }}>
            {progress.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-2">이름</th>
                      <th className="pr-2">시한</th>
                      <th className="pr-2">자료</th>
                      <th className="pr-2">학습 시간</th>
                      <th className="pr-2">점수(횟수)</th>
                      <th>이수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {progress.map((p) => (
                      <tr key={p.id}>
                        <td className="py-1.5 pr-2">{p.name}</td>
                        <td className={`pr-2 ${!p.signedAt && p.dueOn && p.dueOn < today ? "font-medium text-[var(--danger)]" : ""}`}>{p.dueOn ?? "-"}</td>
                        <td className="pr-2">
                          {p.signedAt ? p.total : p.seen}/{p.total}
                        </td>
                        <td className="pr-2">{Math.round(p.studiedSec / 60)}분</td>
                        <td className="pr-2">{p.score != null ? `${p.score}점(${p.attempts})` : "-"}</td>
                        <td>
                          {p.signedAt ? (
                            <Badge tone="ok">{HOW[p.how ?? "online"]}</Badge>
                          ) : (
                            <Badge tone={p.dueOn && p.dueOn < today ? "danger" : "warn"}>{p.dueOn && p.dueOn < today ? "시한 지남" : "학습 중"}</Badge>
                          )}
                          {p.certFile && (
                            <a href={`/api/files/${p.certFile.path}`} target="_blank" rel="noreferrer" className="ml-1 text-xs text-[var(--accent)]">
                              수료증
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-right text-xs text-[var(--muted)]">
                  이수 {progress.filter((p) => p.signedAt).length}/{progress.length}명 · 모두 이수하면 교육이 &apos;실시&apos;로 바뀌고 기록부 이수란이 채워집니다
                </p>
              </div>
            ) : (
              <Empty>아직 배정한 사람이 없습니다.</Empty>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
