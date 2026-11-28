// 세법·보험 법령 개정 감시(제안서 4단계 "정책값 자동 갱신").
// 법제처 국가법령정보 공동활용 Open API(lawSearch.do)로 매달 1일 아래 법령의 최근 공포일·시행일을 보고,
// 지난번과 달라졌으면 대표·회계에게 "정책값을 확인하세요" 할 일과 알림을 남긴다.
// 세율·요율 숫자를 법령 본문에서 자동으로 뽑아 바꾸지는 않는다(조문 형식이 해마다 달라 잘못 바꿀 위험이 큼).
// API 사용자 ID(OC)는 대표가 세금·절세 화면에서 넣고 암호화해 둔다. 응답 형식은 개발 환경에서 접속이 막혀 실제로 시험하지 못했다 [확인 필요].
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, legalItem } from "@/db/schema";
import { officialLawNames } from "@/modules/quality/legal-rules";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { LEGAL_BASIS, pickValue } from "@/modules/platform/policy-meta";
import { changePolicy, DEFAULT_POLICY, isPolicyKey, loadPolicy, type PolicyKey } from "@/modules/platform/policy";

export const LAW_API = "https://www.law.go.kr/DRF/lawSearch.do";
/** 법령 본문(조문) 조회 */
export const LAW_SERVICE = "https://www.law.go.kr/DRF/lawService.do";
export const LAW_API_GUIDE = "https://open.law.go.kr/LSO/openApi/guideList.do";
const CFG = "law.watch";

/** 지켜보는 법령과, 바뀌면 확인할 정책값 */
export const WATCHED_LAWS: { name: string; keys: string[] }[] = [
  { name: "소득세법", keys: ["tax.childcare_exempt", "tax.meal_exempt", "tax.discount_exempt", "tax.ot_exempt_annual", "tax.cash_receipt_must"] },
  { name: "소득세법 시행령", keys: ["tax.table_pension_rate", "tax.child_one", "tax.child_two", "tax.child_more", "tax.ot_exempt_pay_cap", "tax.ot_exempt_prev_gross", "tax.ot_exempt_annual", "tax.group_ins_exempt", "tax.car_exempt"] },
  { name: "조세특례제한법", keys: [] },
  { name: "법인세법", keys: ["money.entertain_base", "tax.car_dep_cap"] },
  { name: "법인세법 시행령", keys: ["money.event_client_max", "tax.simple_receipt_max", "tax.car_expense_cap", "asset.immediate_max"] },
  { name: "국민연금법", keys: ["ins.pension_rate"] },
  { name: "국민연금법 시행령", keys: ["ins.pension_rate", "ins.pension_cap", "ins.pension_floor"] },
  { name: "국민건강보험법 시행령", keys: ["ins.health_rate"] },
  { name: "노인장기요양보험법 시행령", keys: ["ins.ltc_ratio"] },
  { name: "고용보험법 시행령", keys: ["ins.employment_rate", "ins.employment_employer_rate"] },
  { name: "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령", keys: ["ins.employment_rate", "ins.employment_employer_rate", "ins.durunuri_pay_cap"] },
];

export type LawStamp = { promulgated: string; effective: string; /** 법령일련번호(본문 조회용) */ mst?: string };
/** 법령이 바뀌어 근거 조문에서 읽은 새 값 후보(value 없으면 숫자를 못 읽어 직접 확인할 것) */
export type PolicyCandidate = { key: string; law: string; effective: string; on: string; value?: number; current: number };
/** 법규 대장 법령 개정 감지(2026-11-21): 바뀐 법령과 감지한 날. 대장의 그 법령 줄을 감지일 이후에 '개정 확인'하면 할 일에서 빠진다 */
/** 법규 대장(대상·확인 필요 줄)의 정식 법령명 */
export async function legalLawNames(db: Db) {
  const rows = await db.select({ n: legalItem.lawName, a: legalItem.applies }).from(legalItem).where(eq(legalItem.active, true));
  return [...new Set(rows.filter((r) => r.a !== "no").flatMap((r) => officialLawNames(r.n)))];
}

export type LegalLawChange = { name: string; promulgated: string; effective: string; on: string };

type Cfg = {
  legalSeen?: Record<string, LawStamp>;
  legalPending?: LegalLawChange[];
  keyEnc?: string | null;
  seen?: Record<string, LawStamp>;
  pending?: { name: string; promulgated: string; effective: string }[];
  candidates?: PolicyCandidate[];
  lastAt?: string | null;
  lastStatus?: string | null;
  lastMessage?: string | null;
};

