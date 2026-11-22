// 이용약관: 시행 중인 판을 보여 준다(설정 › 홈페이지 › 약관에서 판을 시행, 문구는 화면 글 › 이용약관). ?v= 로 지난·예정 판
import type { Metadata } from "next";
import { LegalScreen } from "../_legal";

export const metadata: Metadata = { title: "이용약관" };

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  return <LegalScreen kind="terms" v={v} help="site.terms" eyebrow="TERMS" />;
}
