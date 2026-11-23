// 협력업체 휴·폐업 자동 확인(국세청 사업자등록 상태조회, 공공데이터포털)
// 폐업·휴업한 업체가 발급한 세금계산서는 매입세액 공제를 못 받을 수 있다. 그래서
//  · 업체를 등록하거나 사업자등록번호를 바꾸면 바로, 상세 화면 '국세청 확인' 단추로 언제든,
//  · 매달 1일 거래 중인 업체 전부를, 아직 한 번도 못 받은 업체는 매일(인증키 승인 뒤 저절로) 확인한다.
//  · 휴·폐업·없는 번호가 새로 나오면 대표·회계 담당에게 알리고, 확인할 때까지 할 일에 남긴다.
//  · 지급 결의·거래처 원장·발주서 세금계산서·통장/홈택스 매입 세금계산서 화면에 경고를 띄운다.
// 인증키가 없거나 승인 전(401·403)이어도 오류를 내지 않고 '못 받음'만 적어 두고 넘어간다.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { supplier, type SupplierNts } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { dataGoKrKey, NTS_GUIDE } from "@/modules/platform/biz-reg";
import { UserError } from "@/modules/platform/errors";
import { apiReason, normalizeKey } from "@/modules/platform/holidays";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";

export type { SupplierNts };
export const NTS_STATUS_API = "https://api.odcloud.kr/api/nts-businessman/v1/status";
export { NTS_GUIDE };

/** 거래 중으로 보는 업체(매달 다시 확인·할 일 대상) */
export const NTS_ACTIVE = ["registered", "proposed", "candidate"] as const;
/** 다시 확인하지 않고 그대로 쓰는 기간(지급 결의 화면을 열 때) */
export const NTS_FRESH_DAYS = 7;

type Actor = { id: string; roles: Role[] };
type Parsed = Pick<SupplierNts, "cd" | "status" | "taxType" | "taxTypeCd" | "endDt">;

const ymd = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : "");

/** 상태조회 응답을 번호(숫자 10자리)별로 읽는다. 형식이 다르면 null */
export function parseNtsStatus(body: unknown): Map<string, Parsed> | null {
  const b = body as { status_code?: string; data?: { b_no?: string; b_stt?: string; b_stt_cd?: string; tax_type?: string; tax_type_cd?: string; end_dt?: string }[] };
  if (!b || b.status_code !== "OK" || !Array.isArray(b.data)) return null;
  const out = new Map<string, Parsed>();
  for (const d of b.data) {
    const no = String(d.b_no ?? "").replace(/\D/g, "");
    if (no.length !== 10) continue;
    const c = d.b_stt_cd ?? "";
    const cd: Parsed["cd"] = c === "01" || c === "02" || c === "03" ? c : "none";
    out.set(no, {
      cd,
      status: cd === "none" ? "국세청에 등록되지 않은 번호" : (d.b_stt ?? ""),
      taxType: cd === "none" ? "" : (d.tax_type ?? ""),
      taxTypeCd: d.tax_type_cd ?? "",
      endDt: ymd(d.end_dt ?? ""),
    });
  }
  return out;
}

/** 휴업·폐업·없는 번호 */
export const ntsBad = (n: SupplierNts | null | undefined): boolean => !!n && (n.cd === "02" || n.cd === "03" || n.cd === "none");

/** 짧은 이름(배지) */
export function ntsLabel(n: SupplierNts | null | undefined): string {
  if (!n || !n.cd) return "";
  if (n.cd === "01") return "계속사업자";
  if (n.cd === "02") return `휴업${n.endDt ? `(${n.endDt}부터)` : ""}`;
  if (n.cd === "03") return `폐업${n.endDt ? `(${n.endDt})` : ""}`;
  return "국세청에 없는 번호";
}

/**
 * 돈을 주거나 세금계산서를 처리할 때 띄울 경고. 괜찮으면 null.
 * on(거래·발급일)을 주면 폐업일 전 거래인지도 알려 준다.
 */