async function loadCfg(db: Db): Promise<Cfg> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, CFG));
  return (r?.data ?? {}) as Cfg;
}
async function saveCfg(db: Db, data: Cfg, actorId: string | null) {
  await db
    .insert(appConfig)
    .values({ key: CFG, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
}

export async function lawWatchStatus(db: Db) {
  const c = await loadCfg(db);
  return {
    hasKey: !!c.keyEnc,
    lastAt: c.lastAt ?? null,
    lastStatus: c.lastStatus ?? null,
    lastMessage: c.lastMessage ?? null,
    seen: c.seen ?? {},
    pending: c.pending ?? [],
    legalPending: c.legalPending ?? [],
    candidates: c.candidates ?? [],
  };
}

export async function saveLawKey(db: Db, actor: { id: string; roles: string[] }, key: string) {
  if (!actor.roles.includes("owner")) throw new UserError("법령 개정 알림 설정은 대표만 바꿉니다");
  const k = key.trim();
  if (k && !/^[A-Za-z0-9._-]{2,40}$/.test(k)) throw new UserError("법제처 Open API 신청 때 받은 OC 값(이메일 @ 앞부분)을 넣어 주세요");
  const c = await loadCfg(db);
  await saveCfg(db, { ...c, keyEnc: k ? encrypt(k) : null }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: k ? "law.key.set" : "law.key.clear", entityType: "config", entityId: CFG });
}

/** 확인했음: 쌓인 개정 알림을 비운다(대표·회계) */
export async function ackLawChanges(db: Db, actor: { id: string }) {
  const c = await loadCfg(db);
  if (!c.pending?.length) return;
  await saveCfg(db, { ...c, pending: [] }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "law.ack", entityType: "config", entityId: CFG, after: { laws: c.pending.map((p) => p.name) } });
}

