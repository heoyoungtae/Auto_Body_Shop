import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { registerToolAction } from "../actions";
import { ToolFields } from "../_form";

/** 치공구 등록(10.1): 받을 때 등록하고 라벨을 붙인다 */
export default async function NewToolPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const users = (await listUsers(db)).filter((u) => u.active);
  return (
    <>
      <PageTitle
        help="tools.new"
        sub="치공구를 받으면 바로 등록합니다. 관리 번호(TL-)가 매겨지고, 라벨을 인쇄해 붙입니다."
        actions={
          <Link href="/tools" className="text-sm text-[var(--accent)]">
            ← 치공구
          </Link>
        }
      >
        치공구 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "equip.manage") ? (
        <Card title="치공구(F-08-08)" help={{ kind: "panel", id: "tool.info" }}>
          <AssistForm id="tool-new" action={registerToolAction} className="grid gap-3 md:grid-cols-2">
            <ToolFields users={users} />
            <div className="md:col-span-2">
              <SubmitButton>등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">치공구 등록은 공장장·대표가 합니다.</p>
      )}
    </>
  );
}
