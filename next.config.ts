import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite는 로컬 개발·테스트 전용이라 번들에서 뺀다.
  serverExternalPackages: ["@electric-sql/pglite"],
  // 입고 사진(화면에서 1600px WEBP 로 줄여 보냄, 보통 0.3~1MB)·서명 그림을 서버 액션으로 받는다. 서버는 6MB 넘으면 거절
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};

export default nextConfig;
