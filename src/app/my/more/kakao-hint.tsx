"use client";
// 카카오톡 안에서 열었을 때만: 다른 브라우저로 여는 길(인쇄·홈 화면 추가는 그쪽에서)
import { useEffect, useState } from "react";
import { inAppEnv } from "../my-nav";
import { OpenOutside } from "../print-bar";

export function KakaoHint() {
  const [env, setEnv] = useState({ kakao: false, android: false });
  useEffect(() => setEnv(inAppEnv()), []);
  if (!env.kakao) return null;
  return <OpenOutside android={env.android} why="카카오톡 안에서 보고 계십니다. 서류 인쇄나 홈 화면에 두기는 크롬·사파리에서 할 수 있습니다." />;
}
