// 이용약관·개인정보 처리방침 판 관리(대표 2026-11-22 "홈페이지 모든 관리" 3단계).
// - 손님이 보는 것은 '시행 중인 판'(시행일이 오늘 이전인 가장 늦은 판)을 그대로 찍어 둔 글이다. 문구·공업사 이름·문자 대행사를 바꿔도
//   새 판을 시행하기 전에는 손님 화면이 바뀌지 않는다(지금 내용과 다르면 설정 화면에 알린다).
// - 판이 하나도 없으면(개업 전) 지금 내용을 바로 보여 주고 시행일은 기본 정보의 처리방침 시행일을 쓴다.
// - 처리방침을 바꿀 때는 시행 7일 전에 알린다(처리방침 제9조): 이미 시행 중인 판이 있으면 시행일은 오늘부터 7일 뒤 이후.
//   예정된 판은 손님 화면에 '○월 ○일부터 바뀝니다'로 미리 보이고, 지난 판은 모두 남아 누구나 볼 수 있다(개인정보 처리방침 작성지침).
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import type { Pair } from "./page-text";
import { SiteError } from "./service";

export type LegalKind = "terms" | "privacy";
export const LEGAL_KINDS: { kind: LegalKind; title: string; path: string }[] = [
  { kind: "terms", title: "이용약관", path: "/terms" },
  { kind: "privacy", title: "개인정보 처리방침", path: "/privacy" },
];
/** 처리방침을 바꿀 때 미리 알리는 날 수(처리방침 제9조) */
export const NOTICE_DAYS = 7;

export type LegalBlock = { p: string } | { ul: string[] } | { table: { head: string[]; rows: string[][] } } | { note: string };
export type LegalSection = { t: string; blocks: LegalBlock[] };
export type LegalDoc = { intro: string; sections: LegalSection[]; sign: string };
export type LegalVersion = { id: string; kind: LegalKind; from: string; at: string; by: string; doc: LegalDoc };

type Actor = { id: string; roles: readonly Role[] };
const KEY = "site_legal";

// ── 글 만들기(지금 내용) ──
export function termsDoc(items: Pair[], ctx: { name: string }): LegalDoc {
  return { intro: ctx.name, sections: items.map((x) => ({ t: x.t, blocks: [{ p: x.d }] })), sign: ctx.name };
}

export type PrivacyCtx = { name: string; ceo: string; officer: string; contact: string; phone: string; smsName: string };

export function privacyDoc(c: PrivacyCtx): LegalDoc {
  const who = [c.officer || c.ceo || "대표", c.contact || (c.phone ? `전화 ${c.phone}` : "")].filter(Boolean).join(" · ");
  return {
    intro: `${c.name}은(는) 고객의 개인정보를 소중히 다루며 개인정보 보호법에 따라 아래와 같이 처리합니다.`,
    sections: [
      {
        t: "처리 목적",
        blocks: [
          {
            p: "수리 상담·견적 요청 답변, 입고 예약, 견적·수리·검사·출고, 보험 수리 청구, 보증·사후 관리 안내, 내 차 수첩 서비스 제공, 법령에 따른 기록 보관. 광고 문자는 따로 동의하신 분께만 보냅니다.",
          },
        ],
      },
      {
        t: "처리하는 항목",
        blocks: [
          {
            ul: [
              "필수: 이름, 휴대폰 번호, 차량번호, 차종·연식·색상, 손상 사진·부위",
              "보험 수리 때: 보험사, 사고 접수번호",
              "선택: 광고 문자 수신 여부, 수리 전후 사진 홍보 사용 여부",
              "내 차 수첩을 쓰실 때: 직접 적으신 주유·정비·비용 기록, 알림 설정",
              "자동으로 생기는 정보: 접속 주소(IP), 접속 시각, 로그인 유지용 쿠키(인증 정보만 담고 광고·추적에 쓰지 않음)",
            ],
          },
          { note: "주민등록번호·운전면허번호·위치 정보는 받지 않습니다. 휴대폰 번호는 암호화해 보관합니다." },
        ],
      },
      {
        t: "보관 기간과 파기",
        blocks: [
          {
            ul: [
              "상담·견적 요청만 하고 수리하지 않은 경우: 1년 뒤 파기",
              "수리한 경우: 세법·자동차관리법에 따라 5년 뒤 파기",
              "내 차 수첩에 직접 적은 기록: 그만 쓰기를 누르면 바로, 3년 동안 들어오지 않으면 자동으로 지움",
              "필수 동의를 철회하시면 연락처를 바로 지우고 더 연락하지 않습니다(법정 보관 기록은 기간까지 남음).",
            ],
          },
          { p: "기간이 지난 정보는 앱의 보존·파기 절차에 따라 되살릴 수 없게 지우고, 종이 서류는 분쇄합니다." },
        ],
      },
      {
        t: "제3자 제공",
        blocks: [
          { p: "고객 동의 없이 다른 곳에 주지 않습니다. 다만 보험 수리를 맡기신 경우 수리비 청구에 필요한 견적·수리 내역과 사진을 해당 보험사에 제공하며, 법령에 따른 요청이 있으면 그에 따릅니다." },
        ],
      },
      {
        t: "처리 위탁",
        blocks: [
          { table: { head: ["받는 곳", "맡기는 일"], rows: [[c.smsName, "인증번호·예약·견적·출고 안내 문자와 카카오 알림톡 발송"]] } },
          { note: `고객 정보는 ${c.name}이(가) 직접 관리하는 국내 서버에 보관하며, 국외로 옮기지 않습니다.` },
        ],
      },
      {
        t: "고객의 권리",
        blocks: [
          {
            p: "언제든 내 정보를 보거나 고치거나 지우거나 처리를 멈추도록 요청하실 수 있습니다. 내 차 수첩 › 더보기에서 직접 하시거나, 아래 보호책임자에게 전화·방문으로 요청하시면 10일 안에 처리합니다. 광고 문자는 받은 문자의 무료 수신거부 번호로도 끊을 수 있습니다.",
          },
        ],
      },
      {
        t: "안전하게 지키는 방법",
        blocks: [
          {
            ul: [
              "휴대폰 번호·계좌 같은 정보는 암호화해 보관하고, 직원마다 필요한 만큼만 볼 수 있게 권한을 나눕니다.",
              "누가 언제 어떤 기록을 보고 고쳤는지 남기고, 직원은 개인정보 교육을 받습니다.",
              "접속은 모두 암호화(https)하고, 비정상 접속은 자동으로 막습니다. 매일 백업합니다.",
            ],
          },
        ],
      },
      { t: "개인정보 보호책임자", blocks: [{ p: who }, { note: "개인정보 침해 상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)" }] },
      { t: "바뀌는 경우", blocks: [{ p: `이 방침을 바꾸면 시행 ${NOTICE_DAYS}일 전에 홈페이지에 알리고, 지난 방침도 이 화면에서 계속 볼 수 있게 둡니다.` }] },
    ],
    sign: `${c.name}${c.ceo ? ` 대표 ${c.ceo}` : ""}`,
  };
}

