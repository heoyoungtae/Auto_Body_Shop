// 출퇴근·연장근무 인정 규칙(사용자 결정 2026-11-11). 화면·서버·급여·테스트가 같이 쓴다(DB 없음).
// - 출퇴근 버튼은 정비소 인터넷(등록한 공인 IP)에서만 누른다. 목록이 비어 있으면 어디서나(설치 전).
// - 연장근무 인정 시간 = 승인된 연장 시각 구간 ∩ 실제 출근~퇴근. 분 단위로 센다(30분 절사는 임금 체불 위험).
// - 승인 없이 더 일한 시간은 수당에 넣지 않고, 사후 신청으로 승인자가 인정 여부를 정한다.

/** "HH:MM" → 분. 틀리면 null */
export function hm(t: string | null | undefined) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const hmText = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 서울 시각 "HH:MM"(한국은 서머타임 없음) */
export const seoulHM = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);

/** 분 → "1시간 20분" */
export function durText(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분`;
}

// ── 정비소 인터넷 확인 ────────────────────────────────────

const v4 = (ip: string) => {
  const p = ip.split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
};
/** IPv6 안에 든 IPv4(::ffff:1.2.3.4)는 IPv4로 본다 */
export const normalizeIp = (ip: string | null | undefined) => (ip ?? "").trim().replace(/^::ffff:/i, "").toLowerCase();

/** 목록 한 줄이 맞는 형식인지: IPv4, IPv4/CIDR(예: 1.2.3.0/24), IPv6 */
export function validIpRule(rule: string) {
  const r = rule.trim();
  const [addr, bits] = r.split("/");
  if (v4(addr) != null) return bits == null || (/^\d{1,2}$/.test(bits) && Number(bits) >= 8 && Number(bits) <= 32);
  return bits == null && /^[0-9a-f:]+$/i.test(addr) && addr.includes(":");
}

/** 접속 주소가 등록한 정비소 인터넷 주소 중 하나에 드는지 */
export function ipAllowed(ip: string | null | undefined, rules: string[]) {
  const a = normalizeIp(ip);
  if (!a) return false;
  for (const raw of rules) {
    const [addr, bits] = raw.trim().toLowerCase().split("/");
    if (bits == null) {
      if (normalizeIp(addr) === a) return true;
      continue;
    }
    const n = v4(a);
    const base = v4(addr);
    if (n == null || base == null) continue;
    const size = 2 ** (32 - Number(bits));
    if (Math.floor(n / size) === Math.floor(base / size)) return true;
  }
  return false;
}

// ── 시간 계산 ───────────────────────────────────────────

export type Span = { from: number; to: number };
/** 두 구간이 겹치는 분 */
export const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));

/** 승인된 연장 구간과 실제 근무(출근~퇴근)가 겹치는 분. 기록이 없으면 0 */
export function recognizedMinutes(ot: { fromTime: string; toTime: string }, actual: Span | null) {
  const s = hm(ot.fromTime);
  const e = hm(ot.toTime);
  if (!actual || s == null || e == null || e <= s) return 0;
  return overlap({ from: s, to: e }, actual);
}

/**
 * 승인 없이 더 일한 분: 영업일은 정해진 퇴근 시각 뒤, 쉬는 날은 출근부터 전부.
 * 승인된(결재 중 포함) 연장 구간이 덮는 시간은 뺀다.
 */
export function unapprovedMinutes(actual: Span | null, workEnd: number, businessDay: boolean, approved: Span[]) {
  if (!actual) return 0;
  const from = businessDay ? Math.max(actual.from, workEnd) : actual.from;
  if (actual.to <= from) return 0;
  // 승인 구간을 합쳐서(겹침 없이) 뺀다
  const spans = approved.map((s) => ({ from: Math.max(s.from, from), to: Math.min(s.to, actual.to) })).filter((s) => s.to > s.from).sort((x, y) => x.from - y.from);
  let covered = 0;
  let end = from;
  for (const s of spans) {
    const st = Math.max(s.from, end);
    if (s.to > st) {
      covered += s.to - st;
      end = s.to;
    }
  }
  return actual.to - from - covered;
}

/** 정해진 시각과 비교: 늦게 온 분, 일찍 간 분 */
export function lateEarly(actual: Span, workStart: number, workEnd: number) {
  return { late: Math.max(0, actual.from - workStart), early: Math.max(0, workEnd - actual.to) };
}
