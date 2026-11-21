import Link from "next/link";
import { getDb } from "@/db/runtime";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { partySuggestions } from "@/modules/quality/corr";
import { CORR_VIA } from "@/modules/quality/corr-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, PageTitle } from "../../_ui";
import { EvidenceFiles } from "../../money/evidence-files";
import { receiveCorrAction } from "../actions";
import { PartyFields } from "../party-fields";

/** 받은 문서 접수(F-Q-11 받은 쪽): 받은 날·보낸 곳·상대 문서번호·제목·요지·사진/PDF·담당·처리 기한 */
export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [hints, users] = await Promise.all([partySuggestions(db), listUsers(db)]);
  const staff = users.filter((u) => u.active && u.roles.some((r) => r !== "technician"));
  return (
    <>
      <PageTitle
        help="corr.receive"
        std="F-Q-11"
        sub="종이 공문은 휴대폰으로 찍어, 메일·누리집 공문은 PDF로 붙입니다. 접수 번호는 저장할 때 앱이 매깁니다. 담당을 고르면 그 사람에게 알림과 할 일이 갑니다."
        actions={
          <Link href="/corr" className={buttonClass("secondary")}>
            대장으로
          </Link>
        }
      >
        받은 문서 접수
      </PageTitle>
      <ErrorBox message={error} />
      {!can(user, "corr.write") ? (
        <ErrorBox message="문서 접수 권한이 없습니다" />
      ) : (
        <Card title="받은 문서" help={{ kind: "panel", id: "corr.receiveForm" }}>
          <AssistForm id="corr-receive" action={receiveCorrAction} className="grid gap-3 md:grid-cols-2" guard={false}>
            <DateField help="corr.receivedOn" name="receivedOn" required defaultValue={seoulDate()} quick={["today"]} />
            <SelectField help="corr.viaIn" name="via" defaultValue="post" options={Object.entries(CORR_VIA).map(([value, label]) => ({ value, label }))} />
            <PartyFields hints={hints} dir="in" />
            <TextField help="corr.theirNo" name="theirNo" />
            <DateField help="corr.theirDate" name="theirDate" quick={[]} />
            <div className="md:col-span-2">
              <TextField help="corr.titleIn" name="title" required />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="corr.summary" name="body" rows={3} />
            </div>
            <div className="md:col-span-2">
              <EvidenceFiles help="corr.files" name="corrFiles" pickLabel="+ 문서 사진·PDF 고르기" />
            </div>
            <SelectField help="corr.owner" name="ownerId" defaultValue={user.id} options={staff.map((u) => ({ value: u.id, label: `${u.name}(${u.roles.map((r) => ROLE_LABEL[r as Role]).join("·")})` }))} />
            <CheckGroup help="corr.needReply" name="needReply" options={[{ value: "1", label: "회신(답장 공문)이 필요함" }]} />
            <DateField help="corr.dueOn" name="dueOn" quick={["week", "nextMonth"]} />
            <TextField help="corr.note" name="note" />
            <div className="md:col-span-2">
              <SubmitButton>접수</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
