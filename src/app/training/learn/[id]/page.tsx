import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { learnView } from "@/modules/staff/elearning";
import { MATERIAL_KINDS, TR_KINDS, type TrKind } from "@/modules/staff/training-rules";
import { AssistForm } from "../../../_assist";
import { RadioRow } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../../_ui";
import { EvidenceFiles } from "../../../money/evidence-files";
import { learnAction } from "../../actions";
import { MaterialRow } from "../material-row";

const fileHref = (p: string) => `/api/files/${p}`;

/** 앱 개별 학습(본인): 자료를 차례로 보고 → 확인 문제(또는 수료증) → 이수(교육훈련기록부 이수란·서명) */
export default async function LearnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const r = await learnView(await getDb(), user, id).catch(() => null);
  if (!r) notFound();
  const { t, materials, questions, me } = r;
  const seen = (mid: string) => !!me?.viewed.includes(mid);
  const left = materials.filter((m) => !seen(m.id)).length;
  const passed = !!me?.signedAt;
  return (
    <>
      <PageTitle
        help="training.learn"
        std="STD-11 5절"
        sub={`${TR_KINDS[t.kind as TrKind]?.label ?? t.kind}${t.plannedHours ? ` · 계획 ${t.plannedHours}시간` : ""}${me?.dueOn ? ` · 시한 ${me.dueOn}` : ""}`}
        actions={
          <Link href="/todo" className="text-sm text-[var(--accent)]">
            ← 내 할 일
          </Link>
        }
      >
        {t.title} {passed ? <Badge tone="ok">이수</Badge> : me?.dueOn ? <Badge tone="warn">학습 중</Badge> : null}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!me?.dueOn && <Notice>이 교육의 앱 학습 대상이 아닙니다. 자료는 볼 수 있지만 기록되지 않습니다.</Notice>}

      {passed && (
        <Card title="이수 기록" help={{ kind: "panel", id: "learn.done" }}>
          <p className="text-sm">
            {fmtTime(me!.signedAt!)} 이수 · {me!.hours}시간{me!.score != null ? ` · ${me!.score}점` : ""} · 교육훈련기록부(F-11-03) 이수란에 기록되었고, 이수 확인이 서명을 대신합니다.
          </p>
        </Card>
      )}

      <Card title={`1. 자료 보기 ${materials.length - left}/${materials.length}`} help={{ kind: "panel", id: "learn.view" }}>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={materials.length} aria-valuenow={materials.length - left}>
          <div className="h-full bg-[var(--accent)]" style={{ width: `${materials.length ? ((materials.length - left) / materials.length) * 100 : 0}%` }} />
        </div>
        <ol className="space-y-2">
          {materials.map((m) => (
            <MaterialRow
              key={m.id}
              trainingId={t.id}
              materialId={m.id}
              title={m.title}
              kind={MATERIAL_KINDS[m.kind as keyof typeof MATERIAL_KINDS]}
              minutes={m.minutes}
              done={passed || seen(m.id)}
              href={m.url ?? (m.filePath ? fileHref(m.filePath) : m.doc ? `/qms/docs/${m.doc.id}` : null)}
              inline={
                m.manual ? (
                  <article className="space-y-3 text-sm">
                    <p className="text-xs text-[var(--muted)]">
                      {m.manual.no} · {m.manual.rev}판{m.manual.approvedAt ? ` · ${fmtTime(m.manual.approvedAt)} 승인` : ""}
                    </p>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.manual.body}</div>
                    {m.manual.files.map((f) =>
                      f.path.endsWith(".pdf") ? (
                        <a key={f.path} href={fileHref(f.path)} target="_blank" rel="noreferrer" className="block text-[var(--accent)]">
                          📄 {f.name}
                        </a>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={f.path} src={fileHref(f.path)} alt={f.name} className="max-h-96 rounded-md border border-[var(--line)]" />
                      ),
                    )}
                    {m.manual.videoUrl && (
                      <a href={m.manual.videoUrl} target="_blank" rel="noreferrer" className="block text-[var(--accent)]">
                        ▶ 시연 영상 보기
                      </a>
                    )}
                  </article>
                ) : m.filePath?.endsWith(".mp4") ? (
                  <video src={fileHref(m.filePath)} controls preload="metadata" className="max-h-96 w-full rounded-md" />
                ) : undefined
              }
            />
          ))}
        </ol>
      </Card>

      {me?.dueOn && !passed && (
        <Card title={questions.length ? `2. 확인 문제(${t.passScore}점 이상 합격)` : "2. 다 봤음 확인"} help={{ kind: "panel", id: "learn.quizTake" }}>
          {left > 0 ? (
            <p className="text-sm text-[var(--muted)]">자료를 모두 보면({left}개 남음) {questions.length ? "문제를 풉니다" : "이수 확인을 누릅니다"}.</p>
          ) : (
            <AssistForm id={`quiz-${t.id}`} action={learnAction} className="space-y-4">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="intent" value="quiz" />
              <input type="hidden" name="count" value={questions.length} />
              {questions.map((qq, i) => (
                <fieldset key={qq.id} className="space-y-1">
                  <legend className="text-sm font-medium">
                    {i + 1}. {qq.question}
                  </legend>
                  <RadioRow help="learn.pick" name={`q${i}`} label="답" required options={qq.choices.map((c, j) => ({ value: String(j), label: `${j + 1}) ${c}` }))} />
                </fieldset>
              ))}
              {me.attempts > 0 && <p className="text-xs text-[var(--muted)]">지난 점수 {me.score}점 · {me.attempts}번째 도전</p>}
              <SubmitButton>{questions.length ? "제출" : "다 봤습니다(이수 확인)"}</SubmitButton>
            </AssistForm>
          )}
        </Card>
      )}

      {me?.dueOn && !passed && t.allowCert && (
        <Card title="외부 기관 수료증으로 이수" help={{ kind: "panel", id: "learn.cert" }}>
          <AssistForm id={`cert-${t.id}`} action={learnAction} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="intent" value="cert" />
            <EvidenceFiles help="learn.certFile" name="certFile" pickLabel="+ 수료증 PDF·사진" multiple={false} />
            <SubmitButton variant="secondary">수료증 올리고 이수</SubmitButton>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
