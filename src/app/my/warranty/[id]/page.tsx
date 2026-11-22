// 보증 신청(고객): 출고한 수리에 이상이 생겼을 때. 고객 불만·보증 처리부(F-06-02)에 '앱' 경로로 접수된다.
// 어느 수리·명세서인지는 이 수리 건에서 이어지고, 손님은 증상 한 줄과 사진만
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { myRepair } from "@/modules/carbook/service";
import { UserError } from "@/modules/platform/errors";
import { AssistForm } from "../../../_assist";
import { TextAreaField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { ErrorBox, Notice, PageTitle } from "../../../_ui";
import { claimWarrantyAction } from "../../actions";
import { requireMy } from "../../_session";
import { ClaimPhotos } from "./claim-photos";

export default async function MyWarrantyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const s = await requireMy();
  let r: Awaited<ReturnType<typeof myRepair>>;
  try {
    r = await myRepair(await getDb(), s, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.warranty" sub={`${r.plateNo} · ${r.inOn} 입고${r.statement ? ` · 명세서 ${r.statement.docNo}` : ""}`}>
        보증 신청
      </PageTitle>
      {r.status !== "delivered" ? (
        <Notice>아직 출고하지 않은 수리입니다. 궁금한 점은 공업사로 전화해 주세요.</Notice>
      ) : (
        <>
          {r.warranty.inWarranty ? (
            <Notice>보증 기간 안입니다({r.warranty.live.map((w) => `${w.kind} ${w.until}까지`).join(", ")}).</Notice>
          ) : (
            <Notice>보증 기간이 지났지만 보내실 수 있습니다. 차를 보고 공업사가 판단해 알려 드립니다.</Notice>
          )}
          <ErrorBox message={q.error} />
          <AssistForm id={`my-claim-${id}`} action={claimWarrantyAction} encType="multipart/form-data" className="space-y-4">
            <input type="hidden" name="roId" value={id} />
            <p className="text-sm text-[var(--muted)]">어느 부위가 어떻게 이상한지 한 줄로 적어 주세요. 어느 수리인지는 저절로 이어집니다.</p>
            <TextAreaField help="my.claimContent" name="content" required rows={3} />
            <ClaimPhotos />
            <TextField help="my.claimWish" name="wish" />
            <SubmitButton full>보내기</SubmitButton>
          </AssistForm>
        </>
      )}
      <p className="text-center text-sm">
        <Link href={`/my/repairs/${id}`} className="text-[var(--accent)] underline">
          수리 화면으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
