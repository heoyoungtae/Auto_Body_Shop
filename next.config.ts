import type { NextConfig } from "next";

// 보안 머리글(대표 2026-11-21 공격 대책): 다른 사이트가 앱 화면을 몰래 끼워 넣거나(클릭 가로채기),
// 브라우저가 보안 접속 대신 일반 접속을 쓰거나, 파일 종류를 멋대로 짐작하지 못하게 한다.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // PGlite는 로컬 개발·테스트 전용이라 번들에서 뺀다.
  serverExternalPackages: ["@electric-sql/pglite"],
  // 입고 사진(화면에서 1600px WEBP 로 줄여 보냄, 보통 0.3~1MB)·서명 그림을 서버 액션으로 받는다. 서버는 6MB 넘으면 거절
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
