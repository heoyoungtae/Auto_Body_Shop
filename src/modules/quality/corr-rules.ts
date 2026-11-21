// 문서 수발신(F-Q-11)·회사 공문(F-Q-12) 고정값 — 화면과 서버가 같이 쓴다(STD-Q 7절)

/** 상대 구분 */
export const PARTY_KINDS = {
  insurer: "보험사",
  agency: "관청·공공기관",
  supplier: "협력업체",
  client: "업체 고객",
  customer: "개인 고객",
  other: "기타",
} as const;
export type PartyKind = keyof typeof PARTY_KINDS;
export const isPartyKind = (s: string): s is PartyKind => s in PARTY_KINDS;

/** 받은·보낸 방법 */
export const CORR_VIA = {
  post: "우편",
  registered: "등기 우편",
  email: "이메일",
  fax: "팩스",
  online: "온라인(전자 공문·누리집)",
  hand: "직접 전달",
  message: "문자·메신저",
} as const;
export type CorrVia = keyof typeof CORR_VIA;
export const isCorrVia = (s: string): s is CorrVia => s in CORR_VIA;

export const CORR_STATUS = {
  open: "처리 중",
  done: "처리 끝",
  writing: "결재 중",
  approved: "승인(발송 전)",
  sent: "발송",
  void: "버림",
} as const;
export type CorrStatus = keyof typeof CORR_STATUS;
export const CORR_TONE: Record<CorrStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  open: "warn",
  done: "ok",
  writing: "accent",
  approved: "warn",
  sent: "ok",
  void: "neutral",
};

/** 목록 탭 */
export const CORR_TABS = [
  { v: "todo", label: "처리할 것" },
  { v: "in", label: "받은 문서" },
  { v: "out", label: "보낸 공문" },
  { v: "all", label: "전체" },
] as const;
export type CorrTab = (typeof CORR_TABS)[number]["v"];

/** 처리 기한 기본: 받은 날 + 7일(회신이 필요한 문서). 관청 공문에 기한이 적혀 있으면 그 날짜로 고친다 */
export const CORR_DUE_DAYS = 7;

/** 공문 본문 끝맺음: 본문 마지막 줄 뒤에 '끝.'(붙임이 있으면 붙임 뒤) — 행정 공문 작성 관례 */
export function endMark(body: string, enclosures: string[]): { body: string; enclosures: string[] } {
  const b = body.trim().replace(/\s*끝\.\s*$/, "");
  const e = enclosures.map((x) => x.trim().replace(/\s*끝\.\s*$/, "")).filter(Boolean);
  return e.length ? { body: b, enclosures: e.map((x, i) => (i === e.length - 1 ? `${x}.  끝.` : x)) } : { body: `${b}  끝.`, enclosures: [] };
}

/** 회신 제목: 원래 제목 앞에 '회신: '(이미 붙어 있으면 그대로) */
export const replyTitle = (t: string) => (/^회신[:：]/.test(t.trim()) ? t.trim() : `회신: ${t.trim()}`);

/** 붙임 칸(한 줄에 하나) → 목록 */
export const enclosureList = (s: string | null | undefined) =>
  (s ?? "")
    .split(/\r?\n/)
    .map((x) => x.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
