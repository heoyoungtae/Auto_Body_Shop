// 홈페이지 › 내 차 수첩 사용설명서: 들어가기부터 홈 화면 추가·수리 진행·견적 승인·사진 상담·서류·보증 신청·내 기록·이력 확인서·더보기까지.
// 휴대폰 화면 그림은 실제 화면을 줄여 그린 것(글자·숫자는 예시). 기능이 바뀌면 이 화면과 도움말(my.*)을 함께 고친다.
// 장 제목·설명·따라 하기·알아 두세요·자주 묻는 질문은 modules/site/carbook-guide-text.ts(처음 문구) + 설정 › 홈페이지 › 화면 글에서 고친 것.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { siteBtn, siteData, SiteTitle, viewPages } from "../_parts";
import { Bar, Box, Btn, Phone, PhoneEstimate, PhoneProgress, PhoneWarranty } from "../_phone";

export const metadata: Metadata = {
  title: "내 차 수첩 사용설명서",
  description: "아이디 없이 문자 인증으로 들어가 수리 진행·견적 승인·서류·보증 신청·내 기록을 쓰는 방법",
};

type Chapter = {
  id: string;
  en: string;
  t: string;
  lead: string;
  steps: string[];
  tips?: string[];
  phone: ReactNode;
};

export default async function CarbookGuidePage() {
  const db = await getDb();
  const [{ shop }, v, p] = await Promise.all([siteData(), viewPages(), loadPolicy(db)]);
  const CH: Chapter[] = [
    {
      id: "login",
      en: "SIGN IN",
      t: v.t("carbook.login.title"),
      lead: v.t("carbook.login.lead"),
      steps: v.lines("carbook.login.steps"),
      tips: v.lines("carbook.login.tips"),
      phone: (
        <Phone title="내 차 수첩 들어가기">
          <p className="text-[var(--muted)]">휴대폰 번호</p>
          <Box>010-1234-5678</Box>
          <Btn>인증번호 받기</Btn>
          <p className="pt-1 text-[var(--muted)]">문자로 받은 숫자 6자리</p>
          <div className="grid grid-cols-6 gap-1">
            {[4, 8, 1, 5, 9, 2].map((n, i) => (
              <div key={i} className="rounded-md border border-[var(--line-strong)] py-1.5 text-center font-bold">
                {n}
              </div>
            ))}
          </div>
          <Btn red>들어가기</Btn>
        </Phone>
      ),
    },
    {
      id: "install",
      en: "HOME SCREEN",
      t: v.t("carbook.install.title"),
      lead: v.t("carbook.install.lead"),
      steps: v.lines("carbook.install.steps"),
      tips: v.lines("carbook.install.tips"),
      phone: (
        <Phone title="내 차 수첩">
          <Box tone="paper">
            <p className="font-semibold">홈 화면에 추가할까요?</p>
            <p className="mt-1 text-[var(--muted)]">앱처럼 바로 열리고 알림을 받을 수 있습니다.</p>
          </Box>
          <Btn>설치</Btn>
          <Box>
            <p className="font-semibold">🔔 알림 받기</p>
            <p className="mt-1 text-[var(--muted)]">수리 진행·보증 소식을 알려 드립니다.</p>
          </Box>
          <Bar w="70%" />
          <Bar w="50%" />
        </Phone>
      ),
    },
    {
      id: "progress",
      en: "PROGRESS",
      t: v.t("carbook.progress.title"),
      lead: v.t("carbook.progress.lead"),
      steps: v.lines("carbook.progress.steps"),
      tips: v.lines("carbook.progress.tips"),
      phone: <PhoneProgress />,
    },
    {
      id: "estimate",
      en: "APPROVE",
      t: v.t("carbook.estimate.title"),
      lead: v.t("carbook.estimate.lead"),
      steps: v.lines("carbook.estimate.steps"),
      tips: v.lines("carbook.estimate.tips"),
      phone: <PhoneEstimate />,
    },
    {
      id: "consult",
      en: "PHOTO CONSULT",
      t: v.t("carbook.consult.title"),
      lead: v.t("carbook.consult.lead"),
      steps: v.lines("carbook.consult.steps"),
      tips: v.lines("carbook.consult.tips"),
      phone: (
        <Phone title="사진으로 상담 요청">
          <Box>
            <svg viewBox="0 0 120 44" className="w-full">
              <rect x="8" y="14" width="104" height="18" rx="6" fill="none" stroke="currentColor" strokeOpacity=".35" />
              <path d="M28 14 38 4h40l12 10" fill="none" stroke="currentColor" strokeOpacity=".35" />
              <circle cx="22" cy="22" r="5" fill="#c8102e" />
              <text x="22" y="24.5" textAnchor="middle" fontSize="6" fill="#fff" fontWeight="700">
                1
              </text>
            </svg>
          </Box>
          <p>① 앞 범퍼 왼쪽 · 긁힘</p>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`aspect-square rounded-md ${i < 2 ? "bg-[var(--steel)]/40" : "border border-dashed border-[var(--line-strong)]"}`} />
            ))}
          </div>
          <Btn red>보내기</Btn>
        </Phone>
      ),
    },
    {
      id: "docs",
      en: "DOCUMENTS",
      t: v.t("carbook.docs.title"),
      lead: v.t("carbook.docs.lead"),
      steps: v.lines("carbook.docs.steps"),
      tips: v.lines("carbook.docs.tips"),
      phone: (
        <Phone title="서류">
          {["정비명세서 · 11.28", "견적서 · 11.21", "정비명세서 · 2026.06.03"].map((t, i) => (
            <Box key={t}>
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded bg-[var(--paper)] text-[9px] font-bold text-[var(--red)]">{i === 1 ? "견" : "명"}</span>
                <span className="flex-1">{t}</span>
                <span className="text-[var(--muted)]">›</span>
              </div>
            </Box>
          ))}
          <Btn>인쇄·PDF 저장</Btn>
        </Phone>
      ),
    },
    {
      id: "warranty",
      en: "WARRANTY",
      t: v.t("carbook.warranty.title"),
      lead: v.t("carbook.warranty.lead"),
      steps: v.lines("carbook.warranty.steps"),
      tips: v.lines("carbook.warranty.tips"),
      phone: <PhoneWarranty months={p["warranty.paint_months"]} />,
    },
    {
      id: "log",
      en: "MY LOG",
      t: v.t("carbook.log.title"),
      lead: v.t("carbook.log.lead"),
      steps: v.lines("carbook.log.steps"),
      tips: v.lines("carbook.log.tips"),
      phone: (
        <Phone title="내 기록">
          <div className="grid grid-cols-2 gap-1.5">
            <Box tone="paper">
              <p className="text-[var(--muted)]">이번 달</p>
              <p className="text-[14px] font-bold">186,400원</p>
            </Box>
            <Box tone="paper">
              <p className="text-[var(--muted)]">평균 연비</p>
              <p className="text-[14px] font-bold">12.8km/L</p>
            </Box>
          </div>
          {["⛽ 주유 · 62,000원", "🔧 엔진오일 · 다음 교체 7,000km 뒤", "🧽 세차 · 15,000원"].map((t) => (
            <Box key={t}>{t}</Box>
          ))}
          <Btn>적기</Btn>
        </Phone>
      ),
    },
    {
      id: "cert",
      en: "HISTORY",
      t: v.t("carbook.cert.title"),
      lead: v.t("carbook.cert.lead"),
      steps: v.lines("carbook.cert.steps"),
      tips: v.lines("carbook.cert.tips"),
      phone: (
        <Phone title="수리 이력 확인서">
          <Box>
            <p className="text-center font-bold">수리 이력 확인서</p>
            <div className="mt-2 space-y-1.5">
              <Bar w="90%" />
              <Bar w="75%" />
              <Bar w="85%" />
            </div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-[9px] text-[var(--muted)]">확인 번호 7K2M-Q9XA-3F</span>
              <div className="grid size-8 grid-cols-3 gap-px bg-[var(--fg)] p-px">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={[0, 2, 4, 6, 8].includes(i) ? "bg-[var(--fg)]" : "bg-[var(--surface)]"} />
                ))}
              </div>
            </div>
          </Box>
          <Btn>인쇄·PDF 저장</Btn>
        </Phone>
      ),
    },
  ];
  const FAQ = v.pairs("carbook.faq").map((x) => ({ q: x.t, a: x.d }));
  return (
    <div className="space-y-20">
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <SiteTitle eyebrow="MY CAR BOOK" help="site.carbookGuide" sub={v.t("carbook.sub")}>
            내 차 수첩 사용설명서
          </SiteTitle>
          <div className="-mt-4 flex flex-wrap gap-3">
            <Link href="/my" className={siteBtn("red")}>
              내 차 수첩 열기
            </Link>
            {shop.phone && (
              <a href={`tel:${shop.tel}`} className={siteBtn("line")}>
                모르면 전화 {shop.phone}
              </a>
            )}
          </div>
        </div>
        <nav aria-label="차례" className="rounded-2xl bg-[var(--paper)] p-6">
          <p className="eyebrow mb-3">CONTENTS</p>
          <ol className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
            {CH.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="flex gap-3 hover:text-[var(--red)]">
                  <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-[var(--red)]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{c.t.split(":")[0]}</span>
                </a>
              </li>
            ))}
            <li>
              <a href="#faq" className="flex gap-3 hover:text-[var(--red)]">
                <span className="w-5 shrink-0 text-sm font-semibold text-[var(--red)]">Q</span>
                <span>자주 묻는 질문</span>
              </a>
            </li>
          </ol>
        </nav>
      </div>

      {CH.map((c, i) => (
        <section key={c.id} id={c.id} aria-labelledby={`${c.id}-t`} className="scroll-mt-28 border-t border-[var(--line)] pt-14">
          <div className={`flex flex-col gap-10 md:flex-row md:items-center ${i % 2 ? "md:flex-row-reverse" : ""}`}>
            <div className="flex-1">
              <p className="eyebrow mb-2">
                <span className="text-[var(--red)]">{String(i + 1).padStart(2, "0")}</span> · {c.en}
              </p>
              <h2 id={`${c.id}-t`} className="text-2xl font-bold leading-snug sm:text-[1.9rem]">
                {c.t}
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-[var(--muted)]">{c.lead}</p>
              <ol className="mt-6 space-y-3">
                {c.steps.map((s, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-sm font-bold text-white dark:bg-white dark:text-[var(--ink)]">{j + 1}</span>
                    <span className="pt-0.5 leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
              {c.tips && (
                <ul className="mt-6 space-y-1.5 rounded-xl border border-[var(--line)] p-4 text-[15px] text-[var(--muted)]">
                  {c.tips.map((t, j) => (
                    <li key={j} className="flex gap-2">
                      <span aria-hidden className="text-[var(--red)]">
                        ·
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {c.phone}
          </div>
        </section>
      ))}

      <section id="faq" aria-labelledby="faq-t" className="scroll-mt-28 border-t border-[var(--line)] pt-14">
        <p className="eyebrow mb-2">FAQ</p>
        <h2 id="faq-t" className="mb-6 text-2xl font-bold">
          자주 묻는 질문
        </h2>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {FAQ.map((f, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{f.q}</span>
                <span aria-hidden className="mt-1 text-xl leading-none text-[var(--steel)] transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl leading-relaxed text-[var(--muted)]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
