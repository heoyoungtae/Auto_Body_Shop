// TV 현황판(대표 결정 2026-11-18). 직원은 로그인한 채로, TV(크롬캐스트·미니 PC)는 비밀 열쇠 링크(?k=)로 연다.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { tvBoard, tvTokenOk } from "@/modules/dashboard/tv";
import { currentUser } from "../_lib/session";
import { TvScreen } from "./tv-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV 현황판" };

export default async function TvPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const db = await getDb();
  const user = await currentUser();
  const byLink = !!k && (await tvTokenOk(db, k));
  if (k && !byLink && !user)
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0c1524] p-8 text-center text-2xl text-[#eef3fa]">
        TV 링크가 맞지 않거나 새로 만들어졌습니다. 앱의 설정 › TV 현황판에서 새 링크로 다시 띄워 주세요.
      </div>
    );
  if (!byLink) {
    if (!user) redirect("/login");
    if (user.mustChangePassword) redirect("/account/first");
  }
  return <TvScreen help="tv" initial={await tvBoard(db)} k={byLink ? k! : null} signedIn={!!user} />;
}
