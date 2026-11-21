// 홈페이지 › 내 차 수첩 사용설명서: 들어가기부터 홈 화면 추가·수리 진행·견적 승인·사진 상담·서류·보증 신청·내 기록·이력 확인서·더보기까지.
// 휴대폰 화면 그림은 실제 화면을 줄여 그린 것(글자·숫자는 예시). 기능이 바뀌면 이 화면과 도움말(my.*)을 함께 고친다.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { siteBtn, siteData, SiteTitle } from "../_parts";
import {
  Bar,
  Box,
  Btn,
  Phone,
  PhoneEstimate,
  PhoneProgress,
  PhoneWarranty,
} from "../_phone";

export const metadata: Metadata = {
  title: "내 차 수첩 사용설명서",
  description:
    "아이디 없이 문자 인증으로 들어가 수리 진행·견적 승인·서류·보증 신청·내 기록을 쓰는 방법",
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
  const [{ shop }, p] = await Promise.all([siteData(), loadPolicy(db)]);
  const CH: Chapter[] = [
    {
      id: "login",
      en: "SIGN IN",
      t: "들어가기: 아이디 없이 문자 인증",
      lead: "정비소에 등록된 휴대폰 번호로 들어갑니다. 회원가입도 비밀번호도 없습니다.",
      steps: [
        "홈페이지 위 메뉴의 '내 차 수첩'을 누르거나, 정비소가 보낸 알림톡 링크를 누릅니다.",
        "휴대폰 번호를 넣고 '인증번호 받기'를 누릅니다.",
        "문자로 온 숫자 6자리를 넣고 '들어가기'를 누릅니다.",
      ],
      tips: [
        "한 번 들어오면 그 휴대폰에서는 90일 동안 다시 묻지 않습니다.",
        "인증번호는 3분 동안만 쓸 수 있습니다.",
        "문자가 안 오면 정비소에 등록된 번호인지 확인해 주세요.",
      ],
      phone: (
        <Phone title="내 차 수첩 들어가기">
          <p className="text-[var(--muted)]">휴대폰 번호</p>
          <Box>010-1234-5678</Box>
          <Btn>인증번호 받기</Btn>
          <p className="pt-1 text-[var(--muted)]">문자로 받은 숫자 6자리</p>
          <div className="grid grid-cols-6 gap-1">
            {[4, 8, 1, 5, 9, 2].map((n, i) => (
              <div
                key={i}
                className="rounded-md border border-[var(--line-strong)] py-1.5 text-center font-bold"
              >
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
      t: "홈 화면에 추가하고 알림 받기",
      lead: "앱을 내려받지 않아도 홈 화면에 두면 앱처럼 바로 열립니다. 알림을 켜면 수리 진행과 보증 소식이 휴대폰에 뜹니다.",
      steps: [
        "'더보기' › '홈 화면에 두기·푸시'에서 '홈 화면에 추가'를 누릅니다.",
        "아이폰은 사파리 아래 공유 단추(네모에 위 화살표) › '홈 화면에 추가'를 누릅니다.",
        "홈 화면 아이콘으로 처음 열 때 '알림 받기'를 누릅니다. 나중에 '더보기'에서 켜도 됩니다.",
      ],
      tips: [
        "아이폰은 iOS 16.4 이상에서 알림을 받을 수 있습니다.",
        "카카오톡 안에서 열었다면 '…' › '다른 브라우저로 열기'를 먼저 누르세요.",
      ],
      phone: (
        <Phone title="내 차 수첩">
          <Box tone="paper">
            <p className="font-semibold">홈 화면에 추가할까요?</p>
            <p className="mt-1 text-[var(--muted)]">
              앱처럼 바로 열리고 알림을 받을 수 있습니다.
            </p>
          </Box>
          <Btn>설치</Btn>
          <Box>
            <p className="font-semibold">🔔 알림 받기</p>
            <p className="mt-1 text-[var(--muted)]">
              수리 진행·보증 소식을 알려 드립니다.
            </p>
          </Box>
          <Bar w="70%" />
          <Bar w="50%" />
        </Phone>
      ),
    },
    {
      id: "progress",
      en: "PROGRESS",
      t: "수리 진행 보기",
      lead: "맡긴 차가 지금 어느 단계인지, 부위마다 작업이 얼마나 됐는지 실시간으로 봅니다.",
      steps: [
        "홈 맨 위 '수리 중' 카드를 누릅니다.",
        "단계 줄에서 접수 › 진단 › 견적 › 작업 › 검사 › 출고 가운데 지금 단계를 봅니다.",
        "차 그림에서 부위 색으로 진행을 봅니다(회색 작업 전, 주황 작업 중, 초록 끝).",
      ],
      tips: [
        "출고 예정일이 바뀌면 정비소가 연락드립니다.",
        "작업 전·후 사진은 정비소가 고객님께 보여 드리는 것만 나옵니다.",
      ],
      phone: <PhoneProgress />,
    },
    {
      id: "estimate",
      en: "APPROVE",
      t: "견적 보고 승인하기",
      lead: "정비소에 가지 않아도 휴대폰으로 견적을 보고, 맡길 작업만 골라 승인합니다.",
      steps: [
        "알림이 오면 '할 일'의 견적을 누릅니다.",
        "부위마다 작업과 금액을 보고 맡길 작업에 체크합니다.",
        "이름을 적고 손가락으로 서명한 뒤 보내기를 누릅니다.",
      ],
      tips: [
        "승인하신 작업만 수리하고 그 금액만 받습니다.",
        `견적서는 발급일부터 ${p["estimate.valid_days"]}일 동안 유효합니다.`,
      ],
      phone: <PhoneEstimate />,
    },
    {
      id: "consult",
      en: "PHOTO CONSULT",
      t: "사진으로 상담 요청",
      lead: "다친 곳을 차 그림에서 누르고 사진을 붙여 보내면 정비소가 대략 금액과 기간을 알려 드립니다. 이름·전화·차는 다시 적지 않습니다.",
      steps: [
        "홈의 '사진으로 상담'을 누릅니다.",
        "차 그림에서 다친 곳을 누르거나 글로 적습니다.",
        "사진을 붙이고(5장까지) 보내기를 누릅니다.",
      ],
      tips: [
        `정비소가 영업일 ${p["consult.reply_business_days"]}일 안에 답합니다.`,
        "보낸 요청과 답은 같은 화면 아래 목록에서 봅니다.",
      ],
      phone: (
        <Phone title="사진으로 상담 요청">
          <Box>
            <svg viewBox="0 0 120 44" className="w-full">
              <rect
                x="8"
                y="14"
                width="104"
                height="18"
                rx="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity=".35"
              />
              <path
                d="M28 14 38 4h40l12 10"
                fill="none"
                stroke="currentColor"
                strokeOpacity=".35"
              />
              <circle cx="22" cy="22" r="5" fill="#c8102e" />
              <text
                x="22"
                y="24.5"
                textAnchor="middle"
                fontSize="6"
                fill="#fff"
                fontWeight="700"
              >
                1
              </text>
            </svg>
          </Box>
          <p>① 앞 범퍼 왼쪽 · 긁힘</p>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`aspect-square rounded-md ${i < 2 ? "bg-[var(--steel)]/40" : "border border-dashed border-[var(--line-strong)]"}`}
              />
            ))}
          </div>
          <Btn red>보내기</Btn>
        </Phone>
      ),
    },
    {
      id: "docs",
      en: "DOCUMENTS",
      t: "견적서·명세서 다시 보기",
      lead: "종이를 잃어버려도 괜찮습니다. 법정 견적서와 정비명세서가 서류 보관함에 모두 남아 있습니다.",
      steps: [
        "아래 줄의 '서류'를 누릅니다.",
        "보고 싶은 서류를 누릅니다.",
        "필요하면 '인쇄·PDF 저장'을 누릅니다.",
      ],
      tips: [
        "카카오톡 안에서는 인쇄가 안 될 수 있습니다. 크롬·사파리로 열어 주세요.",
      ],
      phone: (
        <Phone title="서류">
          {[
            "정비명세서 · 11.28",
            "견적서 · 11.21",
            "정비명세서 · 2026.06.03",
          ].map((t, i) => (
            <Box key={t}>
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded bg-[var(--paper)] text-[9px] font-bold text-[var(--red)]">
                  {i === 1 ? "견" : "명"}
                </span>
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
      t: "보증 신청",
      lead: "고친 곳에 이상이 생기면 사진과 한 줄만 적어 보내세요. 어느 수리인지는 저절로 이어집니다.",
      steps: [
        "수리 이력에서 그 수리를 누릅니다.",
        "'보증 신청'을 누르고 어디가 어떻게 이상한지 적습니다.",
        "사진을 붙여(5장까지) 보냅니다.",
      ],
      tips: [
        `도장·판금 ${p["warranty.paint_months"]}개월, 덴트 ${p["warranty.dent_months"]}개월, 광택 ${p["warranty.polish_months"]}개월 보증입니다.`,
        "기간이 지났어도 보낼 수 있습니다. 판정은 차를 보고 합니다.",
      ],
      phone: <PhoneWarranty months={p["warranty.paint_months"]} />,
    },
    {
      id: "log",
      en: "MY LOG",
      t: "내 기록: 주유·소모품·비용",
      lead: "주유, 소모품 교체, 세차, 보험·세금 같은 비용을 적어 두면 연비와 한 달 비용, 다음 교체 때를 알려 줍니다.",
      steps: [
        "아래 줄의 '내 기록'에서 처음 한 번 이용에 동의합니다.",
        "'적기'에서 종류를 고르고 금액을 넣습니다. 날짜·주행거리는 미리 채워집니다.",
        "소모품은 다음 교체 때, 보험은 만기 30일 전에 알려 드립니다.",
      ],
      tips: [
        "금액·주유소 같은 기록은 고객님만 봅니다. 정비소는 주행거리만 참고합니다.",
      ],
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
          {[
            "⛽ 주유 · 62,000원",
            "🔧 엔진오일 · 다음 교체 7,000km 뒤",
            "🧽 세차 · 15,000원",
          ].map((t) => (
            <Box key={t}>{t}</Box>
          ))}
          <Btn>적기</Btn>
        </Phone>
      ),
    },
    {
      id: "cert",
      en: "HISTORY",
      t: "수리 이력 확인서: 차를 팔 때",
      lead: "우리 정비소에서 고친 내역을 한 장으로 뽑아 차를 사는 분께 보여 줄 수 있습니다. QR이나 확인 번호로 누구나 진짜인지 확인합니다.",
      steps: [
        "홈의 '수리 이력 확인서'를 누릅니다.",
        "차를 고르고 수리 금액을 넣을지 정합니다.",
        "'만들기'를 누르고 인쇄·PDF로 저장해 전합니다.",
      ],
      tips: [
        "차를 팔고 나면 '이 차 팔았어요'를 눌러 주세요. 새 주인에게 내 기록이 보이지 않습니다.",
      ],
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
              <span className="text-[9px] text-[var(--muted)]">
                확인 번호 7K2M-Q9XA-3F
              </span>
              <div className="grid size-8 grid-cols-3 gap-px bg-[var(--fg)] p-px">
                {Array.from({ length: 9 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      [0, 2, 4, 6, 8].includes(i)
                        ? "bg-[var(--fg)]"
                        : "bg-[var(--surface)]"
                    }
                  />
                ))}
              </div>
            </div>
          </Box>
          <Btn>인쇄·PDF 저장</Btn>
        </Phone>
      ),
    },
  ];
  const FAQ = [
    {
      q: "문자가 안 옵니다",
      a: "정비소에 등록된 번호에만 문자가 갑니다. 번호가 바뀌었거나 처음이면 정비소로 전화해 주세요. 스팸 문자함도 확인해 보세요.",
    },
    {
      q: "알림톡 링크로 들어왔더니 이번 수리만 보입니다",
      a: "링크가 다른 사람에게 전달돼도 안전하도록 그 수리 건만 보여 줍니다. '모든 기록 보기'를 눌러 문자 인증을 한 번 하면 다 보입니다.",
    },
    {
      q: "가족 차도 함께 볼 수 있나요?",
      a: "정비소에 등록된 휴대폰 번호 기준으로 보입니다. 가족 명의 차는 그 가족의 휴대폰으로 들어가야 합니다.",
    },
    {
      q: "다른 휴대폰에서 쓰고 싶습니다",
      a: "새 휴대폰에서 같은 번호로 문자 인증만 하면 됩니다. 기록은 정비소에 있어 옮길 것이 없습니다.",
    },
    {
      q: "쓰지 않으려면 어떻게 하나요?",
      a: "'더보기'에서 내 기록 동의를 거두거나 그만 쓰기를 누릅니다. 정비소의 수리 기록은 법에 정한 기간 동안 정비소에 보관됩니다.",
    },
  ];
  return (
    <div className="space-y-20">
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <SiteTitle
            eyebrow="MY CAR BOOK"
            help="site.carbookGuide"
            sub="수리 진행, 견적 승인, 서류, 보증, 내 차 기록까지. 아이디 없이 휴대폰 문자 인증으로 씁니다."
          >
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
                <a
                  href={`#${c.id}`}
                  className="flex gap-3 hover:text-[var(--red)]"
                >
                  <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-[var(--red)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{c.t.split(":")[0]}</span>
                </a>
              </li>
            ))}
            <li>
              <a href="#faq" className="flex gap-3 hover:text-[var(--red)]">
                <span className="w-5 shrink-0 text-sm font-semibold text-[var(--red)]">
                  Q
                </span>
                <span>자주 묻는 질문</span>
              </a>
            </li>
          </ol>
        </nav>
      </div>

      {CH.map((c, i) => (
        <section
          key={c.id}
          id={c.id}
          aria-labelledby={`${c.id}-t`}
          className="scroll-mt-28 border-t border-[var(--line)] pt-14"
        >
          <div
            className={`flex flex-col gap-10 md:flex-row md:items-center ${i % 2 ? "md:flex-row-reverse" : ""}`}
          >
            <div className="flex-1">
              <p className="eyebrow mb-2">
                <span className="text-[var(--red)]">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                · {c.en}
              </p>
              <h2
                id={`${c.id}-t`}
                className="text-2xl font-bold leading-snug sm:text-[1.9rem]"
              >
                {c.t}
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-[var(--muted)]">
                {c.lead}
              </p>
              <ol className="mt-6 space-y-3">
                {c.steps.map((s, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-sm font-bold text-white dark:bg-white dark:text-[var(--ink)]">
                      {j + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
              {c.tips && (
                <ul className="mt-6 space-y-1.5 rounded-xl border border-[var(--line)] p-4 text-[15px] text-[var(--muted)]">
                  {c.tips.map((t) => (
                    <li key={t} className="flex gap-2">
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

      <section
        id="faq"
        aria-labelledby="faq-t"
        className="scroll-mt-28 border-t border-[var(--line)] pt-14"
      >
        <p className="eyebrow mb-2">FAQ</p>
        <h2 id="faq-t" className="mb-6 text-2xl font-bold">
          자주 묻는 질문
        </h2>
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{f.q}</span>
                <span
                  aria-hidden
                  className="mt-1 text-xl leading-none text-[var(--steel)] transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl leading-relaxed text-[var(--muted)]">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
