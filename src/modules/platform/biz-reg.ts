// 사업자등록증(대표 결정 2026-11-20 "추천안대로, 주민번호 없이").
// - 등록증 파일(PDF·사진)은 암호화해 두고 대표·회계만 연다. 새로 받으면 예전 것은 이력으로 남긴다.
// - 등록증에 적힌 칸을 등록증 순서대로 받는다. 상호·대표자·번호·주소는 사업장 정보(shop) 칸을 그대로 쓰고,
//   개업일·법인등록번호·사업 형태는 세금 설정(tax)에 바로 넣어 두 번 넣지 않게 한다.
// - 개인은 등록증에 적힌 생년월일만 받는다. 주민등록번호는 앱에 필요한 곳이 없어 받지 않는다(개인정보보호법 제24조의2).
// - 국세청 '사업자등록정보 진위확인 및 상태조회'(공공데이터포털)로 번호·대표자·개업일이 맞는지 보고 과세 유형·영업 상태를 받는다.
//   인증키는 공휴일(특일 정보)에 넣은 공공데이터포털 키를 같이 쓴다. 매달 1일 다시 확인해 과세 유형·상태가 바뀌면 대표에게 알린다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { decrypt, decryptBytes, encryptBytes } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { apiReason, normalizeKey } from "./holidays";
import { notifyRole } from "./notify";
import { loadShopInfo } from "./shop";
import { MAX_DOC_BYTES, readStored, sniffDoc, storeFile } from "./storage";
import { seoulDate } from "./time";

const KEY = "bizreg";
const TAX_KEY = "tax";
type Actor = { id: string; roles: Role[] };

/** 등록증 제목의 괄호 안(개인: 일반과세자·간이과세자·면세사업자, 법인: 법인사업자) */
export const REG_KINDS = {
  general: "개인 · 일반과세자",
  simple: "개인 · 간이과세자",
  exempt: "개인 · 면세사업자",
  corporate: "법인사업자",
} as const;
export type RegKind = keyof typeof REG_KINDS;
export const isRegKind = (s: string): s is RegKind => s in REG_KINDS;
/** 부가세 과세 유형(신고 일정에 씀) */
export type VatKind = "general" | "simple" | "exempt";
export const vatKindOf = (k: RegKind | ""): VatKind | null => (k === "corporate" ? "general" : k || null);
export const formOfKind = (k: RegKind | ""): "individual" | "corporate" | "" => (k === "corporate" ? "corporate" : k ? "individual" : "");

export type RegFile = { path: string; fileName: string; mime: string; size: number; at: string; by: string };
export type NtsCheck = {
  at: string;
  /** 번호·대표자·개업일이 국세청 자료와 맞나(키가 없거나 실패면 null) */
  valid: boolean | null;
  /** 계속사업자·휴업자·폐업자 */
  status: string;
  statusCd: string;
  /** 국세청이 알려 준 과세 유형 글(예: 부가가치세 간이과세자) */
  taxType: string;
  taxTypeCd: string;
  endDt: string;
  message: string;
};

export type BizReg = {
  kind: RegKind | "";
  /** 개인만. 등록증의 생년월일(청년 창업 여부 계산) */
  birth: string;
  bizType: string;
  bizItem: string;
  /** 법인만. 본점 소재지(사업장과 다를 때) */
  hqAddress: string;
  /** 공동사업자 이름(있을 때만) */
  coOwners: string;
  /** 사업자 단위 과세 적용 사업자 여부 */
  unitTax: boolean;
  invoiceEmail: string;
  issuedOn: string;
  taxOffice: string;
  /** 새 것이 앞 */
  files: RegFile[];
  nts: NtsCheck | null;
};
export const EMPTY_REG: BizReg = { kind: "", birth: "", bizType: "", bizItem: "", hqAddress: "", coOwners: "", unitTax: false, invoiceEmail: "", issuedOn: "", taxOffice: "", files: [], nts: null };

export async function loadBizReg(db: Db): Promise<BizReg> {
  const [cfg] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return { ...EMPTY_REG, ...((cfg?.data ?? {}) as Partial<BizReg>) };
}

async function put(db: Db, key: string, data: unknown, actorId: string | null, now = new Date()) {
  await db
    .insert(appConfig)
    .values({ key, data, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: now } });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BizRegInput = {
  kind: string;
  openedOn: string;
  birth: string;
  corpRegNo: string;
  bizType: string;
  bizItem: string;
  hqAddress: string;
  coOwners: string;
  unitTax: boolean;
  invoiceEmail: string;
  issuedOn: string;
  taxOffice: string;
};

/** 만 나이(그날 기준) */
export function ageOn(birth: string, on: string): number | null {
  if (!DATE.test(birth) || !DATE.test(on)) return null;
  let a = Number(on.slice(0, 4)) - Number(birth.slice(0, 4));
  if (on.slice(5) < birth.slice(5)) a -= 1;
  return a;
}

