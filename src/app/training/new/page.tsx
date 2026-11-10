import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createTrainingAction } from "../actions";
import { TrainingFields } from "../_form";

/** 교육 계획 올리기: 연간 계획 한 줄 또는 수시 교육(채용 시·작업 변경·OJT) */
export default async function NewTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kind?: string; who?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const users = (await listUsers(await getDb())).filter((u) => u.active);
  const who = q.who ? users.find((u) => u.id === q.who) : undefined;
  const year = Number(seoulDate().slice(0, 4));
  return (
    <>
      <PageTitle
        help="training.new"
        sub="연간 계획에 없던 교육(채용 시, 작업 내용 변경 시, OJT 등)을 올립니다. 실시한 뒤 이수자를 기록합니다."
        actions={
          <Link href="/training" className="text-sm text-[var(--accent)]">
            ← 교육 훈련
          </Link>
        }
      >
        교육 계획 올리기
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "training.manage") ? (
        <Card
          title={who ? `${who.name} 채용 시 교육` : "교육 계획(F-11-03 계획란)"}
          help={{ kind: "panel", id: "tr.plan" }}
        >
          <AssistForm
            id="training-new"
            action={createTrainingAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <TrainingFields
              users={users}
              year={year}
              kind={q.kind}
              from={who ? "신규 입사자 할 일" : undefined}
              target={who ? `신규 입사자: ${who.name}` : undefined}
            />
            <div className="md:col-span-2">
              <SubmitButton>올리기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          교육 계획은 대표·공장장·안전환경 담당이 올립니다.
        </p>
      )}
    </>
  );
}
