import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getManual, stdOptions } from "@/modules/staff/elearning";
import { AssistForm } from "../../../_assist";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../../_ui";
import { manualAction } from "../../actions";
import { ManualForm } from "../_form";

const fileHref = (p: string) => `/api/files/${p}`;

/** 사내 교재 한 권: 내용·근거 표준서·개정 이력·쓰는 교육, 대표 승인 */
export default async function ManualPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getManual(db, id).catch(() => null);
  if (!r) notFound();
  const { m, uses, names, changed } = r;
  const manage = can(user, "training.manage");
  const docs = manage ? await stdOptions(db) : [];
  return (
    <>
      <PageTitle
        help="training.manual"
        sub={`${m.rev ? `${m.rev}판` : "초안"}${m.approvedAt ? ` · ${fmtTime(m.approvedAt)} ${names.get(m.approvedBy ?? "") ?? ""} 승인` : ""} · 근거 ${m.stdRevs.map((s) => `${s.no}(${s.rev})`).join(", ") || "없음"}`}
        actions={
          <Link href="/training/manuals" className="text-sm text-[var(--accent)]">
            ← 사내 교재
          </Link>
        }
      >
        {m.no} {m.title} {m.status === "approved" ? <Badge tone="ok">사용 중</Badge> : <Badge tone="warn">승인 대기</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {changed.length > 0 && <Notice>근거 표준서가 개정되었습니다: {changed.map((c) => `${c.no} ${c.was} → ${c.rev}`).join(", ")}. 내용을 맞춰 고치고 개정 승인을 받으세요.</Notice>}

      {m.status === "draft" && can(user, "training.plan") && (
        <Card title="대표 승인" help={{ kind: "panel", id: "tm.approve" }}>
          <p className="mb-2 text-sm">
            {m.changeNote ? `개정 내용: ${m.changeNote}. ` : ""}내용을 확인하고 승인하면 {m.rev + 1}판이 되어 교육 자료로 쓸 수 있습니다.
          </p>
          <AssistForm id={`tm-approve-${id}`} action={manualAction} guard={false}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="approve" />
            <SubmitButton>승인</SubmitButton>
          </AssistForm>
        </Card>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="내용" help={{ kind: "panel", id: "tm.body" }}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</div>
          {m.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.files.map((f) =>
                f.path.endsWith(".pdf") ? (
                  <a key={f.path} href={fileHref(f.path)} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)]">
                    📄 {f.name}
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.path} src={fileHref(f.path)} alt={f.name} className="max-h-48 rounded-md border border-[var(--line)]" />
                ),
              )}
            </div>
          )}
          {m.videoUrl && (
            <a href={m.videoUrl} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-[var(--accent)]">
              ▶ 시연 영상
            </a>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="개정 이력" help={{ kind: "panel", id: "tm.history" }}>
            {m.history.length ? (
              <ul className="space-y-1 text-sm">
                {[...m.history].reverse().map((h) => (
                  <li key={h.rev}>
                    <b>{h.rev}판</b> {h.approvedAt} · {names.get(h.by) ?? ""} · {h.note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 승인 전입니다.</p>
            )}
          </Card>
          <Card title="쓰는 교육" help={{ kind: "panel", id: "tm.uses" }}>
            {uses.length ? (
              <ul className="space-y-1 text-sm">
                {uses.map((u) => (
                  <li key={u.id}>
                    <Link href={`/training/${u.id}`} className="text-[var(--accent)]">
                      {u.year} {u.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 이 교재를 쓰는 교육이 없습니다. 교육 화면의 &apos;자료 넣기&apos;에서 고릅니다.</p>
            )}
          </Card>
        </div>
      </div>

      {manage && m.status !== "retired" && (
        <div className="mt-4">
          <Card title={m.rev ? "개정하기" : "고치기"} help={{ kind: "panel", id: "tm.form" }}>
            <details open={changed.length > 0}>
              <summary className="cursor-pointer text-sm text-[var(--accent)]">{m.rev ? "내용 고쳐 개정 요청" : "내용 고치기"}</summary>
              <div className="mt-3">
                <ManualForm m={m} docs={docs.map((d) => ({ value: d.id, label: `${d.no} ${d.name} (${d.rev})` }))} />
              </div>
            </details>
          </Card>
        </div>
      )}
    </>
  );
}
