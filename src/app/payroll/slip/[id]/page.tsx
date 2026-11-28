import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { loadShopInfo } from "@/modules/platform/shop";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { payLimits } from "@/modules/help/pay-items";
import { getSlip } from "@/modules/staff/payroll";
import { requireUser, userMessage } from "../../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../../_ui";
import { SlipLines } from "../../_lines";

/** 임금명세서(근로기준법 제48조 2항): 본인(지급 뒤) 또는 대표·회계 */
export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  let data: Awaited<ReturnType<typeof getSlip>>;
  try {
    data = await getSlip(db, user, id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { r, d } = data;
  const shop = await loadShopInfo(db);
  const limits = payLimits(await loadPolicy(db, seoulDate()));
  return (
    <>
      <PageTitle
        help="payroll.slip"
        sub={`${shop.name || "사업장"} · 지급일 ${r.payDate}`}
        actions={
          <Link
            href={
              can(user, "payroll.view") ? `/payroll/${r.ym}` : "/payroll/me"
            }
            className="text-sm text-[var(--accent)] print:hidden"
          >
            ← 돌아가기
          </Link>
        }
      >
        {r.ym} 임금명세서 · {d.name}
      </PageTitle>
      <Card title="지급·공제 내역" help={{ kind: "panel", id: "pay.slip" }}>
        <SlipLines d={d} limits={limits} />
        <p className="mt-3 text-xs text-[var(--muted)]">
          통상시급 {d.hourly.toLocaleString("ko-KR")}원(월 소정근로{" "}
          {d.monthHours}시간 기준) · 4대 보험은 과세 급여{" "}
          {d.insBase.toLocaleString("ko-KR")}원 기준 · 궁금한 점은 회계 담당에게
          물어 주세요. 항목 이름 옆 ?를 누르면 과세·비과세와 법적 근거가 나옵니다.
        </p>
      </Card>
    </>
  );
}