/**
 * 생년월일과 개업일로 '창업 때 청년(15~34세)' 짐작. 병역을 마쳤으면 그 기간(최대 6년)만큼 늘어나서
 * 35~40세는 병역 기간에 따라 달라 답을 정하지 않는다.
 */
export function youthGuess(birth: string, openedOn: string): { value: boolean | null; why: string } | null {
  const a = ageOn(birth, openedOn);
  if (a == null) return null;
  if (a <= 34) return { value: true, why: `개업일에 만 ${a}세` };
  if (a <= 40) return { value: null, why: `개업일에 만 ${a}세 — 병역을 마쳤으면 그 기간(최대 6년)을 빼고 34세 이하인지 보세요` };
  return { value: false, why: `개업일에 만 ${a}세` };
}

/** 등록증 내용 저장. 사업 형태·개업일·법인등록번호는 세금 설정에 넣는다(대표만) */
export async function saveBizReg(db: Db, actor: Actor, i: BizRegInput, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("사업자등록증 내용은 대표만 바꿉니다");
  const before = await loadBizReg(db);
  const kind = i.kind.trim();
  if (kind && !isRegKind(kind)) throw new UserError("등록증 종류를 골라 주세요");
  for (const [k, v] of [["개업일", i.openedOn], ["생년월일", i.birth], ["발급일", i.issuedOn]] as const)
    if (v.trim() && !DATE.test(v.trim())) throw new UserError(`${k}은 날짜로 넣어 주세요`);
  const corp = kind === "corporate";
  const birth = corp ? "" : i.birth.trim();
  if (birth) {
    const a = ageOn(birth, seoulDate(now));
    if (a == null || a < 14 || a > 100) throw new UserError("생년월일을 다시 확인해 주세요(등록증의 생년월일)");
  }
  const corpRegNo = corp ? i.corpRegNo.replace(/\D/g, "") : "";
  if (corpRegNo && corpRegNo.length !== 13) throw new UserError("법인등록번호는 13자리입니다(예: 120111-1234567)");
  const email = i.invoiceEmail.trim();
  if (email && !EMAIL.test(email)) throw new UserError("전자세금계산서 메일 주소 형식이 아닙니다(예: tax@myshop.kr)");
  const r: BizReg = {
    ...before,
    kind: (kind as RegKind) || "",
    birth,
    bizType: i.bizType.trim().slice(0, 60),
    bizItem: i.bizItem.trim().slice(0, 80),
    hqAddress: corp ? i.hqAddress.trim().slice(0, 120) : "",
    coOwners: i.coOwners.trim().slice(0, 60),
    unitTax: i.unitTax,
    invoiceEmail: email,
    issuedOn: i.issuedOn.trim(),
    taxOffice: i.taxOffice.trim().slice(0, 30),
  };
  await put(db, KEY, r, actor.id, now);
  // 세금 설정으로 넘길 값
  const [t] = await db.select().from(appConfig).where(eq(appConfig.key, TAX_KEY));
  const tb = (t?.data ?? {}) as Record<string, unknown>;
  const form = formOfKind(r.kind);
  const openedOn = i.openedOn.trim();
  const ta = {
    ...tb,
    form: form || tb.form || "",
    openedOn,
    corpRegNo: corpRegNo ? `${corpRegNo.slice(0, 6)}-${corpRegNo.slice(6)}` : form === "corporate" ? "" : tb.corpRegNo ?? "",
    // 처음 정하거나 형태가 바뀌면 시작일을 개업일로(법인 전환은 새 등록증의 개업일)
    formSince: form && form !== tb.form ? openedOn || String(tb.formSince ?? "") : String(tb.formSince ?? "") || "",
    vatUnit: tb.vatUnit || (r.unitTax ? "unit" : ""),
  };
  await put(db, TAX_KEY, ta, actor.id, now);
  const show = (x: BizReg) => ({ ...x, files: x.files.length, nts: undefined });
  await writeAudit(db, { actorId: actor.id, action: "shop.bizreg", entityType: "app_config", entityId: KEY, before: { ...show(before), openedOn: tb.openedOn, form: tb.form }, after: { ...show(r), openedOn, form: ta.form } });
  return r;
}

// ── 등록증 파일

export const canOpenRegFile = (a: Actor) => can(a, "payroll.view");

