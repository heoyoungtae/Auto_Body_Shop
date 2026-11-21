import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { getCorr, partySuggestions } from "@/modules/quality/corr";
import { CORR_STATUS, CORR_TONE, CORR_VIA, enclosureList, PARTY_KINDS, type CorrStatus } from "@/modules/quality/corr-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser, userMessage } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle, StatusBadge } from "../../_ui";
import { EvidenceFiles } from "../../money/evidence-files";
import { corrAction } from "../actions";
import { PartyFields } from "../party-fields";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 수발신 한 건: 받은 문서(담당·기한·처리 끝·회신) 또는 보낸 공문(결재·인쇄·발송) */
export default async function CorrDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  let g: Awaited<ReturnType<typeof getCorr>>;
  try {
    g = await getCorr(db, user, id);
  } catch (e) {
    return (
      <>
        <PageTitle help="corr.detail">문서 수발신</PageTitle>
        <ErrorBox message={userMessage(e)} />
      </>
    );
  }
  const { r, replyTo, replies, approval, names } = g;
  const st = r.status as CorrStatus;
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const isIn = r.dir === "in";
  const mine = r.createdBy === user.id;
  const today = seoulDate();
  const editable = isIn ? r.status === "open" : r.status === "writing" && mine;
  const fileOpen = isIn ? r.status === "open" : r.status === "writing" || r.status === "approved";
  const [hints, users] = editable ? await Promise.all([partySuggestions(db), listUsers(db)]) : [[], []];
  const staff = users.filter((u) => u.active && u.roles.some((x) => x !== "technician"));
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  const enc = enclosureList(r.enclosures);
  return (
    <>
      <PageTitle
        help="corr.detail"
        std={isIn ? "F-Q-11" : "F-Q-12"}
        sub={
          <>
            {isIn ? "받은 문서" : "보낸 공문"} · {r.party} · <Badge tone={CORR_TONE[st]}>{CORR_STATUS[st]}</Badge>
            {isIn && r.status === "open" && r.dueOn && r.dueOn < today && (
              <>
                {" "}
                <Badge tone="danger">기한 지남</Badge>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href="/corr" className={buttonClass("secondary")}>
              대장으로
            </Link>
            {isIn && r.status === "open" && can(user, "corr.write") && (
              <Link href={`/corr/new?reply=${r.id}`} className={buttonClass()}>
                회신 쓰기
              </Link>
            )}
            {!isIn && r.status !== "void" && (
              <Link href={`/corr/${r.id}/print`} className={buttonClass(r.status === "approved" ? "primary" : "secondary")}>
                {r.status === "writing" ? "미리 보기" : "인쇄·PDF"}
              </Link>
            )}
            {!isIn && can(user, "corr.write") && (
              <Link href={`/corr/new?copy=${r.id}`} className={buttonClass("secondary")}>
                이 공문으로 새로 쓰기
              </Link>
            )}
          </>
        }
      >
        {r.no} {r.title}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={isIn ? "받은 문서" : "공문"} help={{ kind: "panel", id: isIn ? "corr.inInfo" : "corr.outInfo" }}>
          <dl className="text-sm">
            {isIn ? (
              <>
                {row("접수 번호", r.no)}
                {row("받은 날", `${r.receivedOn ?? ""}${r.via ? ` · ${CORR_VIA[r.via as keyof typeof CORR_VIA] ?? r.via}` : ""}`)}
                {row("보낸 곳", `${r.party} (${PARTY_KINDS[r.partyKind as keyof typeof PARTY_KINDS] ?? r.partyKind})`)}
                {row("상대 문서", [r.theirNo, r.theirDate].filter(Boolean).join(" · "))}
                {row("요지", r.body)}
                {row("담당", nm(r.ownerId))}
                {row("처리 기한", r.dueOn ? `${r.dueOn}${r.needReply ? " (회신 필요)" : ""}` : r.needReply ? "회신 필요" : "")}
                {r.status === "done" && row("처리", `${r.doneOn ?? ""} · ${r.doneNote ?? ""}`)}
              </>
            ) : (
              <>
                {row("문서번호", r.no)}
                {row("수신", `${r.party} (${PARTY_KINDS[r.partyKind as keyof typeof PARTY_KINDS] ?? r.partyKind})`)}
                {row("주소", r.partyAddr)}
                {row("참조", r.cc)}
                {row("본문", r.body)}
                {row("붙임", enc.map((e, i) => `${i + 1}. ${e}`).join("\n"))}
                {row("기안", `${nm(r.createdBy)} ${fmtTime(r.createdAt)}`)}
                {row("발송", r.sentOn ? `${r.sentOn} · ${CORR_VIA[r.via as keyof typeof CORR_VIA] ?? r.via ?? ""}` : "")}
                {r.note && row("메모", r.note)}
              </>
            )}
            {replyTo && row("회신하는 문서", <Link href={`/corr/${replyTo.id}`} className="text-[var(--accent)]">{`${replyTo.no} ${replyTo.party} · ${replyTo.title}`}</Link>)}
            {approval &&
              row(
                "결재",
                <span className="inline-flex items-center gap-2">
                  <Link href={`/approvals/${approval.id}`} className="text-[var(--accent)]">
                    {approval.docNo} 결재 보기
                  </Link>
                  <StatusBadge status={approval.status} />
                </span>,
              )}
            {r.note && isIn && row("메모", r.note)}
            {row("등록", `${nm(r.createdBy)} ${fmtTime(r.createdAt)}`)}
          </dl>
          {replies.length > 0 && (
            <div className="mt-3 border-t border-[var(--line)] pt-2 text-sm">
              <p className="mb-1 text-xs text-[var(--muted)]">이 문서에 보낸 회신</p>
              <ul className="space-y-1">
                {replies.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/corr/${x.id}`} className="text-[var(--accent)]">
                      {x.no} {x.title}
                    </Link>
                    <Badge tone={CORR_TONE[x.status as CorrStatus]}>{CORR_STATUS[x.status as CorrStatus]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title={`파일 ${r.files.length}개`} help={{ kind: "panel", id: "corr.fileList" }}>
          {r.files.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {r.files.map((f, i) => (
                <li key={f.path} className="flex flex-wrap items-center gap-2 py-1.5">
                  <a href={`/api/corr-file/${r.id}/${i}`} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                    {f.name}
                  </a>
                  <span className="text-xs text-[var(--muted)]">
                    {kb(f.size)} · {nm(f.by)} {fmtTime(f.at)}
                  </span>
                  {fileOpen && (
                    <form action={corrAction} className="ml-auto">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="intent" value="removeFile" />
                      <input type="hidden" name="path" value={f.path} />
                      <SubmitButton variant="secondary">떼기</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">{isIn ? "받은 문서 사진·PDF가 없습니다. 종이 문서면 찍어서 붙여 주세요." : "붙임 서류 사본이나 보낸 공문 PDF를 붙여 둘 수 있습니다."}</p>
          )}
          {fileOpen && (
            <AssistForm id={`corr-files-${r.id}`} action={corrAction} className="mt-3 space-y-2" guard={false}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="files" />
              <EvidenceFiles help="corr.files" name="corrFiles" pickLabel="+ 사진·PDF 고르기" />
              <SubmitButton variant="secondary">붙이기</SubmitButton>
            </AssistForm>
          )}
        </Card>

        {isIn && r.status === "open" && (
          <Card title="처리 끝" help={{ kind: "panel", id: "corr.close" }}>
            <AssistForm id={`corr-close-${r.id}`} action={corrAction} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="close" />
              <TextField help="corr.doneNote" name="doneNote" required suggestions={[{ value: "확인만 함(회신 필요 없음)" }, { value: "전화로 답함" }, { value: "이메일로 답함" }, { value: "요청 서류 제출함" }, { value: "관련 업무에 반영함" }]} />
              <SubmitButton>처리 끝</SubmitButton>
            </AssistForm>
            {r.needReply && <p className="mt-2 text-xs text-[var(--muted)]">회신 공문으로 답할 때는 위 &lsquo;회신 쓰기&rsquo;를 누르세요. 회신을 보내면 이 문서는 저절로 처리 끝이 됩니다.</p>}
          </Card>
        )}
        {isIn && r.status === "done" && (
          <Card title="다시 열기" help={{ kind: "panel", id: "corr.reopen" }}>
            <form action={corrAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="reopen" />
              <SubmitButton variant="secondary">다시 열기</SubmitButton>
            </form>
          </Card>
        )}

        {!isIn && r.status === "approved" && (
          <Card title="발송 기록" help={{ kind: "panel", id: "corr.send" }}>
            <AssistForm id={`corr-send-${r.id}`} action={corrAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="send" />
              <DateField help="corr.sentOn" name="sentOn" required defaultValue={today} quick={["today"]} />
              <SelectField help="corr.viaOut" name="via" required defaultValue="email" options={Object.entries(CORR_VIA).map(([value, label]) => ({ value, label }))} />
              <div className="md:col-span-2">
                <TextField help="corr.sendNote" name="note" />
              </div>
              <div className="md:col-span-2">
                <SubmitButton>보낸 것으로 기록</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}

        {editable && isIn && (
          <Card title="고치기" help={{ kind: "panel", id: "corr.editIn" }}>
            <AssistForm id={`corr-edit-${r.id}`} action={corrAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="updateIn" />
              <DateField help="corr.receivedOn" name="receivedOn" required defaultValue={r.receivedOn ?? ""} quick={["today"]} />
              <SelectField help="corr.viaIn" name="via" defaultValue={r.via ?? ""} options={Object.entries(CORR_VIA).map(([value, label]) => ({ value, label }))} />
              <PartyFields hints={hints} dir="in" party={r.party} kind={r.partyKind} />
              <TextField help="corr.theirNo" name="theirNo" defaultValue={r.theirNo ?? ""} />
              <DateField help="corr.theirDate" name="theirDate" defaultValue={r.theirDate ?? ""} quick={[]} />
              <div className="md:col-span-2">
                <TextField help="corr.titleIn" name="title" required defaultValue={r.title} />
              </div>
              <div className="md:col-span-2">
                <TextAreaField help="corr.summary" name="body" rows={3} defaultValue={r.body ?? ""} />
              </div>
              <SelectField help="corr.owner" name="ownerId" defaultValue={r.ownerId ?? ""} options={staff.map((u) => ({ value: u.id, label: `${u.name}(${u.roles.map((x) => ROLE_LABEL[x as Role]).join("·")})` }))} />
              <CheckGroup help="corr.needReply" name="needReply" defaultChecked={r.needReply ? ["1"] : []} options={[{ value: "1", label: "회신(답장 공문)이 필요함" }]} />
              <DateField help="corr.dueOn" name="dueOn" defaultValue={r.dueOn ?? ""} quick={["week", "nextMonth"]} />
              <TextField help="corr.note" name="note" defaultValue={r.note ?? ""} />
              <div className="md:col-span-2">
                <SubmitButton>저장</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}
        {editable && !isIn && (
          <Card title="고치기" help={{ kind: "panel", id: "corr.editOut" }}>
            <AssistForm id={`corr-edit-${r.id}`} action={corrAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="updateOut" />
              <PartyFields hints={hints} dir="out" party={r.party} kind={r.partyKind} addr={r.partyAddr ?? ""} />
              <TextField help="corr.cc" name="cc" defaultValue={r.cc ?? ""} />
              <div className="md:col-span-2">
                <TextField help="corr.titleOut" name="title" required defaultValue={r.title} />
              </div>
              <div className="md:col-span-2">
                <TextAreaField help="corr.letterBody" name="body" required rows={10} defaultValue={r.body ?? ""} />
              </div>
              <div className="md:col-span-2">
                <TextAreaField help="corr.enclosures" name="enclosures" rows={3} defaultValue={r.enclosures ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <SubmitButton>{approval?.status === "rejected" ? "고쳐서 다시 올리기" : "고치기"}</SubmitButton>
              </div>
            </AssistForm>
            <form action={corrAction} className="mt-3">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="intent" value="discard" />
              <SubmitButton variant="danger">이 공문 버리기</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
