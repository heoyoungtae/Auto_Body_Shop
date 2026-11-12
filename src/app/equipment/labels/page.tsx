import Link from "next/link";
import QRCode from "qrcode";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { appUrl } from "@/modules/customer/service";
import { listEquipment } from "@/modules/equipment/service";
import { loadShopInfo } from "@/modules/platform/shop";
import { listUsers } from "@/modules/auth/service";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { ErrorBox, PageTitle } from "../../_ui";
import { PrintButton } from "../../fixtures/labels/print-button";
import { equipmentLabeledAction } from "../../_asset/actions";

/** 설비 라벨: 번호·이름·관리자(정/부)·점검 주기·QR. QR을 찍으면 그 설비의 점검(또는 고장 신고) 화면이 열린다. ?ids= 로 고르거나, 없으면 라벨 안 붙인 설비 전부 */
export default async function EquipmentLabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [all, shop, users] = await Promise.all([listEquipment(db), loadShopInfo(db), listUsers(db)]);
  const nm = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "-") : "-");
  const pick = q.ids ? new Set(q.ids.split(",")) : null;
  const rows = all.filter((e) => e.status !== "pending" && (pick ? pick.has(e.id) : !e.labeledAt));
  const labels = await Promise.all(rows.map(async (e) => ({ e, svg: await QRCode.toString(`${appUrl()}/equipment/${e.id}${e.checkDaily || e.checkMonthly ? "/check" : ""}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) })));
  const cycle = (e: { checkDaily: boolean; checkMonthly: boolean }) => [e.checkDaily && "매일", e.checkMonthly && "매월"].filter(Boolean).join("·") || "점검 없음";
  return (
    <>
      <div className="print:hidden">
        <PageTitle
          help="equip.labels"
          sub={`${labels.length}장. 라벨 용지(가로 8cm)에 인쇄해 설비 앞면에 붙이고 '모두 붙였음'을 누릅니다. 관리자가 바뀌면 다시 인쇄합니다.`}
          actions={
            <div className="flex items-center gap-3">
              <PrintButton />
              <Link href="/equipment" className="text-sm text-[var(--accent)]">
                ← 설비 대장
              </Link>
            </div>
          }
        >
          설비 라벨
        </PageTitle>
        <ErrorBox message={q.error} />
      </div>
      {labels.length ? (
        <>
          <div className="flex flex-wrap gap-2">
            {labels.map(({ e, svg }) => (
              <div key={e.id} className="flex w-[8cm] items-center gap-2 border-2 border-black bg-white p-2 text-black" style={{ breakInside: "avoid" }}>
                <div className="size-[2.4cm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="min-w-0 text-xs leading-tight">
                  <p className="font-mono text-base font-bold">
                    {e.no} <span className="rounded border border-black px-1 text-[10px]">{e.grade}등급</span>
                  </p>
                  <p className="truncate font-semibold">{e.name}</p>
                  <p>
                    정 {nm(e.ownerId)} · 부 {nm(e.subManagerId)}
                  </p>
                  <p>점검 {cycle(e)}</p>
                  <p className="text-[10px]">QR: 점검·고장 신고 · {shop.name || "정비소"}</p>
                </div>
              </div>
            ))}
          </div>
          {can(user, "equip.manage") && (
            <AssistForm id="eq-labeled" action={equipmentLabeledAction} guard={false} className="mt-4 print:hidden">
              {labels.map(({ e }) => (
                <input key={e.id} type="hidden" name="ids" value={e.id} />
              ))}
              <SubmitButton variant="secondary">모두 붙였음</SubmitButton>
            </AssistForm>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">인쇄할 라벨이 없습니다(라벨 안 붙인 설비가 없음).</p>
      )}
    </>
  );
}
