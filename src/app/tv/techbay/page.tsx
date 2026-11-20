// 테크베이용 TV 현황판(대표 요청 2026-11-20). 테크베이 고객 차만, 공정별 색, 위쪽은 '오늘 입고 → 각 공정 → 오늘 출고'.
// 오른쪽 입고·출고 예정 칸은 없다. TV는 테크베이용 비밀 링크(?k=)로 연다(전체 TV 링크로도 열림).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { tvBoard, tvTokenOk } from "@/modules/dashboard/tv";
import { currentUser } from "../../_lib/session";
import { TechbayScreen } from "./techbay-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV 현황판(테크베이)" };

export default async function TechbayTvPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const db = await getDb();
  const user = await currentUser();
  const byLink = !!k && (await tvTokenOk(db, k, "techbay"));
  if (k && !byLink && !user)
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0c1524] p-8 text-center text-2xl text-[#eef3fa]">
        TV 링크가 맞지 않거나 새로 만들어졌습니다. 정비소에 새 링크를 받아 다시 띄워 주세요.
      </div>
    );
  if (!byLink) {
    if (!user) redirect("/login");
    if (user.mustChangePassword) redirect("/account/first");
  }
  return <TechbayScreen help="tvTechbay" initial={await tvBoard(db, new Date(), { portal: "techbay" })} k={byLink ? k! : null} signedIn={!!user} />;
}
