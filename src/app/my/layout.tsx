// 내 차 수첩(고객용) 틀: 휴대폰 폭 가운데, 아래 탭 줄. 글자는 크게, 누를 곳은 넓게
import type { Metadata } from "next";
import { MyNav } from "./my-nav";

export const metadata: Metadata = { title: "내 차 수첩", description: "우리 정비소에서 고친 내 차의 수리 기록·서류·보증" };

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-1 pb-24 text-[15px] sm:px-0">
      {children}
      <MyNav />
    </div>
  );
}