/** 등록증 파일 올리기(대표만). 암호화해 둔다. 예전 파일은 지우지 않는다(정정 이력) */
export async function addRegFile(db: Db, actor: Actor, f: { fileName: string; bytes: Uint8Array }, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("사업자등록증은 대표만 올립니다");
  if (!f.bytes.length) throw new UserError("등록증 파일을 골라 주세요");
  if (f.bytes.length > MAX_DOC_BYTES) throw new UserError("파일이 8MB를 넘습니다. 사진은 줄여서 올려 주세요");
  const mime = sniffDoc(f.bytes);
  if (!mime) throw new UserError("PDF나 사진(JPG·PNG·WEBP)만 올립니다. 홈택스에서 내려받은 PDF가 가장 깨끗합니다");
  const path = await storeFile("shop/bizreg", encryptBytes(f.bytes), "bin");
  const r = await loadBizReg(db);
  const file: RegFile = { path, fileName: f.fileName.slice(0, 120) || "사업자등록증", mime, size: f.bytes.length, at: now.toISOString(), by: actor.id };
  await put(db, KEY, { ...r, files: [file, ...r.files].slice(0, 20) }, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "shop.bizreg_file", entityType: "app_config", entityId: KEY, after: { fileName: file.fileName, size: file.size } });
}

/** 등록증 파일 열기(n=0 지금 것, 1부터 예전 것). 대표·회계만 */
export async function openRegFile(db: Db, actor: Actor, n: number) {
  if (!canOpenRegFile(actor)) throw new UserError("사업자등록증 파일은 대표·회계 담당만 엽니다");
  const f = (await loadBizReg(db)).files[n];
  if (!f) throw new UserError("없는 파일입니다");
  await writeAudit(db, { actorId: actor.id, action: "shop.bizreg_open", entityType: "app_config", entityId: KEY, after: { n } });
  return { bytes: decryptBytes(new Uint8Array(await readStored(f.path))), mime: f.mime, fileName: f.fileName };
}

// ── 국세청 진위확인·상태조회

export const NTS_API = "https://api.odcloud.kr/api/nts-businessman/v1/validate";
export const NTS_GUIDE = "https://www.data.go.kr/data/15081808/openapi.do";

/** 국세청 과세 유형 코드 → 등록증 종류(법인 번호면 법인) */
export function kindFromNts(taxTypeCd: string, corporate: boolean): RegKind | null {
  if (corporate) return taxTypeCd ? "corporate" : null;
  if (taxTypeCd === "01") return "general";
  if (taxTypeCd === "02" || taxTypeCd === "07") return "simple";
  if (taxTypeCd === "04") return "exempt";
  return null;
}

type NtsStatus = { b_stt?: string; b_stt_cd?: string; tax_type?: string; tax_type_cd?: string; end_dt?: string };

/** 진위확인 응답 한 건을 읽는다. 형식이 다르면 null */
export function parseNtsValidate(body: unknown): Omit<NtsCheck, "at"> | null {
  const b = body as { status_code?: string; data?: { valid?: string; valid_msg?: string; status?: NtsStatus }[] };
  if (!b || b.status_code !== "OK" || !Array.isArray(b.data) || !b.data.length) return null;
  const d = b.data[0];
  const s = d.status ?? {};
  const valid = d.valid === "01";
  const status = s.b_stt ?? "";
  const taxType = s.tax_type ?? "";
  return {
    valid,
    status,
    statusCd: s.b_stt_cd ?? "",
    taxType,
    taxTypeCd: s.tax_type_cd ?? "",
    endDt: s.end_dt ?? "",
    message: valid
      ? `국세청 자료와 맞음${status ? ` · ${status}` : ""}${taxType ? ` · ${taxType}` : ""}`
      : `국세청 자료와 다름 — 사업자등록번호·대표자 이름·개업일을 등록증과 다시 맞춰 보세요${d.valid_msg ? `(${d.valid_msg})` : ""}`,
  };
}

/** 공휴일에 넣은 공공데이터포털 인증키 */
async function dataGoKrKey(db: Db): Promise<string | null> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, "holiday.sync"));
  const enc = (r?.data as { keyEnc?: string | null } | undefined)?.keyEnc;
  if (!enc) return null;
  try {
    return decrypt(enc);
  } catch {
    return null;
  }
}

const UA = "Mozilla/5.0 (compatible; auto-body-shop/1.0)";

export type NtsResult = { ok: boolean; message: string; changedKind?: { from: RegKind | ""; to: RegKind } };

/**
 * 저장된 번호·대표자·개업일로 국세청에 확인한다. 맞으면 과세 유형을 등록증 종류에 채운다(비었거나 다르면 국세청 값으로).
 * notifyChange 는 매달 자동 확인 때 — 과세 유형·영업 상태가 바뀌었으면 대표에게 알린다.
 */
