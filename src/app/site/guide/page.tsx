// 홈페이지 › 이용 안내: 맡기기 전 준비, 맡긴 동안(진행 알림·추가 견적), 찾아갈 때, 출고 뒤 관리(세차 금지 기간·보증) — 숫자는 정책값에서
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { siteBtn, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "이용 안내", description: "차를 맡기기 전 준비할 것과 출고 뒤 관리 방법" };

export default async function GuidePage() {
  const p = await loadPolicy(await getDb());
  const BLOCKS = [
    {
      e: "BEFORE",
      t: "맡기기 전에",
      items: ["차 안 귀중품·하이패스 카드·블랙박스 메모리는 챙겨 가세요.", "열쇠(스마트키)를 하나 맡겨 주세요. 작업 중 차를 옮겨야 합니다.", "보험 수리면 사고 접수번호와 보험사를 알려 주세요.", "입고할 때 차를 한 바퀴 돌며 사진을 찍고 지금 상태를 함께 확인합니다."],
    },
    {
      e: "DURING",
      t: "맡긴 동안",
      items: ["진행 단계(진단·견적·작업·검사·출고)는 내 차 수첩에서 바로 보입니다.", "뜯어 보니 손상이 더 있으면 작업을 멈추고 사진과 추가 견적을 먼저 보내 드립니다.", "승인하신 작업만 합니다. 승인 없이 금액이 오르지 않습니다."],
    },
    {
      e: "PICK UP",
      t: "찾아가실 때",
      items: ["밝은 곳에서 고친 곳을 함께 보고 확인합니다.", "정비명세서·영수증을 드리고, 사진·보증 기간은 내 차 수첩에 남습니다."],
    },
    {
      e: "AFTER CARE",
      t: "출고 뒤 관리",
      items: [
        `출고 뒤 ${p["delivery.no_wash_days"]}일 동안은 자동 세차·고압 세차·왁스를 피해 주세요(도막이 굳는 동안).`,
        "새 도장 위에 스티커·테이프를 붙이지 마세요.",
        "새·나무 수액·벌레 자국은 바로 물로 닦아 주세요.",
        `문제가 생기면 보증 기간(도장·판금 ${p["warranty.paint_months"]}개월, 덴트 ${p["warranty.dent_months"]}개월) 안에 내 차 수첩에서 사진과 함께 신청하세요.`,
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <SiteTitle eyebrow="GUIDE" help="site.guide" sub="처음 맡기셔도 헷갈리지 않게, 맡기기 전부터 출고 뒤까지 정리했습니다.">
        이용 안내
      </SiteTitle>
      <div className="space-y-5">
        {BLOCKS.map((b, i) => (
          <section key={b.t} aria-label={b.t} className={`grid gap-4 rounded-2xl p-7 sm:grid-cols-[12rem_1fr] sm:p-9 ${i === 3 ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>
            <div>
              <p className={`eyebrow mb-1 ${i === 3 ? "!text-white/50" : ""}`}>{b.e}</p>
              <h2 className="text-xl font-bold">{b.t}</h2>
            </div>
            <ul className="space-y-2.5">
              {b.items.map((x) => (
                <li key={x} className="flex gap-3 leading-relaxed">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[var(--red)]" />
                  <span className={i === 3 ? "text-white/85" : ""}>{x}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/request" className={siteBtn("red")}>
          사진으로 견적 요청
        </Link>
        <Link href="/my" className={siteBtn("line")}>
          내 차 수첩 열기
        </Link>
      </div>
    </div>
  );
}
