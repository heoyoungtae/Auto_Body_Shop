// 더보기: 정비소 안내(전화·주소·영업시간), 차를 팔았을 때 알리기, 나가기
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myHome, shopCard } from "@/modules/carbook/service";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { logoutAction, markSoldAction } from "../actions";
import { requireMy } from "../_session";
import { KakaoHint } from "./kakao-hint";

export default async function MyMorePage({ searchParams }: { searchParams: Promise<{ error?: string; sold?: string }> }) {
  const q = await searchParams;
  const s = await requireMy();
  const db = await getDb();
  const [shop, h] = await Promise.all([shopCard(db), myHome(db, s)]);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.more" sub={s.phoneMasked ? `${s.phoneMasked}로 들어옴` : undefined}>
        더보기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.sold && <Notice>알려 주셔서 감사합니다. 그 차는 내 차 목록에서 뺐고 정비소에도 알렸습니다.</Notice>}

      <Card title="정비소" help={{ kind: "panel", id: "my.shop" }}>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-[var(--muted)]">이름</dt>
          <dd>{shop.name}</dd>
          {shop.phone && (
            <>
              <dt className="text-[var(--muted)]">전화</dt>
              <dd>
                <a href={`tel:${shop.tel}`} className="font-semibold text-[var(--accent)] underline">
                  {shop.phone}
                </a>
              </dd>
            </>
          )}
          {shop.address && (
            <>
              <dt className="text-[var(--muted)]">주소</dt>
              <dd>
                {shop.address}{" "}
                <a href={`https://map.kakao.com/?q=${encodeURIComponent(shop.address)}`} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                  지도
                </a>
              </dd>
            </>
          )}
          {shop.hours && (
            <>
              <dt className="text-[var(--muted)]">영업시간</dt>
              <dd>{shop.hours}</dd>
            </>
          )}
        </dl>
      </Card>

      {s.scope === "full" && h.cars.length > 0 && (
        <Card title="차를 팔았어요" help={{ kind: "panel", id: "my.sold" }}>
          <ul className="space-y-2">
            {h.cars.map((c) => (
              <li key={c.id}>
                <form action={markSoldAction} className="flex items-center justify-between gap-2">
                  <input type="hidden" name="vehicleId" value={c.id} />
                  <span className="text-sm">
                    {c.plateNo} <span className="text-[var(--muted)]">{c.name}</span>
                  </span>
                  <SubmitButton variant="secondary">이 차 팔았어요</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <KakaoHint />

      <div className="space-y-2">
        <form action={logoutAction}>
          <SubmitButton variant="secondary" full>
            이 휴대폰에서 나가기
          </SubmitButton>
        </form>
        {s.scope === "full" && (
          <form action={logoutAction}>
            <input type="hidden" name="all" value="1" />
            <SubmitButton variant="danger" full>
              모든 기기에서 나가기
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="text-center text-xs text-[var(--muted)]">
        개인정보 동의를 바꾸거나 철회하시려면 정비소로 전화해 주세요. 철회하시면 연락처를 지우고 내 차 수첩도 닫힙니다.{" "}
        <Link href="/my" className="underline">
          홈
        </Link>
      </p>
    </div>
  );
}
