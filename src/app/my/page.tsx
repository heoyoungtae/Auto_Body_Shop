// 내 차 수첩 홈: 할 일(견적 승인), 수리 중인 차(단계·출고 예정), 다가오는 일(검사·보증·소모품·보험), 내 차, 남은 보증. 값은 모두 정비소 전표에서 불러온다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myHome, shopCard } from "@/modules/carbook/service";
import { myUpcoming } from "@/modules/carbook/records";
import { daysLeft } from "@/modules/carbook/rules";
import { seoulDate } from "@/modules/platform/time";
import { Card, Empty, PageTitle } from "../_ui";
import { requireMy } from "./_session";
import { LinkOnlyNote, MySteps, ShopFooter } from "./_parts";
import { vapidKeys } from "@/modules/carbook/push";
import { MyPushAsk } from "./push-ask";
import { carbookNotices, noticeTitle } from "@/modules/site/content";

export default async function MyHome() {
  const s = await requireMy();
  const db = await getDb();
  const today = seoulDate();
  const [h, shop, up, vapid, news] = await Promise.all([myHome(db, s), shopCard(db), myUpcoming(db, s), vapidKeys(db), carbookNotices(db, s.customerId, today)]);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.home" sub={`${s.name.slice(0, 1)}${"*".repeat(Math.max(1, s.name.length - 1))} 고객님 · ${shop.name}`}>
        내 차 수첩
      </PageTitle>
      {shop.notice && <p className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm">{shop.notice}</p>}
      {s.scope === "link" && <LinkOnlyNote />}
      {/* 홈 화면 앱으로 처음 열면 알림 받기를 묻는다(문자 인증으로 들어온 경우만 켤 수 있음) */}
      {s.scope === "full" && <MyPushAsk vapid={vapid.publicKey} />}
      {news.length > 0 && (
        <Card title="정비소 소식" help={{ kind: "panel", id: "my.news" }}>
          <ul className="space-y-1.5 text-sm">
            {news.map((n) => (
              <li key={n.id}>
                <Link href={`/notice/${n.id}`} className="flex gap-2 hover:underline">
                  <span className="min-w-0 flex-1 truncate">{noticeTitle(n)}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{n.startsOn.slice(5).replace("-", ".")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {h.todos.length > 0 && (
        <Card title={`할 일 ${h.todos.length}`} help={{ kind: "panel", id: "my.todo" }}>
          <ul className="space-y-2">
            {h.todos.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="flex items-center justify-between gap-2 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-3 py-3">
                  <span>
                    <span className="block font-semibold">{t.label}</span>
                    <span className="block text-xs text-[var(--muted)]">{t.sub}</span>
                  </span>
                  <span aria-hidden className="text-[var(--accent)]">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {h.active.length > 0 && (
        <Card title="수리 중" help={{ kind: "panel", id: "my.active" }}>
          <ul className="space-y-3">
            {h.active.map((r) => (
              <li key={r.id}>
                <Link href={`/my/repairs/${r.id}`} className="block rounded-md border border-[var(--line)] p-3 hover:bg-[var(--surface-2)]">
                  <p className="font-semibold">
                    {r.plateNo} <span className="font-normal text-[var(--muted)]">{r.car}</span>
                  </p>
                  <p className="text-sm">{r.statusLabel}</p>
                  <MySteps steps={r.steps} />
                  {r.dueDate && r.status !== "ready" && <p className="text-xs text-[var(--muted)]">출고 예정 {r.dueDate}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.scope === "full" &&
        (up.consent ? (
          <Card title="다가오는 일" help={{ kind: "panel", id: "my.upcoming" }}>
            {up.list.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                60일 안에는 없습니다.
                {up.next && ` 다음은 ${up.next.plateNo} ${up.next.title}(${up.next.date})입니다.`}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {up.list.map((u) => (
                  <li key={u.key}>
                    <Link href={u.href} className="flex items-center justify-between gap-2 py-2 hover:underline">
                      <span>
                        <span className="font-medium">
                          {u.plateNo} {u.title}
                        </span>
                        <span className="block text-xs text-[var(--muted)]">{u.line.replace(`${u.plateNo} `, "")}</span>
                      </span>
                      <span className={`shrink-0 text-xs ${u.left <= 14 ? "font-semibold text-[var(--warn)]" : "text-[var(--muted)]"}`}>{u.left < 0 ? `${-u.left}일 지남` : u.left === 0 ? "오늘" : `${u.left}일 뒤`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Link href="/my/log" className="block rounded-md border border-dashed border-[var(--line-strong)] px-3 py-3 text-sm hover:bg-[var(--surface-2)]">
            <span className="font-semibold">내 기록 시작하기</span>
            <span className="block text-xs text-[var(--muted)]">주유·소모품·비용을 적고 정기검사·보증·소모품·보험 만기 알림을 받으세요</span>
          </Link>
        ))}

      {s.scope === "full" && h.cars.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/my/consult" className="block rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm hover:bg-[var(--surface-2)]">
            <span className="font-semibold">사진으로 상담 요청</span>
            <span className="block text-xs text-[var(--muted)]">다친 곳을 찍어 보내면 정비소가 연락드립니다</span>
          </Link>
          <Link href="/my/cert" className="block rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm hover:bg-[var(--surface-2)]">
            <span className="font-semibold">수리 이력 확인서</span>
            <span className="block text-xs text-[var(--muted)]">차 팔 때 보여 줄 수리 내역 한 장</span>
          </Link>
        </div>
      )}

      {s.scope === "full" && (
        <Card title="내 차" help={{ kind: "panel", id: "my.cars" }}>
          {h.cars.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {h.cars.map((c) => (
                <li key={c.id} className="py-2">
                  <p className="font-semibold">
                    {c.plateNo} <span className="font-normal text-[var(--muted)]">{[c.name, c.year ? `${c.year}년식` : ""].filter(Boolean).join(" · ")}</span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {c.mileage != null ? `주행거리 ${c.mileage.toLocaleString("ko-KR")}km(${c.mileageOn ?? ""} 정비소 확인)` : "주행거리 기록 없음"} · 우리 정비소 방문 {c.visits}번
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>등록된 차가 없습니다. 정비소에 처음 오시면 차가 등록됩니다.</Empty>
          )}
        </Card>
      )}

      {h.warranties.length > 0 && (
        <Card title="보증 중" help={{ kind: "panel", id: "my.warranty" }}>
          <ul className="space-y-1 text-sm">
            {h.warranties.map((w) => (
              <li key={`${w.roId}-${w.kind}`}>
                <Link href={`/my/repairs/${w.roId}`} className="block py-0.5 hover:underline">
                  <span className="font-medium">
                    {w.plateNo} {w.kind}
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    {w.until}까지(남은 {daysLeft(w.until, today)}일)
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!h.total && <Empty action={<Link href="/my/more" className="text-[var(--accent)] underline">정비소 연락처 보기</Link>}>아직 수리 기록이 없습니다. 수리를 맡기시면 여기에 진행 상황이 나옵니다.</Empty>}
      <ShopFooter shop={shop} />
    </div>
  );
}
