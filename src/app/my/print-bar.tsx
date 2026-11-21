"use client";
// 서류 화면 위 줄: 인쇄·PDF 저장. 카카오톡 안에서는 인쇄가 안 되므로 다른 브라우저로 여는 길을 알려 준다
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "../_ui";
import { inAppEnv } from "./my-nav";

export function PrintBar({ back }: { back: string }) {
  const [env, setEnv] = useState({ kakao: false, android: false });
  useEffect(() => setEnv(inAppEnv()), []);
  return (
    <div className="no-print mb-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link href={back} className={buttonClass("secondary")}>
          ← 돌아가기
        </Link>
        {!env.kakao && <Button onClick={() => window.print()}>인쇄·PDF 저장</Button>}
      </div>
      {env.kakao && <OpenOutside android={env.android} why="카카오톡 안에서는 인쇄·PDF 저장이 안 됩니다." />}
    </div>
  );
}

/** 카카오톡 안 브라우저 → 크롬(안드로이드는 바로)·사파리(아이폰은 메뉴 안내) */
export function OpenOutside({ android, why }: { android: boolean; why: string }) {
  const open = () => {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
  };
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm">
      <p>{why}</p>
      {android ? (
        <Button variant="secondary" className="mt-2" onClick={open}>
          크롬으로 열기
        </Button>
      ) : (
        <p className="mt-1 text-[var(--muted)]">오른쪽 아래 ⋯(또는 공유) 단추 → &lsquo;Safari로 열기&rsquo;를 눌러 주세요.</p>
      )}
    </div>
  );
}
