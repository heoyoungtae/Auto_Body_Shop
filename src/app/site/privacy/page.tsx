// 개인정보 처리방침(개인정보 보호법 제30조, 누구나 볼 수 있게 공개). 시행 중인 판을 보여 주고, 지난 판도 모두 볼 수 있다(?v=).
// 내용은 modules/site/legal.ts privacyDoc(동의서 F-13-01과 같은 항목·보관 기간), 공업사 이름·대표·문자 대행사·보호책임자는 설정에서 불러온다.
// 문구나 값을 바꾸면 설정 › 홈페이지 › 약관에서 새 판을 시행일 7일 앞서 시행한다.
import type { Metadata } from "next";
import { CONSENT_TEXT } from "@/modules/customer/rules";
import { LegalScreen } from "../_legal";

export const metadata: Metadata = { title: "개인정보 처리방침" };

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  return (
    <LegalScreen
      kind="privacy"
      v={v}
      help="site.privacy"
      eyebrow="PRIVACY POLICY"
      after={
        <details className="mt-6 rounded-lg border border-[var(--line)] p-4 text-sm">
          <summary className="cursor-pointer font-medium">견적 요청 때 받는 동의 문구 보기</summary>
          <p className="mt-2 font-medium">{CONSENT_TEXT.required.title}</p>
          <p className="text-[var(--muted)]">{CONSENT_TEXT.required.body}</p>
          <p className="mt-2 font-medium">{CONSENT_TEXT.marketing.title}</p>
          <p className="text-[var(--muted)]">{CONSENT_TEXT.marketing.body}</p>
        </details>
      }
    />
  );
}
