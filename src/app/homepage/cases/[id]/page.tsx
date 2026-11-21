// 홈페이지 › 작업 사례 한 건: 제목·설명·분야·차종, 가린 사진(전·후), 수리 건 사진에서 골라 가리기, 공개.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { CASE_CATEGORIES, CASE_LIMIT, caseSources, getCase } from "@/modules/site/content";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../../_lib/session";
import { AssistForm } from "../../../_assist";
import { CheckGroup, SelectField, TextAreaField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { HomepageTabs } from "../../_tabs";
import { deleteCaseAction, removeCasePhotoAction, saveCaseAction } from "../../actions";
import { CaseMasker } from "./case-masker";

export default async function CaseAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  await requireUser([...rolesFor("consult.write")]);
  const db = await getDb();
  const c = await getCase(db, id);
  if (!c) notFound();
  const src = c.repairOrderId ? await caseSources(db, c.repairOrderId) : { before: [], after: [] };
  const site = homepageHosts().length ? siteUrl() : "/site";
  const sides = [
    ["before", "수리 전"],
    ["after", "수리 후"],
  ] as const;
  return (
    <>
      <PageTitle
        help="homepage.case"
        sub={`${c.docNo ?? "수리 건 없음"} · 사진은 번호판·얼굴을 가린 새 그림만 올라갑니다(원본·위치정보는 올라가지 않음).`}
        std="STD-13"
        actions={
          c.published && c.consent ? (
            <Link href={`${site}/cases/${c.id}`} target="_blank" className={buttonClass("secondary")}>
              홈페이지에서 보기
            </Link>
          ) : undefined
        }
      >
        {c.title}
      </PageTitle>
      <HomepageTabs on="/homepage/cases" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        {!c.consent && <ErrorBox message="손님의 '수리 전후 사진 홍보 사용' 동의가 없거나 거두어졌습니다. 이 사례는 홈페이지에 보이지 않습니다." />}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="space-y-4">
          <Card title={`올린 사진 ${c.photos.length}/${CASE_LIMIT.photos}장`} help={{ kind: "panel", id: "homepage.casePhotos" }}>
            {sides.map(([s, label]) => {
              const list = c.photos.filter((p) => p.side === s);
              return (
                <div key={s} className="mb-3">
                  <p className="mb-1 text-sm font-semibold">
                    {label} {list.length ? <Badge tone="ok">{list.length}장</Badge> : <Badge tone="warn">없음</Badge>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((p) => (
                      <div key={p.path} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 가린 사진 미리 보기 */}
                        <img src={`/api/files/${p.path}`} alt={label} className="h-28 w-40 rounded-md object-cover" />
                        <form action={removeCasePhotoAction} className="absolute right-1 top-1">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="path" value={p.path} />
                          <button className="rounded bg-black/70 px-2 py-0.5 text-xs text-white" title="이 사진 빼기">
                            빼기
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
          <Card title="사진 골라 가리기" help={{ kind: "panel", id: "homepage.caseMask" }}>
            <CaseMasker caseId={c.id} full={c.photos.length >= CASE_LIMIT.photos} sources={[...src.before.map((path) => ({ path, side: "before" as const })), ...src.after.map((path) => ({ path, side: "after" as const }))]} />
          </Card>
        </div>
        <Card title="글·공개" help={{ kind: "panel", id: "homepage.caseForm" }}>
          <AssistForm id={`case-${c.id}`} action={saveCaseAction} className="space-y-4">
            <input type="hidden" name="id" value={c.id} />
            <TextField help="homepage.caseTitle" name="title" required defaultValue={c.title} />
            <SelectField help="homepage.caseCategory" name="category" required defaultValue={c.category} options={CASE_CATEGORIES.map((x) => ({ value: x, label: x }))} />
            <TextField help="homepage.caseCar" name="carLabel" defaultValue={c.carLabel ?? ""} />
            <TextAreaField help="homepage.caseBody" name="body" rows={6} defaultValue={c.body} />
            <CheckGroup help="homepage.publish" name="published" options={[{ value: "on", label: "홈페이지에 공개" }]} defaultChecked={c.published ? ["on"] : []} />
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
          <form action={deleteCaseAction} className="mt-3 border-t border-[var(--line)] pt-3">
            <input type="hidden" name="id" value={c.id} />
            <button className="text-sm text-[var(--danger)] underline">이 사례와 가린 사진 지우기</button>
          </form>
        </Card>
      </div>
    </>
  );
}
