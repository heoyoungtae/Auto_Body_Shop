import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getChemical } from "@/modules/safety/chemical";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { chemicalAction } from "../actions";
import { ChemicalFields } from "../_form";
import { MsdsInput } from "../msds-input";

/** 화학물질 한 건(F-09-02): MSDS 열람·교체, 교육 기록, 고치기 */
export default async function ChemicalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const x = await getChemical(await getDb(), id).catch(() => null);
  if (!x) notFound();
  const manage = can(user, "safety.manage");
  const train = manage || user.roles.includes("plant_manager");
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="chemicals.detail"
        sub={`${x.category}${x.maker ? ` · ${x.maker}` : ""} · ${x.location}`}
        actions={
          <Link href="/chemicals" className="text-sm text-[var(--accent)]">
            ← 화학물질·MSDS
          </Link>
        }
      >
        {x.name} {x.flammable && <Badge tone="danger">인화성</Badge>}{" "}
        {!x.active && <Badge>사용 중지</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="MSDS·취급" help={{ kind: "panel", id: "chem.info" }}>
        <dl className="text-sm">
          {row(
            "MSDS",
            x.msdsPath ? (
              <a
                href={`/api/files/${x.msdsPath}`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)]"
              >
                {x.msdsName ?? "MSDS"} 열기
              </a>
            ) : (
              <span className="text-[var(--danger)]">
                없음 — 쓰기 전에 받아서 올려야 합니다
              </span>
            ),
          )}
          {row("MSDS 개정일", x.msdsRevisedOn)}
          {row("주요 유해 성분", x.hazards)}
          {row("필요 보호구", x.ppe.join(", "))}
          {row("월 사용량", x.monthlyUse)}
          {row("MSDS 교육", x.trainedOn)}
          {row("메모", x.note)}
          {row("올린 때", x.msdsUploadedAt ? fmtTime(x.msdsUploadedAt) : null)}
        </dl>
      </Card>
      {manage && (
        <Card
          title={x.msdsPath ? "MSDS 새 판으로 바꾸기" : "MSDS 올리기"}
          help={{ kind: "panel", id: "chem.msds" }}
        >
          <AssistForm
            id={`chem-msds-${id}`}
            action={chemicalAction}
            guard={false}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("msds")}
            <div className="md:col-span-2">
              <MsdsInput />
            </div>
            <DateField
              help="chem.msdsRevisedOn"
              name="revisedOn"
              defaultValue={x.msdsRevisedOn ?? ""}
              quick={[]}
            />
            <div className="md:col-span-2">
              <SubmitButton>올리기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
      {train && x.active && (
        <Card title="MSDS 교육 기록" help={{ kind: "panel", id: "chem.train" }}>
          <AssistForm
            id={`chem-train-${id}`}
            action={chemicalAction}
            className="flex flex-wrap items-end gap-3"
          >
            {hidden("train")}
            <div className="min-w-60">
              <DateField
                help="chem.trainedOn"
                name="trainedOn"
                required
                defaultValue={x.trainedOn ?? seoulDate()}
                quick={["today"]}
              />
            </div>
            <SubmitButton>기록</SubmitButton>
          </AssistForm>
        </Card>
      )}
      {manage && (
        <Card title="고치기" help={{ kind: "panel", id: "chem.edit" }}>
          <AssistForm
            id={`chem-edit-${id}`}
            action={chemicalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("update")}
            <ChemicalFields c={x} locations={{}} />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
          <AssistForm
            id={`chem-retire-${id}`}
            action={chemicalAction}
            guard={false}
            className="mt-4 border-t border-[var(--line)] pt-3"
          >
            {hidden(x.active ? "retire" : "restore")}
            <SubmitButton variant="secondary">
              {x.active ? "사용 중지(목록에서 내림)" : "다시 쓰기"}
            </SubmitButton>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