export function ntsWarning(name: string, n: SupplierNts | null | undefined, on?: string | null): string | null {
  if (!ntsBad(n)) return null;
  const x = n!;
  if (x.cd === "03") {
    const before = on && x.endDt && on < x.endDt;
    return `${name}: 국세청 조회 결과 폐업한 업체입니다${x.endDt ? `(폐업일 ${x.endDt})` : ""}. ${
      before ? `이 건(${on})은 폐업일 전 거래라 그때 받은 세금계산서는 공제할 수 있지만, ` : ""
    }폐업일 뒤에 발급된 세금계산서는 매입세액 공제를 받을 수 없습니다. 돈을 주기 전에 업체에 확인하세요`;
  }
  if (x.cd === "02")
    return `${name}: 국세청 조회 결과 휴업 중인 업체입니다${x.endDt ? `(${x.endDt}부터)` : ""}. 휴업 기간에 발급된 세금계산서는 매입세액 공제가 안 될 수 있으니, 돈을 주기 전에 업체에 확인하세요`;
  return `${name}: 사업자등록번호가 국세청에 등록되지 않은 번호로 나옵니다. 등록증과 번호를 다시 맞춰 보세요. 틀린 번호로 받은 세금계산서는 공제가 안 될 수 있습니다`;
}

const UA = "Mozilla/5.0 (compatible; auto-body-shop/1.0)";

export type NtsRun = { ok: boolean; checked: number; bad: { id: string; name: string; label: string }[]; message: string };

/**
 * 국세청에 업체 상태를 물어 저장한다. ids 를 주면 그 업체만, 없으면 거래 중인 업체 전부(번호 있는 것).
 * 인증키 없음·승인 전·접속 실패는 오류를 내지 않고 각 업체에 tryAt·tryMsg 만 적는다.
 * 새로 휴·폐업·없는 번호가 나오면 대표·회계 담당에게 알린다.
 */
