// 홈페이지 첫 화면: 한 줄 소개·견적 요청 단추, 수리 분야, 진행 순서, 내 차 수첩, 오시는 길
import Link from "next/link";
import { SERVICES } from "@/modules/site/rules";
import { siteBtn, siteData, SiteTitle } from "./_parts";

const STEPS = [
  { t: "상담", d: "전화·방문·홈페이지로 다친 곳을 알려 주세요." },
  { t: "진단", d: "차를 직접 보고 손상 부위마다 고칠 방법을 정합니다." },
  { t: "견적 승인", d: "법정 견적서를 보내 드리고, 승인하신 작업만 합니다." },
  { t: "작업", d: "판금·도장 공정마다 사진과 기록을 남깁니다." },
  { t: "검사", d: "단차·도막 두께·색상을 재서 기준에 맞는지 봅니다." },
  { t: "출고", d: "정비명세서·사진·보증 기간을 내 차 수첩에 남깁니다." },
];

export default async function SiteHome() {
  const { shop, cfg, mapUrl } = await siteData();
  return (
    <div className="space-y-14">
      <section className="-mx-4 -mt-8 bg-gradient-to-br from-[#0a3e96] to-[#061f4d] px-4 py-14 text-white sm:rounded-b-3xl sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="[&_h1]:justify-center [&_h1]:text-3xl [&_h1]:leading-tight sm:[&_h1]:text-5xl [&_button]:text-white/80">
            <SiteTitle help="site.home">{cfg.headline}</SiteTitle>
          </div>
          {cfg.lead && <p className="mx-auto -mt-2 max-w-2xl text-lg text-white/85">{cfg.lead}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {cfg.requests && (
              <Link href="/request" className={siteBtn("red")}>
                사진으로 견적 요청
              </Link>
            )}
            {shop.phone && (
              <a href={`tel:${shop.tel}`} className={`${siteBtn("line")} border-white/40 text-white hover:bg-white/10`}>
                전화 {shop.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="svc">
        <h2 id="svc" className="mb-4 text-xl font-bold sm:text-2xl">
          이런 수리를 합니다
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.title} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <p className="mb-2 text-lg font-semibold">{s.title}</p>
              <p className="text-[var(--muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="flow">
        <h2 id="flow" className="mb-4 text-xl font-bold sm:text-2xl">
          이렇게 진행합니다
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rounded-xl bg-[var(--surface-2)] p-4">
              <p className="mb-1 text-sm font-semibold text-[#d71f2b]">{i + 1}단계</p>
              <p className="font-semibold">{s.t}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] p-6">
          <h2 className="mb-2 text-xl font-bold">내 차 수첩</h2>
          <p className="text-[var(--muted)]">수리 진행·사진·견적서·명세서·보증 기간을 휴대폰으로 봅니다. 아이디·비밀번호 없이 휴대폰 문자 인증으로 들어옵니다. 견적 요청의 답변도 여기서 봅니다.</p>
          <Link href="/my" className={`${siteBtn("navy")} mt-4`}>
            내 차 수첩 열기
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--line)] p-6">
          <h2 className="mb-2 text-xl font-bold">오시는 길</h2>
          <p>{shop.address || "주소 준비 중"}</p>
          {cfg.hours && <p className="mt-1 text-[var(--muted)]">{cfg.hours}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener" className={siteBtn("line")}>
                네이버 지도
              </a>
            )}
            <Link href="/about" className={siteBtn("line")}>
              정비소 소개
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
