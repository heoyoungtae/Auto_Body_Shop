// 홈페이지 휴대폰 화면 그림: 내 차 수첩 화면을 줄여 그린 것(글자·숫자는 예시). 홈 '내 차 수첩' 단락과 사용설명서에서 쓴다.
import type { ReactNode } from "react";

/** 휴대폰 틀 안의 줄인 화면 */
export function Phone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="mx-auto min-h-[430px] w-[220px] shrink-0 rounded-[2.2rem] border-[7px] border-[#23272e] bg-[var(--surface)] shadow-[0_24px_50px_rgb(13_15_19_/_0.25)] ring-1 ring-white/15"
    >
      <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-[var(--line-strong)]" />
      <div className="px-3.5 pb-5 pt-3 text-[11px] leading-snug">
        <p className="mb-3 text-[13px] font-bold">{title}</p>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}
export const Bar = ({ w = "100%", tone = "line" }: { w?: string; tone?: "line" | "red" | "ink" | "ok" }) => (
  <div
    className={`h-2 rounded-full ${tone === "red" ? "bg-[var(--red)]" : tone === "ink" ? "bg-[var(--ink)] dark:bg-white" : tone === "ok" ? "bg-[#0f9d58]" : "bg-[var(--line)]"}`}
    style={{ width: w }}
  />
);
export const Box = ({ children, tone = "line" }: { children: ReactNode; tone?: "line" | "paper" }) => (
  <div className={`rounded-lg p-2.5 ${tone === "paper" ? "bg-[var(--paper)]" : "border border-[var(--line)]"}`}>{children}</div>
);
export const Btn = ({ children, red }: { children: ReactNode; red?: boolean }) => (
  <div className={`rounded-full py-2 text-center text-[11px] font-semibold ${red ? "bg-[var(--red)] text-white" : "bg-[var(--ink)] text-white dark:bg-white dark:text-[var(--ink)]"}`}>{children}</div>
);

export function PhoneProgress() {
  return (
    <Phone title="수리 한 건">
      <div className="flex items-center gap-1">
        {["접수", "진단", "견적", "작업", "검사", "출고"].map((s, i) => (
          <div key={s} className="flex-1 text-center">
            <div className={`mx-auto mb-1 size-3 rounded-full ${i < 3 ? "bg-[var(--ink)] dark:bg-white" : i === 3 ? "bg-[var(--red)]" : "bg-[var(--line)]"}`} />
            <span className={`text-[9px] ${i === 3 ? "font-bold text-[var(--red)]" : "text-[var(--muted)]"}`}>{s}</span>
          </div>
        ))}
      </div>
      <Box>
        <svg viewBox="0 0 120 50" className="w-full">
          <rect x="10" y="18" width="100" height="18" rx="6" fill="none" stroke="currentColor" strokeOpacity=".35" />
          <path d="M28 18 38 8h40l12 10" fill="none" stroke="currentColor" strokeOpacity=".35" />
          <rect x="14" y="20" width="22" height="14" rx="3" fill="#0f9d58" fillOpacity=".7" />
          <rect x="40" y="20" width="24" height="14" rx="3" fill="#e69f00" fillOpacity=".8" />
          <rect x="68" y="20" width="24" height="14" rx="3" fill="currentColor" fillOpacity=".12" />
          <circle cx="30" cy="38" r="6" fill="currentColor" fillOpacity=".5" />
          <circle cx="90" cy="38" r="6" fill="currentColor" fillOpacity=".5" />
        </svg>
      </Box>
      <p className="text-[var(--muted)]">출고 예정 11월 28일(금)</p>
      <Bar w="80%" />
    </Phone>
  );
}

export function PhoneEstimate() {
  return (
    <Phone title="견적 승인">
      {[
        ["앞 범퍼 긁힘 · 부분 도색", true],
        ["앞 펜더 찌그러짐 · 판금", true],
        ["사이드미러 교환", false],
      ].map(([t, on]) => (
        <Box key={String(t)}>
          <div className="flex items-center gap-2">
            <span className={`grid size-4 place-items-center rounded border text-[9px] ${on ? "border-[var(--red)] bg-[var(--red)] text-white" : "border-[var(--line-strong)]"}`}>{on ? "✓" : ""}</span>
            <span className="flex-1">{t}</span>
          </div>
        </Box>
      ))}
      <div className="rounded-lg border border-dashed border-[var(--line-strong)] p-2 text-center italic text-[var(--muted)]">서명</div>
      <Btn red>보내기</Btn>
    </Phone>
  );
}

export function PhoneWarranty({ months }: { months: number }) {
  return (
    <Phone title="보증 신청">
      <Box tone="paper">
        <p className="font-semibold">앞 범퍼 부분 도색</p>
        <p className="mt-0.5 text-[#0f9d58]">보증 중 · {months}개월</p>
      </Box>
      <p className="text-[var(--muted)]">어디가 어떻게 이상한가요?</p>
      <Box>칠한 곳 가장자리에 작은 기포가 생겼어요</Box>
      <div className="grid grid-cols-3 gap-1">
        <div className="aspect-square rounded-md bg-[var(--steel)]/40" />
        <div className="aspect-square rounded-md border border-dashed border-[var(--line-strong)]" />
      </div>
      <Btn red>보내기</Btn>
    </Phone>
  );
}