export async function checkSuppliersNts(
  db: Db,
  opts: { ids?: string[]; now?: Date; f?: typeof fetch; actorId?: string | null; timeoutMs?: number } = {},
): Promise<NtsRun> {
  const now = opts.now ?? new Date();
  const where = opts.ids
    ? and(inArray(supplier.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]), isNotNull(supplier.bizNo))
    : and(inArray(supplier.status, [...NTS_ACTIVE]), isNotNull(supplier.bizNo));
  const rows = (await db.select({ id: supplier.id, name: supplier.name, bizNo: supplier.bizNo, nts: supplier.nts }).from(supplier).where(where)).filter(
    (r) => (r.bizNo ?? "").replace(/\D/g, "").length === 10,
  );
  if (!rows.length) return { ok: true, checked: 0, bad: [], message: "확인할 업체 없음(사업자등록번호가 있는 업체만 확인합니다)" };

  const failAll = async (why: string): Promise<NtsRun> => {
    for (const r of rows) {
      const base: SupplierNts = r.nts ?? { cd: "", status: "", taxType: "", taxTypeCd: "", endDt: "", at: "", since: "" };
      await db.update(supplier).set({ nts: { ...base, tryAt: now.toISOString(), tryMsg: why } }).where(eq(supplier.id, r.id));
    }
    return { ok: false, checked: 0, bad: [], message: why };
  };

  const key = await dataGoKrKey(db);
  if (!key) return failAll("공공데이터포털 인증키가 없습니다(설정 › 영업일·휴무일에 넣고, 같은 키로 '국세청_사업자등록정보 진위확인 및 상태조회 서비스'를 활용신청)");

  const got = new Map<string, Parsed>();
  for (let i = 0; i < rows.length; i += 100) {
    const nos = rows.slice(i, i + 100).map((r) => r.bizNo!.replace(/\D/g, ""));
    let why = "";
    try {
      const res = await (opts.f ?? fetch)(`${NTS_STATUS_API}?${new URLSearchParams({ serviceKey: normalizeKey(key) })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
        body: JSON.stringify({ b_no: nos }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      const text = await res.text();
      let parsed: Map<string, Parsed> | null = null;
      if (res.ok) {
        try {
          parsed = parseNtsStatus(JSON.parse(text));
        } catch {
          parsed = null;
        }
      }
      if (parsed) for (const [k, v] of parsed) got.set(k, v);
      else
        why = `국세청 응답 ${res.status} ${apiReason(text)}${
          res.status === 401 || res.status === 403 || /등록되지 않은|NOT_REGISTERED/i.test(text) ? " — 인증키가 아직 승인 전이거나 이 서비스를 활용신청하지 않았습니다" : ""
        }`;
    } catch (e) {
      why = `국세청에 접속하지 못함(${e instanceof Error ? e.message : String(e)})`;
    }
    if (why) return failAll(why);
  }

  const bad: NtsRun["bad"] = [];
  let checked = 0;
  for (const r of rows) {
    const p = got.get(r.bizNo!.replace(/\D/g, ""));
    if (!p) continue;
    checked++;
    const prev = r.nts;
    const same = !!prev && prev.cd === p.cd;
    const next: SupplierNts = {
      ...p,
      at: now.toISOString(),
      since: same && prev!.since ? prev!.since : now.toISOString(),
      ...(same && prev!.ackAt ? { ackAt: prev!.ackAt, ackBy: prev!.ackBy, ackNote: prev!.ackNote } : {}),
    };
    await db.update(supplier).set({ nts: next }).where(eq(supplier.id, r.id));
    if (ntsBad(next)) bad.push({ id: r.id, name: r.name, label: ntsLabel(next) });
    if (!same && (prev?.cd || ntsBad(next)))
      await writeAudit(db, { actorId: opts.actorId ?? null, action: "supplier.nts", entityType: "supplier", entityId: r.id, before: { status: prev?.status ?? "" }, after: { status: next.status, endDt: next.endDt } });
    if (!same && ntsBad(next)) {
      const title = `협력업체 ${ntsLabel(next)}: ${r.name} — 국세청 조회 결과입니다. 대금 지급·세금계산서 처리 전에 확인하세요`;
      for (const role of ["owner", "accounting"] as const) await notifyRole(db, role, title, `sup-nts-${r.id}-${next.cd}-${seoulDate(now)}`, `/suppliers/${r.id}#nts`);
    }
  }
  const msg = `국세청 확인 ${checked}곳${bad.length ? ` · 휴·폐업 등 ${bad.length}곳(${bad.map((b) => `${b.name} ${b.label}`).join(", ")})` : " · 모두 계속사업자"}`;
  return { ok: true, checked, bad, message: msg };
}

/** 매일 작업: 매달 1일은 거래 중인 업체 전부, 그 밖의 날은 아직 한 번도 못 받은 업체만(하루 한 번) */
export async function supplierNtsDaily(db: Db, now = new Date(), f?: typeof fetch): Promise<string> {
  const today = seoulDate(now);
  if (today.slice(8) === "01") {
    const r = await checkSuppliersNts(db, { now, f });
    return `협력업체 ${r.ok ? r.message : `국세청 확인 못 함: ${r.message}`}`;
  }
  const rows = await db.select({ id: supplier.id, nts: supplier.nts, bizNo: supplier.bizNo }).from(supplier).where(and(inArray(supplier.status, [...NTS_ACTIVE]), isNotNull(supplier.bizNo)));
  const todo = rows.filter((r) => !r.nts?.at && !(r.nts?.tryAt && seoulDate(new Date(r.nts.tryAt)) === today)).map((r) => r.id);
  if (!todo.length) return "협력업체 국세청 확인 시기 아님";
  const r = await checkSuppliersNts(db, { ids: todo, now, f });
  return `협력업체 ${r.ok ? r.message : `국세청 확인 못 함: ${r.message}`}`;
}

