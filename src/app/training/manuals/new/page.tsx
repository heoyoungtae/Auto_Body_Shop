import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { stdOptions } from "@/modules/staff/elearning";
import { requireUser } from "../../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../../_ui";
import { ManualForm } from "../_form";

export default async function NewManualPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "training.manage")) return <p className="text-sm text-[var(--muted)]">사내 교재는 대표·공장장·안전환경 담당이 만듭니다.</p>;
  const docs = await stdOptions(await getDb());
  return (
    <>
      <PageTitle help="training.manualNew" sub="근거 표준서를 고르고, 뼈대 순서대로 우리 방법을 적습니다. 사진과 짧은 시연 영상 링크를 붙이면 이해가 빠릅니다. 저장하면 대표에게 승인 요청이 갑니다.">
        사내 교재 만들기
      </PageTitle>
      <ErrorBox message={q.error} />
      <Card title="교재" help={{ kind: "panel", id: "tm.form" }}>
        <ManualForm docs={docs.map((d) => ({ value: d.id, label: `${d.no} ${d.name} (${d.rev})` }))} />
      </Card>
    </>
  );
}
