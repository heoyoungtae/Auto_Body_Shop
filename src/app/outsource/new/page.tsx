import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { outsourceSeed } from "@/modules/purchase/outsource";
import { supplierOptions } from "@/modules/purchase/supplier";
import { addDays, seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createOutsourceAction } from "../actions";
import { OutsourceFields } from "../_fields";

/** 외주 의뢰서 만들기(수리 건에서 ?ro=). 견적의 외주 줄과 진단 표시를 불러온다 */
export default async function NewOutsourcePage({ searchParams }: { searchParams: Promise<{ ro?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const seed = q.ro ? await outsourceSeed(db, q.ro).catch(() => null) : null;
  const sups = await supplierOptions(db, "outsource");
  const today = seoulDate();
  const due = seed?.due && seed.due > today ? addDays(seed.due, -1) : addDays(today, 2);
  return (
    <>
      <PageTitle
        help="outsource.new"
        sub="작업 범위·요구 결과·납기·금액을 적으면 전결 규정에 따라 승인을 요청합니다. 외주 결과도 최종 검사 대상입니다."
        actions={
          seed && (
            <Link href={`/repairs/${seed.ro.id}`} className="text-sm text-[var(--accent)]">
              ← 수리 건
            </Link>
          )
        }
      >
        외주 의뢰
      </PageTitle>
      <ErrorBox message={q.error} />
      {!seed ? (
        <p className="text-sm text-[var(--muted)]">
          외주는 수리 건에서 시작합니다.{" "}
          <Link href="/repairs" className="text-[var(--accent)]">
            수리 건 목록
          </Link>
          에서 차를 열고 '외주 의뢰'를 누르세요.
        </p>
      ) : !can(user, "purchase.order") ? (
        <p className="text-sm text-[var(--muted)]">외주 의뢰는 공장장·대표가 합니다.</p>
      ) : (
        <Card title={`${seed.ro.plateNo} ${seed.ro.model ?? ""} · ${seed.ro.docNo}`} help={{ kind: "panel", id: "os.form" }}>
          {!sups.length && (
            <p className="mb-3 text-sm text-[var(--danger)]">
              외주 가공 업체가 없습니다.{" "}
              <Link href="/suppliers/new" className="text-[var(--accent)]">
                협력업체
              </Link>
              에 먼저 등록하세요.
            </p>
          )}
          {!seed.ro.agreeMove && <p className="mb-3 text-sm text-[var(--warn)]">입고 때 고객이 차량 이동에 동의하지 않았습니다. 업체로 옮기려면 고객 동의를 먼저 받으세요.</p>}
          <AssistForm id={`os-new-${seed.ro.id}`} action={createOutsourceAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="repairOrderId" value={seed.ro.id} />
            <OutsourceFields
              v={{ workType: seed.workType || undefined, scope: seed.scope, dueOn: due, amountWon: seed.amountWon || null, moveOut: true }}
              suppliers={sups}
              today={today}
              from={{ scope: seed.scope ? `견적 ${seed.estimate?.docNo ?? ""}` : undefined, amount: seed.amountWon ? "견적 외주 줄" : undefined, due: seed.due ? "출고 약속일" : undefined, type: seed.workType ? "진단" : undefined }}
            />
            <div className="md:col-span-2">
              <SubmitButton>만들고 승인 요청</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