const d8 = (s: unknown) => {
  const t = String(s ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : "";
};

/** lawSearch.do JSON 에서 이름이 꼭 맞는 법령의 가장 최근 공포일·시행일. 형식이 다르면 null */
export function parseLawSearch(body: unknown, name: string, loose = false): LawStamp | null {
  const k = (s: string) => (loose ? s.replace(/[\s·ㆍ]/g, "") : s);
  const root = (body as { LawSearch?: { law?: unknown } })?.LawSearch;
  if (!root) return null;
  const list = (Array.isArray(root.law) ? root.law : root.law ? [root.law] : []) as Record<string, unknown>[];
  let best: LawStamp | null = null;
  for (const l of list) {
    if (k(String(l["법령명한글"] ?? "").trim()) !== k(name)) continue;
    const mst = String(l["법령일련번호"] ?? "").trim();
    const s: LawStamp = { promulgated: d8(l["공포일자"]), effective: d8(l["시행일자"]), ...(mst ? { mst } : {}) };
    if (!s.promulgated) continue;
    if (!best || s.promulgated > best.promulgated || (s.promulgated === best.promulgated && s.effective > best.effective)) best = s;
  }
  return best;
}

export type LawWatchResult = { status: "skipped" | "nokey" | "done" | "failed"; message: string; changed?: string[] };

/** 매달 1일(또는 '지금 확인'). 처음 한 번은 기준만 저장하고 알리지 않는다 */
export async function checkLaws(
  db: Db,
  now = new Date(),
  opts: { force?: boolean; actorId?: string | null; f?: typeof fetch; /** 법규 대장 법령의 정식 이름들 */ legalNames?: string[] } = {},
): Promise<LawWatchResult> {
  const today = seoulDate(now);
  if (!opts.force && today.slice(8) !== "01") return { status: "skipped", message: "법령 확인 시기 아님" };
  const cfg = await loadCfg(db);
  const finish = async (r: LawWatchResult, extra: Partial<Cfg> = {}) => {
    await saveCfg(db, { ...cfg, ...extra, lastAt: now.toISOString(), lastStatus: r.status, lastMessage: r.message }, opts.actorId ?? null);
    return r;
  };
  if (!cfg.keyEnc) return finish({ status: "nokey", message: "법제처 Open API OC 값이 없음" });
  let oc: string;
  try {
    oc = decrypt(cfg.keyEnc);
  } catch {
    return finish({ status: "failed", message: "저장된 OC 값을 읽지 못함(다시 넣어 주세요)" });
  }
  const f = opts.f ?? fetch;
  const found: Record<string, LawStamp> = {};
  for (const law of WATCHED_LAWS) {
    const qs = new URLSearchParams({ OC: oc, target: "law", type: "JSON", query: law.name, display: "20" });
    let body: unknown;
    try {
      const res = await f(`${LAW_API}?${qs}`, { signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      if (!res.ok) return finish({ status: "failed", message: `국가법령정보 응답 ${res.status}(${law.name})` });
      body = JSON.parse(text);
    } catch (e) {
      return finish({ status: "failed", message: `국가법령정보 접속 안 됨(${law.name}: ${e instanceof Error ? e.message : String(e)})` });
    }
    const s = parseLawSearch(body, law.name);
    if (!s) return finish({ status: "failed", message: `${law.name}을 찾지 못함(OC 값·신청 승인 확인)` });
    found[law.name] = s;
  }
  // 법규 대장(F-Q-06) 법령도 같이 본다. 못 찾은 이름(줄임말 등)은 건너뛰고, 처음 본 법령은 기준만 저장한다
  const legalFound: Record<string, LawStamp> = { ...(cfg.legalSeen ?? {}) };
  const legalChanged: LegalLawChange[] = [];
  for (const name of opts.legalNames ?? (await legalLawNames(db))) {
    const qs = new URLSearchParams({ OC: oc, target: "law", type: "JSON", query: name, display: "20" });
    try {
      const res = await f(`${LAW_API}?${qs}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const st = parseLawSearch(JSON.parse(await res.text()), name, true);
      if (!st) continue;
      const before = cfg.legalSeen?.[name];
      if (before && (before.promulgated !== st.promulgated || before.effective !== st.effective)) legalChanged.push({ name, ...st, on: today });
      legalFound[name] = st;
    } catch {
      continue;
    }
  }
  const legalPending = [...(cfg.legalPending ?? []).filter((p) => !legalChanged.some((c) => c.name === p.name)), ...legalChanged];
  if (legalChanged.length) {
    await writeAudit(db, { actorId: opts.actorId ?? null, action: "law.legalChanged", entityType: "config", entityId: CFG, after: { changed: legalChanged.map((c) => c.name) } });
    for (const role of ["safety", "owner"] as const)
      await notifyRole(db, role, `법규 대장 법령이 바뀌었습니다: ${legalChanged.map((c) => c.name).join(", ")}. 영향을 보고 개정 확인을 기록하세요`, `legal-law-${today}-${role}`, "/legal/revcheck");
  }
  const first = !cfg.seen || !Object.keys(cfg.seen).length;
  const changed = first
    ? []
    : WATCHED_LAWS.filter((l) => {
        const a = cfg.seen?.[l.name];
        const b = found[l.name];
        return !a || a.promulgated !== b.promulgated || a.effective !== b.effective;
      }).map((l) => l.name);
  const pending = [...(cfg.pending ?? []).filter((p) => !changed.includes(p.name)), ...changed.map((name) => ({ name, ...found[name] }))];
  // 바뀐 법령의 근거 조문에서 정책값 숫자를 읽어 '새 값 후보'로 둔다(대표가 적용). 못 읽으면 직접 확인 후보
  let candidates = cfg.candidates ?? [];
  if (changed.length) {
    const pol = await loadPolicy(db, today);
    for (const name of changed) {
      const st = found[name];
      for (const [k, b] of Object.entries(LEGAL_BASIS)) {
        if (!b || b.law !== name || b.via !== "law" || !isPolicyKey(k)) continue;
        let value: number | null = null;
        if (b.jo && st.mst) {
          const [n, g] = b.jo.split("의");
          const qs = new URLSearchParams({ OC: oc, target: "law", type: "JSON", MST: st.mst, JO: `${n.padStart(4, "0")}${(g ?? "0").padStart(2, "0")}` });
          try {
            const res = await f(`${LAW_SERVICE}?${qs}`, { signal: AbortSignal.timeout(20_000) });
            if (res.ok) value = pickValue(k, lawText(JSON.parse(await res.text())));
          } catch {
            value = null;
          }
        }
        const current = pol[k];
        if (value === current) continue;
        candidates = [...candidates.filter((c) => c.key !== k), { key: k, law: name, effective: st.effective || today, on: today, current, ...(value != null ? { value } : {}) }];
      }
    }
  }
  if (changed.length) {
    await writeAudit(db, { actorId: opts.actorId ?? null, action: "law.changed", entityType: "config", entityId: CFG, after: { changed } });
    for (const role of ["owner", "accounting"] as const)
      await notifyRole(db, role, `세법·보험 법령이 바뀌었습니다: ${changed.join(", ")}. 세금·절세 화면에서 정책값을 확인하세요`, `law-changed-${today}-${role}`, "/money/tax#law");
  }
  return finish(
    { status: "done", changed, message: first ? `기준 저장(${WATCHED_LAWS.length}개 법령)` : changed.length ? `바뀐 법령: ${changed.join(", ")}` : "바뀐 법령 없음" },
    { seen: found, pending, legalSeen: legalFound, legalPending, candidates },
  );
}

/** 대표·회계 할 일: 바뀐 법령이 있으면, 또는 대표에게 확인 실패를 알림 */
export async function lawTodos(db: Db, actor: { roles: string[] }) {
  const s = await lawWatchStatus(db);
  const out: { key: string; when: "today" | "soon" | "setup"; what: string; detail: string; href: string; action: string }[] = [];
  if (s.pending.length)
    out.push({
      key: "law-changed",
      when: "today",
      what: `세법·보험 법령 개정 ${s.pending.length}건 — 정책값을 확인하세요`,
      detail: s.pending.map((p) => `${p.name}(${p.promulgated} 공포, ${p.effective} 시행)`).join(", "),
      href: "/money/tax#law",
      action: "확인",
    });
  if (actor.roles.includes("owner") && s.hasKey && s.lastStatus === "failed")
    out.push({ key: "law-failed", when: "soon", what: "법령 개정 확인이 실패했습니다", detail: s.lastMessage ?? "", href: "/money/tax#law", action: "보기" });
  return out;
}

/** 법령이 바뀌면 확인할 정책값 목록 */
export function keysFor(names: string[]) {
  return [...new Set(WATCHED_LAWS.filter((l) => names.includes(l.name)).flatMap((l) => l.keys))];
}

/** 조문 JSON(lawService.do)의 글자를 모두 이어 붙인다(형식이 조금 달라도 읽히게) */
export function lawText(body: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(body);
  return out.join(" ").replace(/\s+/g, " ");
}

/** 새 값 후보 적용(대표): 법령 시행일(지났으면 오늘)부터 그 값으로. value 를 넘기면 그 값(직접 확인 후보) */
export async function applyCandidate(db: Db, actor: { id: string; roles: string[] }, key: string, value?: number, today = seoulDate()) {
  if (!actor.roles.includes("owner")) throw new UserError("정책값은 대표만 바꿉니다");
  const c = await loadCfg(db);
  const cand = (c.candidates ?? []).find((x) => x.key === key);
  if (!cand || !isPolicyKey(key)) throw new UserError("이미 처리한 후보입니다");
  const v = value ?? cand.value;
  if (v == null) throw new UserError("조문에서 숫자를 읽지 못한 후보입니다. 조문을 보고 값을 적어 주세요");
  const k: PolicyKey = key;
  await changePolicy(db, actor.id, { key: k, value: v, effectiveFrom: cand.effective > today ? cand.effective : today, reason: `${cand.law} 개정(${cand.effective} 시행)에 따라 ${LEGAL_BASIS[k]?.article ?? ""}` }, today);
  await saveCfg(db, { ...c, candidates: (c.candidates ?? []).filter((x) => x.key !== key) }, actor.id);
}

/** 후보 넘기기(값이 그대로라고 확인함) */
export async function dismissCandidate(db: Db, actor: { id: string; roles: string[] }, key: string) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("accounting")) throw new UserError("대표·회계 담당만 처리합니다");
  const c = await loadCfg(db);
  await saveCfg(db, { ...c, candidates: (c.candidates ?? []).filter((x) => x.key !== key) }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "law.candidate.dismiss", entityType: "policy", entityId: key });
}

/** 대표·회계 할 일: 새 값 후보 */
export async function candidateTodos(db: Db, actor: { roles: string[] }) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("accounting")) return [];
  const s = await lawWatchStatus(db);
  return s.candidates.map((c) => {
    const def = isPolicyKey(c.key) ? DEFAULT_POLICY[c.key] : null;
    return {
      key: `policy-cand-${c.key}-${c.on}`,
      when: "today" as const,
      what: c.value != null ? `새 값 후보: ${def?.label ?? c.key} ${c.current.toLocaleString("ko-KR")} → ${c.value.toLocaleString("ko-KR")}` : `법령 개정 확인: ${def?.label ?? c.key}`,
      detail: `${c.law} ${c.effective} 시행${c.value == null ? " · 조문에서 숫자를 읽지 못해 직접 확인" : ""}`,
      href: `/settings/policies?key=${encodeURIComponent(c.key)}`,
      action: actor.roles.includes("owner") ? (c.value != null ? "적용" : "확인") : "보기",
    };
  });
}
