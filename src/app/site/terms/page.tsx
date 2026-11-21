// 이용약관: 홈페이지·견적 요청·내 차 수첩을 쓰는 규칙(짧게). 사업자 정보는 사업장 정보에서 불러온다
import type { Metadata } from "next";
import { siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "이용약관" };

const ITEMS: [string, string][] = [
  ["목적", "이 약관은 정비소 홈페이지, 견적 요청, 내 차 수첩을 쓰실 때의 규칙을 정합니다."],
  ["견적 요청 답변", "사진만 보고 드리는 답은 대략 금액입니다. 정식 견적은 차를 직접 진단한 뒤 법정 견적서로 드리며, 승인하신 작업만 합니다."],
  ["본인 확인", "견적 요청과 내 차 수첩은 휴대폰 문자 인증으로 본인을 확인합니다. 다른 사람의 번호로 요청하면 안 됩니다."],
  ["사진", "보내 주신 사진은 견적과 수리 기록에만 씁니다. 홍보에는 따로 동의하신 경우에만 번호판·얼굴을 가려 씁니다."],
  ["금지 행위", "광고·욕설·다른 사람 정보가 담긴 내용, 자동 프로그램으로 반복 요청하는 것은 막고 지울 수 있습니다."],
  ["서비스 중단", "점검·정전·통신 장애로 잠시 열리지 않을 수 있습니다. 급한 일은 전화로 연락해 주세요."],
  ["책임", "정비소는 수리 결과에 대해 보증 기간 동안 책임집니다. 홈페이지 정보는 안내용이며, 계약 내용은 견적서·정비명세서를 따릅니다."],
  ["분쟁", "분쟁은 서로 협의하며, 자동차 정비 관련 분쟁은 한국소비자원 등의 조정을 받을 수 있습니다."],
];

export default async function TermsPage() {
  const { shop, cfg } = await siteData();
  return (
    <article className="mx-auto max-w-3xl leading-relaxed">
      <SiteTitle eyebrow="TERMS" help="site.terms" sub={shop.name}>
        이용약관
      </SiteTitle>
      <ol className="space-y-5">
        {ITEMS.map(([t, d], i) => (
          <li key={t}>
            <h2 className="font-bold">
              제{i + 1}조 {t}
            </h2>
            <p>{d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-[var(--muted)]">시행일: {cfg.privacyFrom || "개업일"}</p>
    </article>
  );
}