export async function checkNts(db: Db, opts: { actorId?: string | null; now?: Date; f?: typeof fetch; notifyChange?: boolean } = {}): Promise<NtsResult> {
  const now = opts.now ?? new Date();
  const shop = await loadShopInfo(db);
  const [t] = await db.select().from(appConfig).where(eq(appConfig.key, TAX_KEY));
  const openedOn = String(((t?.data ?? {}) as { openedOn?: string }).openedOn ?? "");
  const bNo = shop.bizNo.replace(/\D/g, "");
  if (bNo.length !== 10 || !shop.ceo || !DATE.test(openedOn)) return { ok: false, message: "사업자등록번호·대표자·개업일을 먼저 넣고 저장해 주세요" };
  const key = await dataGoKrKey(db);
  if (!key) return { ok: false, message: "공공데이터포털 인증키가 없습니다. 설정 › 영업일·휴무일에 키를 넣고, 같은 키로 '국세청_사업자등록정보 진위확인 및 상태조회 서비스'를 활용신청해 주세요" };
  const body = JSON.stringify({ businesses: [{ b_no: bNo, start_dt: openedOn.replace(/-/g, ""), p_nm: shop.ceo }] });
  let parsed: Omit<NtsCheck, "at"> | null = null;
  let why = "";
  try {
    const res = await (opts.f ?? fetch)(`${NTS_API}?${new URLSearchParams({ serviceKey: normalizeKey(key) })}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        parsed = parseNtsValidate(JSON.parse(text));
      } catch {
        parsed = null;
      }
    }
    if (!parsed) why = `국세청 응답 ${res.status} ${apiReason(text)}${res.status === 401 || res.status === 403 || /등록되지 않은|NOT_REGISTERED/i.test(text) ? " — 이 서비스도 같은 키로 활용신청했는지 확인하세요" : ""}`;
  } catch (e) {
    why = `국세청에 접속하지 못함(${e instanceof Error ? e.message : String(e)})`;
  }
  const r = await loadBizReg(db);
  if (!parsed) {
    await put(db, KEY, { ...r, nts: { ...(r.nts ?? { valid: null, status: "", statusCd: "", taxType: "", taxTypeCd: "", endDt: "" }), at: now.toISOString(), message: why } }, opts.actorId ?? null, now);
    return { ok: false, message: why };
  }
  const prev = r.nts;
  const corporate = Number(bNo.slice(3, 5)) >= 81 && Number(bNo.slice(3, 5)) <= 88;
  const k = parsed.valid ? kindFromNts(parsed.taxTypeCd, corporate || r.kind === "corporate") : null;
  const changedKind = k && k !== r.kind ? { from: r.kind, to: k } : undefined;
  await put(db, KEY, { ...r, kind: k ?? r.kind, nts: { ...parsed, at: now.toISOString() } }, opts.actorId ?? null, now);
  if (changedKind) {
    const [t2] = await db.select().from(appConfig).where(eq(appConfig.key, TAX_KEY));
    const tb = (t2?.data ?? {}) as Record<string, unknown>;
    const form = formOfKind(changedKind.to);
    if (form && tb.form !== form) await put(db, TAX_KEY, { ...tb, form, formSince: tb.formSince || openedOn }, opts.actorId ?? null, now);
    await writeAudit(db, { actorId: opts.actorId ?? null, action: "shop.bizreg_nts", entityType: "app_config", entityId: KEY, before: { kind: changedKind.from }, after: { kind: changedKind.to, taxType: parsed.taxType } });
  }
  if (opts.notifyChange && prev?.valid && parsed.valid && (prev.taxTypeCd !== parsed.taxTypeCd || prev.statusCd !== parsed.statusCd))
    await notifyRole(db, "owner", `국세청 사업자 정보가 바뀌었습니다: ${prev.taxType || "-"} → ${parsed.taxType || "-"}, ${prev.status || "-"} → ${parsed.status || "-"}. 설정 › 사업장 정보에서 확인하세요`, `nts-${seoulDate(now)}`, "/settings/shop#reg");
  if (opts.notifyChange && !parsed.valid && prev?.valid)
    await notifyRole(db, "owner", "국세청 확인에서 사업자등록 정보가 맞지 않게 나왔습니다. 설정 › 사업장 정보에서 확인하세요", `nts-bad-${seoulDate(now)}`, "/settings/shop#reg");
  return { ok: parsed.valid === true, message: parsed.message + (changedKind ? ` · 등록증 종류를 '${REG_KINDS[changedKind.to]}'(으)로 맞췄습니다` : ""), changedKind };
}

/** 매일 작업에서 부름: 매달 1일, 한 번 확인된 적이 있을 때만 다시 확인 */
export async function ntsMonthly(db: Db, now = new Date()) {
  if (seoulDate(now).slice(8) !== "01") return "국세청 확인 시기 아님";
  const r = await loadBizReg(db);
  if (!r.nts?.valid) return "국세청 확인 전";
  const res = await checkNts(db, { now, notifyChange: true });
  return `국세청 확인: ${res.message}`;
}
