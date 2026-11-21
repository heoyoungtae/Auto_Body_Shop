// 더보기: 정비소 안내(전화·주소·영업시간), 알림 켜기·끄기와 보험 만기일, 차를 팔았을 때 알리기, 내 기록 동의 철회·그만 쓰기, 나가기
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myHome, shopCard } from "@/modules/carbook/service";
import { consentState, myPrefs } from "@/modules/carbook/records";
import { ALERTS, type AlertKind } from "@/modules/carbook/rules";
import { CheckGroup, DateField } from "../../_input";
import { AssistForm } from "../../_assist";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { consentAction, leaveAction, logoutAction, markSoldAction, savePrefsAction } from "../actions";
import { requireMy } from "../_session";
import { KakaoHint } from "./kakao-hint";
import { AppCard } from "./app-card";
import { vapidKeys } from "@/modules/carbook/push";

export default async function MyMorePage({ searchParams }: { searchParams: Promise<{ error?: string; sold?: string; prefs?: string; withdrawn?: string }> }) {
  const q = await searchParams;
  const s = await requireMy();
  const db = await getDb();
  const [shop, h, prefs, consent, vapid] = await Promise.all([shopCard(db), myHome(db, s), myPrefs(db, s), consentState(db, s.customerId), vapidKeys(db)]);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.more" sub={s.phoneMasked ? `${s.phoneMasked}로 들어옴` : undefined}>
        더보기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.prefs && <Notice>알림 설정을 저장했습니다.</Notice>}
      {q.withdrawn && <Notice>내 기록 동의를 철회하고 적으신 기록을 모두 지웠습니다. 수리 이력·서류는 그대로 보실 수 있습니다.</Notice>}
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

      {s.scope === "full" && (
        <Card title="홈 화면에 두기·푸시" help={{ kind: "panel", id: "my.app" }}>
          <AppCard vapid={vapid.publicKey} />
        </Card>
      )}

      {s.scope === "full" && (
        <Card title="알림" help={{ kind: "panel", id: "my.alerts" }}>
          {consent.agreed ? (
            <AssistForm id="my-prefs" action={savePrefsAction} className="space-y-4">
              <CheckGroup help="my.alerts" name="alerts" options={(Object.keys(ALERTS) as AlertKind[]).map((k) => ({ value: k, label: ALERTS[k].label }))} defaultChecked={(Object.keys(ALERTS) as AlertKind[]).filter((k) => prefs.alerts[k])} />
              {prefs.cars.map((c) => (
                <DateField key={c.id} help="my.insuranceUntil" name={`ins_${c.id}`} label={`${c.plateNo} 보험 만기일`} defaultValue={c.insuranceUntil ?? undefined} quick={[]} />
              ))}
              {prefs.cars.some((c) => !c.registeredOn) && <p className="text-xs text-[var(--muted)]">최초 등록일을 모르는 차는 정기검사 알림이 없습니다. 다음 방문 때 자동차등록증을 보여 주시면 정비소가 넣어 드립니다.</p>}
              <SubmitButton full>알림 저장</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm">
              검사·보증·소모품·보험 만기 알림은 &lsquo;내 기록&rsquo; 이용에 동의하시면 켜집니다.{" "}
              <Link href="/my/log" className="text-[var(--accent)] underline">
                내 기록으로
              </Link>
            </p>
          )}
        </Card>
      )}

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

      {s.scope !== "full" && <KakaoHint />}

      {s.scope === "full" && (
        <Card title="내 기록 동의·그만 쓰기" help={{ kind: "panel", id: "my.leave" }}>
          <p className="mb-2 text-sm">{consent.agreed ? `내 기록 이용에 ${consent.at ? consent.at.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : ""} 동의하셨습니다.` : "내 기록 이용에 동의하지 않은 상태입니다."}</p>
          <div className="space-y-2">
            {consent.agreed && (
              <form action={consentAction}>
                <input type="hidden" name="agree" value="no" />
                <SubmitButton variant="secondary" full>
                  동의 철회(내가 적은 기록 모두 지우기)
                </SubmitButton>
              </form>
            )}
            <form action={leaveAction}>
              <SubmitButton variant="danger" full>
                내 차 수첩 그만 쓰기
              </SubmitButton>
            </form>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">그만 쓰면 적으신 기록을 바로 지우고 모든 기기에서 나갑니다. 정비소의 수리 기록·서류는 법정 보관 기간 동안 남고, 다시 문자 인증하면 언제든 볼 수 있습니다.</p>
        </Card>
      )}

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
