import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { runList, type Q } from "@/modules/listq/core";
import { corrList } from "@/modules/listq/defs/work";
import { CORR_STATUS, CORR_TABS, CORR_TONE, PARTY_KINDS, type CorrStatus } from "@/modules/quality/corr-rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";

/** 문서 수발신 대장(F-Q-11): 받은 문서와 보낸 공문을 한 대장에. 처리할 것(처리 중·결재 중·발송 전)이 기본 */
export default async function CorrPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "corr.write"))
    return (
      <>
        <PageTitle help="corr">문서 수발신 대장</PageTitle>
        <ErrorBox message="문서 수발신은 대표·공장장·상담원·품질·안전환경·회계 담당이 씁니다(권한표 '받은 문서 접수, 회사 공문 쓰기')" />
      </>
    );
  const lr = await runList(await getDb(), corrList, user, q);
  const f = CORR_TABS.find((t) => t.v === q.f)?.v ?? "todo";
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="corr"
        std="F-Q-11 · STD-Q 7절"
        sub="관청·보험사·거래처와 주고받은 문서를 접수 번호·문서번호로 한곳에 남깁니다. 받은 문서는 담당과 처리 기한을 정하고, 회사 이름으로 보내는 공문은 대표 승인 뒤 직인을 찍어 보냅니다."
        actions={
          <>
            <Link href="/corr/receive" className={buttonClass()}>
              받은 문서 접수
            </Link>
            <Link href="/corr/new" className={buttonClass("secondary")}>
              공문 쓰기
            </Link>
          </>
        }
      >
        문서 수발신 대장
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="수발신 대장" help={{ kind: "panel", id: "corr.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {CORR_TABS.map((t) => (
            <Link key={t.v} href={`/corr${lr.qs({ f: t.v === "todo" ? null : t.v })}`} className={`rounded-full border px-3 py-1 ${f === t.v ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <ListBar r={lr} bare />
        {lr.rows.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {lr.rows.map(({ r, owner }) => {
              const st = r.status as CorrStatus;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone={r.dir === "in" ? "accent" : "neutral"}>{r.dir === "in" ? "받음" : "보냄"}</Badge>
                  <Link href={`/corr/${r.id}`} className="font-medium text-[var(--accent)]">
                    {r.no}
                  </Link>
                  <span className="min-w-0 flex-1">
                    {r.party}
                    <span className="text-[var(--muted)]"> · {PARTY_KINDS[r.partyKind as keyof typeof PARTY_KINDS] ?? ""}</span> · {r.title}
                  </span>
                  <Badge tone={CORR_TONE[st]}>{CORR_STATUS[st]}</Badge>
                  {r.status === "open" && r.dueOn && r.dueOn < today && <Badge tone="danger">기한 지남</Badge>}
                  {r.needReply && r.status === "open" && <Badge tone="warn">회신 필요</Badge>}
                  <span className="text-xs text-[var(--muted)]">
                    {r.dir === "in" ? `받음 ${r.receivedOn}` : r.sentOn ? `보냄 ${r.sentOn}` : "발송 전"}
                    {r.dueOn && r.status === "open" ? ` · 기한 ${r.dueOn}` : ""}
                    {owner ? ` · ${owner}` : ""}
                    {r.files.length ? ` · 파일 ${r.files.length}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            action={
              <Link href="/corr/receive" className="text-[var(--accent)]">
                받은 문서 접수
              </Link>
            }
          >
            {f === "todo" ? "처리할 문서가 없습니다." : "해당하는 문서가 없습니다."}
          </Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
