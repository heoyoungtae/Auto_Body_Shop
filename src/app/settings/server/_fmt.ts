// 서버 화면 숫자 표시(서버·브라우저 둘 다 쓴다)
export type SparkKind = "ms" | "count" | "bytes" | "pct";

export function fmtValue(kind: SparkKind, v: number) {
  if (kind === "ms") return v >= 1000 ? `${(v / 1000).toFixed(1)}초` : `${Math.round(v)}ms`;
  if (kind === "pct") return `${Math.round(v)}%`;
  if (kind === "bytes") return fmtBytes(v);
  return `${Math.round(v).toLocaleString("ko-KR")}건`;
}
export function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)}GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)}MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)}KB`;
  return `${Math.round(b)}B`;
}
export function fmtBps(bps: number) {
  if (bps < 0) return "-";
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)}Mbps`;
  return `${Math.round(bps / 1e3)}kbps`;
}
