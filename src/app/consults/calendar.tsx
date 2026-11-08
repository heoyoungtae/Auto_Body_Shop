// 날짜별 입고 예약 수와 한도(정책값 '일별 입고 한도'). 찬 날은 빨갛게.
import Link from "next/link";

export function Calendar({ days, today }: { days: { date: string; count: number; cap: number; full: boolean; closed: string | null }[]; today: string }) {
  return (
    <>
      <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-4 lg:grid-cols-7 xl:grid-cols-2">
        {days.map((d) => {
          const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
          return (
            <li key={d.date}>
              <Link
                href={`/consults?f=reservations&d=${d.date}`}
                title={d.closed ? `쉬는 날: ${d.closed}` : undefined}
                className={`flex ${d.closed ? "opacity-50" : ""} items-center justify-between rounded-md border px-2.5 py-1.5 hover:bg-[var(--surface-2)] ${d.full ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--line)]"} ${wd === 0 ? "text-[var(--danger)]" : wd === 6 ? "text-[var(--accent)]" : ""}`}
              >
                <span>
                  {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8))}({"일월화수목금토"[wd]}){d.date === today && <b className="ml-1 text-[var(--accent)]">오늘</b>}
                  {d.closed && <span className="ml-1 text-xs">휴무</span>}
                </span>
                <span className="font-semibold tabular-nums">
                  {d.count}
                  {d.cap > 0 && <span className="font-normal text-[var(--muted)]">/{d.cap}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-[var(--muted)]">{days[0]?.cap ? `숫자는 예약 수/한도. 빨간 날은 한도에 찼습니다.` : "일별 입고 한도가 0(미정)이라 경고 없이 받습니다. 설정 › 정책값에서 정합니다."} 흐린 날은 쉬는 날(설정 › 영업일·휴무일)이라 예약할 수 없습니다.</p>
    </>
  );
}
