// 내 차 수첩 홈: 할 일(견적 승인), 수리 중인 차(단계·출고 예정), 내 차, 남은 보증. 값은 모두 정비소 전표에서 불러온다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myHome, shopCard } from "@/modules/carbook/service";
import { daysLeft } from "@/modules/carbook/rules";
import { seoulDate } from "@/modules/platform/time";
import { Card, Empty, PageTitle } from "../_ui";
import { requireMy } from "./_session";
import { LinkOnlyNote, MySteps, ShopFooter } from "./_parts";

export default async function MyHome() {
  const s = await requireMy();
  const db = await getDb();
  const [h, shop] = await Promise.all([myHome(db, s), shopCard(db)]);
  const today = seoulDate();
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.home" sub={`${s.name.slice(0, 1)}${"*".repeat(Math.max(1, s.name.length - 1))} 고객님 · ${shop.name}`}>
        내 차 수첩
      </PageTitle>
      {shop.notice && <p className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm">{shop.notice}</p>}
      {s.scope === "link" && <LinkOnlyNote />}

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
