import { getDb } from "@/db/runtime";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveShopAction } from "./actions";

export default async function ShopSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const shop = await loadShopInfo(await getDb());
  const missing = shopMissing(shop);
  return (
    <>
      <PageTitle help="settings.shop" sub="법정 견적서(별지 제89호의3)·정비명세서의 '정비사업자' 칸에 그대로 찍힙니다. 한 번만 넣으면 됩니다.">
        사업장 정보
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        {missing.length > 0 && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 빈 칸: {missing.join(", ")}. 비어 있으면 견적서를 고객에게 낼 수 없습니다(서식의 필수 칸).</p>}
      </div>
      <Card title="정비사업자" help={{ kind: "panel", id: "shop.info" }}>
        {owner ? (
          <AssistForm id="shop-info" action={saveShopAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TextField help="shop.name" name="name" required defaultValue={shop.name} />
              <TextField help="shop.ceo" name="ceo" defaultValue={shop.ceo} />
              <TextField help="shop.phone" name="phone" inputMode="tel" defaultValue={shop.phone} />
              <TextField help="shop.bizNo" name="bizNo" inputMode="numeric" defaultValue={shop.bizNo} />
              <TextField help="shop.repairRegNo" name="repairRegNo" defaultValue={shop.repairRegNo} />
            </div>
            <TextField help="shop.address" name="address" defaultValue={shop.address} />
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["업체명", shop.name],
              ["대표자", shop.ceo],
              ["사업자등록번호", shop.bizNo],
              ["정비업 등록번호", shop.repairRegNo],
              ["주소", shop.address],
              ["전화번호", shop.phone],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr]">
                <dt className="text-[var(--muted)]">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </>
  );
}
