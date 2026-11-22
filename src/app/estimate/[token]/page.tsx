import { getDb } from "@/db/runtime";
import { approvalView } from "@/modules/repair/estimate-approval";
import { Notice, PageTitle } from "../../_ui";
import { ApprovalBody } from "../approval-body";
import { approveEstimateAction } from "./actions";

/** 고객용: 문자·알림톡으로 받은 링크에서 견적을 보고 작업별로 승인한다(STD-03 5절). 로그인 없이 열린다 */
export default async function EstimateApprovalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  const view = q.done ? null : await approvalView(await getDb(), token);
  const open = view?.state === "open" ? view : null;
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle help="public.estimate" sub={open?.shop?.name ?? "공업사"}>
        수리 견적 확인·승인
      </PageTitle>
      {q.done === "accepted" && <Notice>모든 작업을 승인해 주셔서 감사합니다. 승인하신 내용대로 수리를 시작하고, 끝나면 연락드리겠습니다. 이 창은 닫으셔도 됩니다.</Notice>}
      {q.done === "partial" && <Notice>고르신 작업만 승인되었습니다. 그 작업만 수리하고 비용도 그만큼만 받습니다. 빼신 작업은 공업사에서 한 번 더 안내드릴 수 있습니다.</Notice>}
      {q.done === "declined" && <Notice>이번 견적은 승인하지 않으신 것으로 받았습니다. 차량 인수 일정은 공업사에서 연락드리겠습니다.</Notice>}
      {view && view.state !== "open" && (
        <Notice>
          {view.state === "done"
            ? "이미 답해 주신 견적입니다. 바꾸시려면 공업사로 연락해 주세요."
            : view.state === "expired"
              ? `견적 유효기간(${view.validUntil}까지)이 지났습니다. 공업사에 다시 견적을 요청해 주세요.`
              : "올바르지 않거나 새 견적으로 바뀐 링크입니다. 가장 최근에 받은 문자의 링크를 열어 주세요."}
        </Notice>
      )}
      {open && <ApprovalBody open={open} error={q.error} action={approveEstimateAction} hidden={{ token }} />}
    </div>
  );
}
