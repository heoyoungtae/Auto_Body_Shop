// 홈페이지(jmotors.co.kr) 공용 부품: 제목 줄(도움말 단추), 홈 주소, 정비소 정보 불러오기
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { shopCard } from "@/modules/carbook/service";
import { PAGE_HELP, type PageHelpKey } from "@/modules/help/pages";
import { loadShopInfo, formatBizNo } from "@/modules/platform/shop";
import { siteConfig } from "@/modules/site/service";
import { sitePages } from "@/modules/site/pages";
import { currentUser } from "../_lib/session";
import { isHomepageHost } from "@/modules/site/rules";
import type { ArticleBlock } from "@/modules/site/articles";
import { HelpButton } from "../_help-drawer";

/** 홈페이지 주소(jmotors.co.kr)면 '/', 앱 주소(테스트 서버)면 '/site' */
export async function homeHref() {
  const h = await headers();
  return isHomepageHost(h.get("x-forwarded-host") ?? h.get("host")) ? "/" : "/site";
}

/** 미리 보기 쿠키 이름(설정 › 홈페이지 '미리 보기'가 켠다) */
export const PREVIEW_COOKIE = "site_preview";

/** 대표가 미리 보기를 켰는가(쿠키 + 대표 로그인). 손님에게는 늘 공개 중인 글만 보인다 */
export async function isPreview() {
  if (!(await cookies()).get(PREVIEW_COOKIE)) return false;
  return !!(await currentUser())?.roles.includes("owner");
}

/** 화면 글(미리 보기면 공개 전 고침까지) */
export async function viewPages() {
  return sitePages(await getDb(), await isPreview());
}

/** 정비소 이름·전화·주소(사업장 정보)와 홈페이지 설정을 한 번에 */
export async function siteData() {
  const db = await getDb();
  const [shop, info, cfg] = await Promise.all([shopCard(db), loadShopInfo(db), siteConfig(db)]);
  return { shop, ceo: info.ceo, bizNo: info.bizNo ? formatBizNo(info.bizNo) : "", cfg, mapUrl: shop.address ? `https://map.naver.com/p/search/${encodeURIComponent(shop.address.replace(/^\(\d+\)\s*/, ""))}` : "" };
}

/** 홈페이지 화면 제목: 영어 작은 머리말 + 큰 글자 + 도움말 단추(모든 화면 도움말 규칙) */
export function SiteTitle({ help, children, sub, eyebrow }: { help: PageHelpKey; children: ReactNode; sub?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-10" data-page-help={help}>
      {eyebrow && <p className="eyebrow eyebrow-red mb-3">{eyebrow}</p>}
      <h1 className="flex items-center gap-2 text-3xl font-bold leading-tight break-keep sm:text-[2.6rem]">
        <span>{children}</span>
        <HelpButton topic={{ kind: "page", id: help }} name={PAGE_HELP[help].title} />
      </h1>
      {sub && <p className="mt-3 max-w-2xl text-lg text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

/** 줄 바꿈(\n)을 그대로 보이는 제목 글(설정에서 두 줄로 적은 제목) */
export function Lines({ text }: { text: string }) {
  const xs = text.split("\n");
  return (
    <>
      {xs.map((x, i) => (
        <span key={i}>
          {x}
          {i < xs.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

/** 섹션 머리: 영어 머리말 + 제목 + (오른쪽) 더 보기 */
export function SectionHead({ eyebrow, title, more, id, dark = false }: { eyebrow: string; title: ReactNode; more?: { href: string; label: string }; id?: string; dark?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 id={id} className={`text-2xl font-bold sm:text-[2rem] ${dark ? "text-white" : ""}`}>
          {title}
        </h2>
      </div>
      {more && (
        <a href={more.href} className={`group inline-flex items-center gap-1.5 text-sm font-semibold ${dark ? "text-white/80 hover:text-white" : "text-[var(--fg)] hover:text-[var(--red)]"}`}>
          {more.label}
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </a>
      )}
    </div>
  );
}

/** 단추 모양: red(주 행동) · ink(먹색) · line(테두리) · ghost(어두운 바탕 위 흰 테두리) */
export const siteBtn = (kind: "red" | "navy" | "ink" | "line" | "ghost" = "red") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold tracking-[-0.01em] transition ${
    kind === "red"
      ? "bg-[var(--red)] text-white shadow-[0_8px_24px_rgb(200_16_46_/_0.28)] hover:bg-[var(--red-hi)]"
      : kind === "navy" || kind === "ink"
        ? "bg-[var(--ink)] text-white hover:bg-black dark:bg-white dark:text-[var(--ink)] dark:hover:bg-white/90"
        : kind === "ghost"
          ? "border border-white/35 text-white hover:border-white hover:bg-white/10"
          : "border border-[var(--line-strong)] hover:border-[var(--fg)]"
  }`;

/** 기술자료 본문: '## 소제목' · '- 항목' · 문단 */
export function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div className="space-y-5 text-[17px] leading-[1.85]">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h2 key={i} className="!mt-10 border-l-[3px] border-[var(--red)] pl-3 text-xl font-bold leading-snug sm:text-[1.4rem]">
            {b.text}
          </h2>
        ) : b.kind === "ul" ? (
          <ul key={i} className="space-y-2 rounded-xl bg-[var(--paper)] p-5 sm:p-6">
            {b.items.map((t, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="mt-[0.75em] size-1.5 shrink-0 rounded-full bg-[var(--red)]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

/** 화면 아래 마무리 띠: 사진 견적 요청 · 전화 */
export function CtaBand({ requests, phone, tel, title = "사진 몇 장이면 충분합니다", body }: { requests: boolean; phone: string; tel: string; title?: string; body?: string }) {
  return (
    <section className="hero-bg -mx-5 rounded-none px-5 py-14 text-center text-white sm:mx-0 sm:rounded-3xl sm:px-10">
      <p className="eyebrow mb-3 !text-white/55">ESTIMATE</p>
      <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-xl text-white/70">{body}</p>}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {requests && (
          <a href="/request" className={siteBtn("red")}>
            사진으로 견적 요청
          </a>
        )}
        {phone && (
          <a href={`tel:${tel}`} className={siteBtn("ghost")}>
            전화 {phone}
          </a>
        )}
      </div>
    </section>
  );
}
