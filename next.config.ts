import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite는 로컬 개발·테스트 전용이라 번들에서 뺀다.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