/** 지급 결의 화면을 열 때: 결과가 7일보다 오래됐으면 다시 묻는다(오늘 이미 못 받았으면 묻지 않음). 실패해도 조용히 */
export async function freshenSupplierNts(db: Db, id: string, now = new Date(), f?: typeof fetch): Promise<SupplierNts | null> {
  const [r] = await db.select({ nts: supplier.nts, bizNo: supplier.bizNo }).from(supplier).where(eq(supplier.id, id));
  if (!r) return null;
  const n = r.nts;
  const old = !n?.at || now.getTime() - new Date(n.at).getTime() > NTS_FRESH_DAYS * 86_400_000;
  const triedToday = !!n?.tryAt && seoulDate(new Date(n.tryAt)) === seoulDate(now);
  if (old && !triedToday && (r.bizNo ?? "").replace(/\D/g, "").length === 10) {
    await checkSuppliersNts(db, { ids: [id], now, f, timeoutMs: 6_000 }).catch(() => null);
    const [again] = await db.select({ nts: supplier.nts }).from(supplier).where(eq(supplier.id, id));
    return again?.nts ?? null;
  }
  return n ?? null;
}

/** 휴·폐업을 회계 담당·대표가 확인함(업체와 통화·거래 중지 여부 판단). 할 일에서 빠진다 */
export async function ackSupplierNts(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!can(actor, "supplier.bank")) throw new UserError("휴·폐업 확인은 회계 담당·대표가 합니다");
  const [r] = await db.select({ nts: supplier.nts }).from(supplier).where(eq(supplier.id, id));
  if (!r) throw new UserError("협력업체를 찾을 수 없습니다");
  if (!ntsBad(r.nts)) throw new UserError("휴·폐업으로 나온 업체가 아닙니다");
  const text = note.trim().slice(0, 200);
  if (!text) throw new UserError("어떻게 확인했고 어떻게 할지 적어 주세요");
  await db.update(supplier).set({ nts: { ...r.nts!, ackAt: now.toISOString(), ackBy: actor.id, ackNote: text } }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: "supplier.nts_ack", entityType: "supplier", entityId: id, after: { status: r.nts!.status, note: text } });
}

/** 할 일(회계 담당·대표): 휴·폐업·없는 번호로 나왔고 아직 확인 안 한 거래 중 업체 */
export async function supplierNtsTodos(db: Db, actor: Actor) {
  if (!can(actor, "supplier.bank")) return [];
  const rows = await db.select({ id: supplier.id, name: supplier.name, nts: supplier.nts }).from(supplier).where(inArray(supplier.status, [...NTS_ACTIVE]));
  return rows
    .filter((r) => ntsBad(r.nts) && !r.nts!.ackAt)
    .map((r) => ({
      key: `sup-nts-${r.id}-${r.nts!.cd}`,
      when: "today" as const,
      what: `협력업체 ${ntsLabel(r.nts)}: ${r.name}`,
      detail: "국세청 조회 결과 — 업체에 확인하고, 거래를 이어 갈지 정하세요(세금계산서 공제 주의)",
      href: `/suppliers/${r.id}#nts`,
      action: "확인하기",
    }));
}

/** 경고용: 업체 id → 상태 */
export async function ntsOfSuppliers(db: Db, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, { name: string; nts: SupplierNts | null }>();
  const rows = await db.select({ id: supplier.id, name: supplier.name, nts: supplier.nts }).from(supplier).where(inArray(supplier.id, list));
  return new Map(rows.map((r) => [r.id, { name: r.name, nts: r.nts }]));
}

/** 경고용: 사업자등록번호(숫자만) → 휴·폐업 업체(통장·홈택스 매입 세금계산서 줄) */
export async function badSuppliersByBizNo(db: Db) {
  const rows = await db.select({ id: supplier.id, name: supplier.name, bizNo: supplier.bizNo, nts: supplier.nts }).from(supplier).where(isNotNull(supplier.nts));
  return new Map(rows.filter((r) => ntsBad(r.nts) && r.bizNo).map((r) => [r.bizNo!.replace(/\D/g, ""), { id: r.id, name: r.name, nts: r.nts! }]));
}
