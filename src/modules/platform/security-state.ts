// 공격 대책(대표 2026-11-21): 막을 주소·외국 접속 막기 상태를 앱 프로세스 메모리(globalThis)에 둔다.
// proxy.ts(모든 요청 앞)가 DB 없이 빠르게 보도록. 앱(security.ts)이 DB 에서 읽어 1분마다·바뀔 때마다 채운다.
// 처음 켜진 뒤 채워지기 전에는 막지 않는다(그 사이 앱이 안 열리는 일이 없게).

export type SecState = {
  blocks: Map<string, number>; // 주소 → 풀리는 때(ms)
  geoOn: boolean;
  kr: { start: Uint32Array; end: Uint32Array } | null; // 국내 주소 범위(시작 순)
  allow: Set<string>; // 언제나 허용(서버 자신의 인터넷 주소)
  at: number;
};
const KEY = "__absSecurity";
type G = typeof globalThis & { [KEY]?: SecState };

export function getSecState(): SecState | null {
  return (globalThis as G)[KEY] ?? null;
}
export function setSecState(s: Omit<SecState, "at">) {
  (globalThis as G)[KEY] = { ...s, at: Date.now() };
}

/** IPv4 → 숫자. 아니면 null */
export function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
/** 공유기 안·이 PC·Tailscale 등 인터넷 주소가 아닌 것(막지 않는다) */
export function isPrivateIp(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return !/^[0-9a-f:]+$/i.test(ip) || /^(::1$|fe80:|fc|fd|::ffff:(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip);
  const a = n >>> 24, b = (n >>> 16) & 255;
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
/** 막을 수 있는 인터넷 IPv4 주소인지(엉뚱한 값이 방화벽에 들어가지 않게) */
export function isPublicIpv4(ip: string) {
  return ipv4ToInt(ip) != null && !isPrivateIp(ip);
}
export function inKr(kr: NonNullable<SecState["kr"]>, ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true; // IPv6 등은 판단하지 않는다(앱 주소는 IPv4 로만 열림)
  let lo = 0, hi = kr.start.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (kr.start[mid] <= n) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi >= 0 && n <= kr.end[hi];
}

/** 이 주소를 막아야 하면 이유, 아니면 null */
export function blockReason(s: SecState | null, ip: string | null, now = Date.now()): "blocked" | "foreign" | null {
  if (!s || !ip || isPrivateIp(ip) || s.allow.has(ip)) return null;
  const until = s.blocks.get(ip);
  if (until && until > now) return "blocked";
  if (s.geoOn && s.kr && s.kr.start.length > 100 && !inKr(s.kr, ip)) return "foreign";
  return null;
}

/** 요청 머리글에서 접속한 주소(session.ts requestMeta 와 같은 규칙) */
export function clientIp(h: Headers): string | null {
  const cf = process.env.TRUST_CF_IP === "1" ? h.get("cf-connecting-ip")?.trim() : null;
  return cf || (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) || null;
}
