// 내 차 수첩에서 견적 승인: 문자 링크 승인 화면과 같은 본문(ApprovalBody). 들어온 손님의 견적만 연다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { carbookApprovalView } from "@/modules/repair/estimate-approval";
import { myEstimateDoc } from "@/modules/carbook/service";
import { UserError } from "@/modules/platform/errors";
import { Notice, PageTitle } from "../../../_ui";
import { ApprovalBody } from "../../../estimate/approval-body";
import { approveMyEstimateAction } from "../../actions";
import { requireMy } from "../../_session";

export default async function MyEstimatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const s = await requireMy();
  const db = await getDb();
  let roId: string | null = null;
  try {
    roId = await myEstimateDoc(db, s, id);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
  }
  const view = q.done || !roId ? null : await carbookApprovalView(db, s.customerId, id);
  const open = view?.state === "open" ? view : null;
  const back = roId ? (
    <Link href={`/my/repairs/${roId}`} className="text-[var(--accent)] underline">
      수리 화면으로 돌아가기
    </Link>
  ) : null;
  return (
    <div className="pt-2">
      <PageTitle help="my.estimate" sub={open?.shop?.name ?? undefined}>
        수리 견적 확인·승인
      </PageTitle>
      {!roId && <Notice>볼 수 없는 견적입니다. 정비소에 문의해 주세요.</Notice>}
      {q.done === "accepted" && <Notice>모든 작업을 승인해 주셔서 감사합니다. 승인하신 내용대로 수리를 시작하고, 진행은 내 차 수첩에서 보실 수 있습니다.</Notice>}
      {q.done === "partial" && <Notice>고르신 작업만 승인되었습니다. 그 작업만 수리하고 비용도 그만큼만 받습니다.</Notice>}
      {q.done === "declined" && <Notice>이번 견적은 승인하지 않으신 것으로 받았습니다. 차량 인수 일정은 정비소에서 연락드리겠습니다.</Notice>}
      {view && view.state !== "open" && <Notice>{view.state === "done" ? "이미 답해 주신 견적입니다. 바꾸시려면 정비소로 연락해 주세요." : view.state === "expired" ? `견적 유효기간(${view.validUntil}까지)이 지났습니다. 정비소에 다시 견적을 요청해 주세요.` : "새 견적으로 바뀌었거나 볼 수 없는 견적입니다."}</Notice>}
      {open && <ApprovalBody open={open} error={q.error} action={approveMyEstimateAction} hidden={{ id }} />}
      {back && <p className="mt-4 text-center text-sm">{back}</p>}
    </div>
  );
}
