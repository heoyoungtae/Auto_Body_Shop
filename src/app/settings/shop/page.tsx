import { can } from "@/modules/auth/permissions";
import { getDb } from "@/db/runtime";
import { loadShopInfo, shopAddressLine, shopMissing } from "@/modules/platform/shop";
import { hasManyBranches } from "@/modules/platform/branch";
import { AssistForm } from "../../_assist";
import { AddressField, DateField, TextField } from "../../_input";
import { canOpenRegFile, loadBizReg, REG_KINDS } from "@/modules/platform/biz-reg";
import { formFromBizNo } from "@/modules/money/tax-rules";
import { NtsLine, RegFields, RegFileCard, RegMoreFields } from "./reg-card";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { NeedImageNote, StampImageInput } from "../../stamp-image";
import { saveSealAction, saveShopAction } from "./actions";
import { TaxCard } from "./tax-card";
import { taxOverview } from "@/modules/money/tax-profile";
import { seoulDate } from "@/modules/platform/time";

export default async function ShopSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = can(user, "settings.edit");
  const db = await getDb();
  const shop = await loadShopInfo(db);
  const tax = await taxOverview(db, user, seoulDate());
  const missing = shopMissing(shop);
  const reg = await loadBizReg(db);
  const kindGuess = !reg.kind && formFromBizNo(shop.bizNo) === "corporate" ? "corporate" : "";
  return (
    <>
      <PageTitle help="settings.shop" sub="사업자등록증을 올리고 적힌 대로 한 번만 넣으면 견적서·정비명세서와 세금 설정에 그대로 쓰입니다.">
        사업장 정보
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        {missing.length > 0 && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 빈 칸: {missing.join(", ")}. 비어 있으면 견적서를 고객에게 낼 수 없습니다(서식의 필수 칸).</p>}
      </div>
      <RegFileCard reg={reg} owner={owner} canOpen={canOpenRegFile(user)} />
      <div id="reg" className="mt-4">
      <Card title="등록증 내용 · 정비사업자" help={{ kind: "panel", id: "shop.info" }}>
        {reg.nts && <NtsLine nts={reg.nts} />}
        {owner ? (
          <AssistForm id="shop-info" action={saveShopAction} className="space-y-4">
            <RegFields reg={reg} kindGuess={kindGuess} corpRegNo={tax.p.corpRegNo} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TextField help="shop.name" name="name" required defaultValue={shop.name} />
              <TextField help="shop.ceo" name="ceo" defaultValue={shop.ceo} />
              <TextField help="shop.bizNo" name="bizNo" inputMode="numeric" defaultValue={shop.bizNo} />
              <DateField help="tax.openedOn" name="openedOn" defaultValue={tax.p.openedOn} quick={[]} />
            </div>
            <AddressField help={{ zip: "shop.zip", address: "shop.address", detail: "shop.addressDetail" }} defaults={{ zip: shop.zip, address: shop.address, detail: shop.addressDetail }} />
            <RegMoreFields reg={reg} />
            <p className="text-sm font-medium">정비소</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TextField help="shop.phone" name="phone" inputMode="tel" defaultValue={shop.phone} />
              <TextField help="shop.repairRegNo" name="repairRegNo" defaultValue={shop.repairRegNo} />
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>저장</SubmitButton>
              <SubmitButton variant="secondary" name="intent" value="nts">저장하고 국세청에서 확인</SubmitButton>
            </div>
          </AssistForm>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["등록증 종류", reg.kind ? REG_KINDS[reg.kind] : ""],
              ["상호", shop.name],
              ["대표자", shop.ceo],
              ["사업자등록번호", shop.bizNo],
              ["개업일", tax.p.openedOn],
              ...(reg.kind === "corporate" ? [["법인등록번호", tax.p.corpRegNo], ["본점 주소", reg.hqAddress]] : []),
              ["사업장 주소", shopAddressLine(shop)],
              ["업태 · 종목", [reg.bizType, reg.bizItem].filter(Boolean).join(" · ")],
              ["전자세금계산서 메일", reg.invoiceEmail],
              ["관할 세무서", reg.taxOffice],
              ["정비업 등록번호", shop.repairRegNo],
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
      </div>
      <TaxCard o={tax} owner={owner} many={await hasManyBranches(db)} />
      <div className="mt-4">
        <Card title="직인" help={{ kind: "panel", id: "shop.seal" }}>
          <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
            <div>
              <p className="mb-1 text-sm font-medium">지금 등록된 직인</p>
              <div className="grid h-36 place-items-center rounded-md border border-[var(--line)] bg-white">
                {shop.sealPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${shop.sealPath}`} alt="등록된 직인" className="max-h-32 max-w-[12rem] object-contain" />
                ) : (
                  <span className="text-sm text-[var(--muted)]">아직 없음</span>
                )}
              </div>
              {owner && shop.sealPath && (
                <form action={saveSealAction} className="mt-2">
                  <input type="hidden" name="intent" value="clear" />
                  <SubmitButton variant="secondary">직인 지우기</SubmitButton>
                </form>
              )}
            </div>
            {owner ? (
              <AssistForm id="shop-seal" action={saveSealAction} guard={false} className="space-y-3">
                <p className="text-sm">
                  흰 종이에 직인(법인인감·사업자 도장)을 또렷하게 찍어 사진을 찍거나 스캔해 올립니다. 흰 바탕은 저절로 지우고 도장 부분만 잘라, 견적서·정비명세서의 &lsquo;대표이사 (서명 또는 인)&rsquo;·&lsquo;업체명 및 대표자 (서명 또는 인)&rsquo; 칸에 겹쳐 찍습니다.
                </p>
                <StampImageInput name="seal" label="직인 그림 고르기" hint="PNG·JPG. 도장이 화면 가운데 크게 나오게 찍으면 좋습니다." />
                <NeedImageNote fields={["seal"]} msg="직인 그림을 골라야 저장됩니다." />
                <SubmitButton>{shop.sealPath ? "직인 바꾸기" : "직인 등록"}</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">직인 등록·바꾸기는 대표만 할 수 있습니다.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
