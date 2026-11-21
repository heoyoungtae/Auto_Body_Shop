import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { DOC_KINDS } from "@/modules/quality/qms-rules";
import { reviewDue } from "@/modules/quality/doc-files";
import { docPreviews } from "@/modules/quality/std";
import { stdHref } from "@/modules/quality/std-ref";
import { addDays, seoulDate } from "@/modules/platform/time";
import { StdMd } from "../../std/_md";
import { runList, type Q } from "@/modules/listq/core";
import { docsList } from "@/modules/listq/defs/work";
import { ListBar, ListPager } from "../../_list-bar";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../../_ui";
import { docAction } from "../actions";

const TABS = [
  { f: "current", label: "현행" },
  { f: "review", label: "정기 검토 대상" },
  { f: "retired", label: "폐지" },
  { f: "all", label: "전체" },
] as const;

/** 문서 목록(F-Q-04): 표준서·지침서·양식·외부 문서의 현행 판. 판은 개정 요청서(F-Q-05) 승인으로 오른다 */
export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<Q>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const f = (TABS.find((t) => t.f === q.f)?.f ??
    "current") as (typeof TABS)[number]["f"];
  if (q.k && !(q.k in DOC_KINDS)) delete q.k;
  const db = await getDb();
  const lr = await runList(db, docsList, user, q);
  const list = lr.rows;
  const mgr = can(user, "qms.docs");
  const pv = await docPreviews(db, user, list.filter((d) => d.kind === "std" || d.kind === "form").map((d) => d.no));
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="qms.docs"
        sub="현행 판만 씁니다. 줄의 '내용 보기'로 양식 본문·절차서 차례를 바로 펼치고, 지침서·외부 문서는 파일을 엽니다. 표준서·양식을 바꾸려면 문서마다 '개정 요청'을 눌러 F-Q-05로 올립니다."
      >
        문서 목록
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.f}
            href={`/qms/docs${lr.qs({ f: t.f === "current" ? null : t.f, k: null })}`}
            className={buttonClass(t.f === f ? "primary" : "secondary")}
          >
            {t.label}
          </Link>
        ))}
        {Object.entries(DOC_KINDS).map(([k, label]) => (
          <Link
            key={k}
            href={`/qms/docs${lr.qs({ k: q.k === k ? null : k })}`}
            className={buttonClass(q.k === k ? "primary" : "secondary")}
          >
            {label}
          </Link>
        ))}
      </div>
      <Card title="문서" help={{ kind: "panel", id: "docs.list" }}>
        <ListBar r={lr} bare />
        {list.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((d) => (
              <li key={d.id} className="py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/qms/docs/${d.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {d.no}
                </Link>
                <span>{d.name}</span>
                <Badge>{DOC_KINDS[d.kind as keyof typeof DOC_KINDS]}</Badge>
                <span className="text-xs">{d.rev}</span>
                {d.effectiveOn && (
                  <span className="text-xs text-[var(--muted)]">
                    {d.effectiveOn} 시행
                  </span>
                )}
                {d.status === "retired" && <Badge tone="neutral">폐지</Badge>}
                {d.owner && (
                  <span className="text-xs text-[var(--muted)]">{d.owner}</span>
                )}
                {(() => {
                  const cur = d.files.map((f, i) => ({ f, i })).filter((x) => x.f.rev === d.rev);
                  const due = d.kind === "std" || d.kind === "wi" ? reviewDue(d) : null;
                  const open = d.kind !== "external" && d.kind !== "wi" ? stdHref(d.no) : null;
                  return (
                    <>
                      {due && d.status === "current" && due <= addDays(today, 30) && <Badge tone={due < today ? "danger" : "warn"}>검토 {due}</Badge>}
                      {cur.length > 0 && (
                        <a href={`/api/doc-file/${d.id}/${cur[0].i}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--accent)] underline">
                          파일 열기{cur.length > 1 ? `(${cur.length})` : ""}
                        </a>
                      )}
                      {open && (
                        <Link href={open} className="text-xs text-[var(--accent)]">
                          본문
                        </Link>
                      )}
                    </>
                  );
                })()}
                </div>
                {pv.get(d.no) && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-xs text-[var(--muted)]">내용 보기</summary>
                    <div className="mt-1 rounded-md border border-[var(--line)] p-2">
                      {pv.get(d.no)!.form ? (
                        <StdMd body={pv.get(d.no)!.form!} id={`pv-${d.id}`} />
                      ) : (
                        <ul className="columns-1 gap-4 text-xs md:columns-2">
                          {pv.get(d.no)!.sections!.map((x) => (
                            <li key={x.href}>
                              <Link href={x.href} className="text-[var(--accent)]">
                                {x.no} {x.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            action={
              mgr && f === "current" ? (
                <AssistForm id="docs-seed" action={docAction}>
                  <input type="hidden" name="intent" value="seed" />
                  <SubmitButton>표준서 장·양식 목록 넣기</SubmitButton>
                </AssistForm>
              ) : undefined
            }
          >
            문서가 없습니다.
          </Empty>
        )}
        <ListPager r={lr} />
      </Card>
      {mgr && (
        <Card
          title="문서 등록(작업 지침서·외부 문서)"
          help={{ kind: "panel", id: "docs.add" }}
        >
          <AssistForm
            id="docs-add"
            action={docAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <TextField help="docs.no" name="no" required />
            <TextField help="docs.name" name="name" required />
            <SelectField
              help="docs.kind"
              name="kind"
              required
              defaultValue="external"
              options={Object.entries(DOC_KINDS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <TextField help="docs.rev" name="rev" required />
            <DateField
              help="docs.effectiveOn"
              name="effectiveOn"
              quick={["today"]}
            />
            <TextField help="docs.owner" name="owner" />
            <TextField help="docs.location" name="location" />
            <TextField help="docs.source" name="source" />
            <DateField
              help="docs.receivedOn"
              name="receivedOn"
              quick={["today"]}
            />
            <TextField help="docs.note" name="note" />
            <div className="md:col-span-2">
              <SubmitButton>등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