// ── 판 저장 ──
const stable = (x: unknown): string =>
  Array.isArray(x)
    ? `[${x.map(stable).join(",")}]`
    : x && typeof x === "object"
      ? `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(x);
export const sameDoc = (a: LegalDoc, b: LegalDoc) => stable(a) === stable(b);

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function legalVersions(db: Db, kind?: LegalKind): Promise<LegalVersion[]> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  const all = ((r?.data as { items?: LegalVersion[] })?.items ?? []).filter((v) => !kind || v.kind === kind);
  return all.sort((a, b) => (a.from === b.from ? b.at.localeCompare(a.at) : b.from.localeCompare(a.from)));
}

export type LegalState = {
  /** 오늘 시행 중인 판(없으면 개업 전: 지금 내용을 보여 준다) */
  now: LegalVersion | null;
  /** 시행일이 아직 안 된 판 */
  next: LegalVersion | null;
  /** 지난 판(시행 중인 판 앞의 것들, 새것부터) */
  past: LegalVersion[];
};

export function legalState(versions: LegalVersion[], today: string): LegalState {
  const started = versions.filter((v) => v.from <= today);
  const next = versions.filter((v) => v.from > today).sort((a, b) => a.from.localeCompare(b.from))[0] ?? null;
  return { now: started[0] ?? null, next, past: started.slice(1) };
}

/** 가장 이른 시행일: 처음 판은 오늘, 바꿀 때는 오늘부터 7일 뒤(미리 알리는 기간) */
export function earliestFrom(state: LegalState, today: string) {
  return state.now ? addDays(today, NOTICE_DAYS) : today;
}

function mustOwner(actor: Actor) {
  if (!actor.roles.includes("owner")) throw new SiteError("이용약관·처리방침은 대표만 시행합니다");
}

async function save(db: Db, items: LegalVersion[], actorId: string, now: Date) {
  const data = { items };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: now } });
}

/**
 * 지금 내용을 새 판으로 시행한다. 시행 전인 판이 있으면 그 판을 이 판으로 바꾼다(예정은 하나만).
 * 시행 중인 판과 내용이 같으면 막는다. 처리방침·약관 모두 바꿀 때는 7일 앞서 시행일을 잡는다.
 */
export async function issueLegal(db: Db, actor: Actor, kind: LegalKind, from: string, doc: LegalDoc, today: string, now = new Date()) {
  mustOwner(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new SiteError("시행일을 골라 주세요");
  const all = await legalVersions(db);
  const mine = all.filter((v) => v.kind === kind);
  const st = legalState(mine, today);
  const min = earliestFrom(st, today);
  if (from < min) throw new SiteError(st.now ? `바뀐 ${title(kind)}은 손님에게 ${NOTICE_DAYS}일 앞서 알려야 해서 시행일은 ${min} 이후로 잡아 주세요` : "시행일은 오늘 이후로 잡아 주세요");
  if (st.now && sameDoc(st.now.doc, doc)) throw new SiteError(`시행 중인 ${title(kind)}과 바뀐 것이 없습니다. 문구를 먼저 고쳐 공개해 주세요`);
  const v: LegalVersion = { id: `${kind}-${now.getTime()}`, kind, from, at: now.toISOString(), by: actor.id, doc };
  const keep = all.filter((x) => !(x.kind === kind && x.from > today));
  await save(db, [v, ...keep], actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "site.legal", entityType: "app_config", entityId: KEY, after: { kind, from, replaced: st.next?.from ?? null } });
  return v;
}

/** 시행 전인 판 거두기 */
export async function cancelLegal(db: Db, actor: Actor, id: string, today: string, now = new Date()) {
  mustOwner(actor);
  const all = await legalVersions(db);
  const v = all.find((x) => x.id === id);
  if (!v) throw new SiteError("그 판을 찾지 못했습니다");
  if (v.from <= today) throw new SiteError("이미 시행한 판은 거둘 수 없습니다. 고친 새 판을 시행해 주세요");
  await save(
    db,
    all.filter((x) => x.id !== id),
    actor.id,
    now,
  );
  await writeAudit(db, { actorId: actor.id, action: "site.legal_cancel", entityType: "app_config", entityId: KEY, after: { kind: v.kind, from: v.from } });
}

export const title = (k: LegalKind) => LEGAL_KINDS.find((x) => x.kind === k)!.title;
