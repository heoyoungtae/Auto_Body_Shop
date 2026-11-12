// 세금·사업 형태 설정(설정 › 사업장 정보의 '세금·사업 형태'). app_config 'tax' 한 줄에 둔다.
// 사업용 계좌 번호는 암호화하고, 전체 번호는 대표·회계만 본다(협력업체 계좌와 같은 원칙).
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, payrollRun } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { holidayName } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { UserError } from "@/modules/platform/errors";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { addDays } from "@/modules/platform/time";
import { bankAccountIssue, maskAccount } from "@/modules/purchase/rules";
import {
  BIZ_FORMS,
  formFromBizNo,
  isBizForm,
  isRegion,
  recommendRelief,
  regionOf,
  RELIEF_KINDS,
  shiftDue,
  taxDeadlines,
  type BizForm,
  type Region,
  type ReliefKind,
} from "./tax-rules";

const KEY = "tax";
type Actor = { id: string; roles: Role[] };

export type TaxProfile = {
  form: BizForm | "";
  /** 이 형태가 시작된 날(법인 전환 때 바뀜) */
  formSince: string;
  corpRegNo: string;
  fiscalStartMonth: number;
  /** 개업일(사업자등록증) */
  openedOn: string;
  /** 대표가 고른 지역(비면 주소로 짐작한 값) */
  region: Region | "";
  /** 대표가 창업 당시 청년(15~34세, 병역 기간 빼기)이었나 */
  ceoYouth: boolean | null;
  relief: ReliefKind | "";
  halfYearWithholding: boolean;
  /** 복식부기의무 개인사업자: 사업용 계좌를 세무서에 신고했나 */
  bankReported: boolean;
  bankName: string;
  bankAccountEnc: string | null;
  bankAccountMasked: string;
  bankHolder: string;
  agentName: string;
  agentPhone: string;
};

export const EMPTY_TAX: TaxProfile = {
  form: "",
  formSince: "",
  corpRegNo: "",
  fiscalStartMonth: 1,
  openedOn: "",
  region: "",
  ceoYouth: null,
  relief: "",
  halfYearWithholding: false,
  bankReported: false,
  bankName: "",
  bankAccountEnc: null,
  bankAccountMasked: "",
  bankHolder: "",
  agentName: "",
  agentPhone: "",
};

export async function loadTaxProfile(db: Db): Promise<TaxProfile> {
  const [cfg] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return { ...EMPTY_TAX, ...((cfg?.data ?? {}) as Partial<TaxProfile>) };
}

/** 화면에 보일 설정 + 짐작한 값(형태·지역·감면 추천) */
export async function taxOverview(db: Db, actor: Actor, today: string) {
  const p = await loadTaxProfile(db);
  const shop = await loadShopInfo(db);
  const guessForm = formFromBizNo(shop.bizNo);
  const guessRegion = regionOf(shopAddressLine(shop));
  const region = p.region || guessRegion.region;
  const rec = region && p.ceoYouth != null ? recommendRelief(region, p.ceoYouth, p.openedOn, today) : null;
  const full = can(actor, "payroll.view") && p.bankAccountEnc ? decrypt(p.bankAccountEnc) : null;
  return { p, form: p.form || guessForm, formGuessed: !p.form && !!guessForm, guessRegion, region, rec, bankFull: full };
}

export type TaxInput = {
  form: string;
  formSince: string;
  corpRegNo: string;
  fiscalStartMonth: number;
  openedOn: string;
  region: string;
  ceoYouth: string;
  relief: string;
  halfYearWithholding: boolean;
  bankReported: boolean;
  bankName: string;
  accountNo: string;
  bankHolder: string;
  agentName: string;
  agentPhone: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveTaxProfile(db: Db, actor: Actor, i: TaxInput, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("세금·사업 형태는 대표만 바꿉니다");
  const before = await loadTaxProfile(db);
  if (i.form && !isBizForm(i.form)) throw new UserError("사업 형태를 골라 주세요");
  if (i.region && !isRegion(i.region)) throw new UserError("지역 구분을 골라 주세요");
  if (i.relief && !(i.relief in RELIEF_KINDS)) throw new UserError("받는 감면을 골라 주세요");
  for (const [k, v] of [["개업일", i.openedOn], ["형태 시작일", i.formSince]] as const)
    if (v && !DATE.test(v)) throw new UserError(`${k}은 날짜로 넣어 주세요`);
  if (!(i.fiscalStartMonth >= 1 && i.fiscalStartMonth <= 12)) throw new UserError("사업연도 시작 달은 1~12월입니다");
  const corpRegNo = i.corpRegNo.replace(/\D/g, "");
  if (i.form === "corporate" && corpRegNo && corpRegNo.length !== 13)
    throw new UserError("법인등록번호는 13자리입니다(예: 120111-1234567)");
  const no = i.accountNo.replace(/[\s-]/g, "");
  if (no) {
    const issue = bankAccountIssue(no);
    if (issue) throw new UserError(issue);
  }
  if ((no || i.bankHolder.trim()) && !i.bankName.trim()) throw new UserError("사업용 계좌의 은행을 골라 주세요");
  const p: TaxProfile = {
    form: (i.form as BizForm) || "",
    formSince: i.form && i.form !== before.form && !i.formSince ? i.openedOn || now.toISOString().slice(0, 10) : i.formSince,
    corpRegNo: corpRegNo ? `${corpRegNo.slice(0, 6)}-${corpRegNo.slice(6)}` : "",
    fiscalStartMonth: i.form === "corporate" ? i.fiscalStartMonth : 1,
    openedOn: i.openedOn,
    region: (i.region as Region) || "",
    ceoYouth: i.ceoYouth === "1" ? true : i.ceoYouth === "0" ? false : null,
    relief: (i.relief as ReliefKind) || "",
    halfYearWithholding: i.halfYearWithholding,
    bankReported: i.bankReported,
    bankName: i.bankName.trim(),
    bankAccountEnc: no ? encrypt(no, "sensitive") : i.bankName.trim() ? before.bankAccountEnc : null,
    bankAccountMasked: no ? maskAccount(no) : i.bankName.trim() ? before.bankAccountMasked : "",
    bankHolder: i.bankHolder.trim(),
    agentName: i.agentName.trim(),
    agentPhone: i.agentPhone.trim(),
  };
  await db
    .insert(appConfig)
    .values({ key: KEY, data: p, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: p, updatedBy: actor.id, updatedAt: now } });
  const show = (x: TaxProfile) => ({ ...x, bankAccountEnc: undefined, account: x.bankAccountMasked });
  await writeAudit(db, { actorId: actor.id, action: "tax.profile", entityType: "app_config", entityId: KEY, before: show(before), after: show(p) });
  return p;
}

/** 대표·회계의 '내 할 일': 신고·납부 기한 14일 전부터, 설정이 비었을 때 한 번 */
export async function taxTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon" | "setup"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "payroll.view")) return out;
  const p = await loadTaxProfile(db);
  const shop = await loadShopInfo(db);
  const form = p.form || formFromBizNo(shop.bizNo);
  if (!p.form) {
    if (actor.roles.includes("owner"))
      out.push({
        key: "set-tax",
        when: "setup",
        what: "사업 형태(개인·법인)와 감면을 정해 주세요",
        detail: form ? `사업자등록번호로 보면 ${BIZ_FORMS[form]}입니다. 신고 일정·급여·절세 안내가 이 값으로 달라집니다` : "신고 일정·급여·절세 안내가 이 값으로 달라집니다",
        href: "/settings/shop#tax",
        action: "정하기",
      });
  }
  if (!form) return out;
  if (form === "individual" && p.bankName && !p.bankReported && actor.roles.includes("owner"))
    out.push({ key: "tax-bank-report", when: "soon", what: "사업용 계좌를 세무서에 신고했는지 확인하세요", detail: "복식부기의무 개인사업자는 사업용 계좌를 신고해야 합니다(홈택스). 했으면 설정에서 체크합니다", href: "/settings/shop#tax", action: "확인" });
  const cal = await loadShopCalendar(db);
  const isHoliday = (d: string) => holidayName(cal, d) != null;
  const [anyRun] = await db.select({ id: payrollRun.id }).from(payrollRun).limit(1);
  const year = Number(today.slice(0, 4));
  const horizon = addDays(today, 14);
  for (const y of [year, year + 1]) {
    for (const d of taxDeadlines(y, { form, fiscalStartMonth: p.fiscalStartMonth || 1, withholding: !!anyRun, halfYear: p.halfYearWithholding, diligent: false })) {
      const due = shiftDue(d.due, isHoliday);
      if (due < today || due > horizon) continue;
      out.push({
        key: `tax-${d.key}`,
        when: due === today ? "today" : "soon",
        what: `${d.what} — ${due}까지`,
        detail: `${d.detail}${p.agentName ? ` · 세무 대리인 ${p.agentName}${p.agentPhone ? `(${p.agentPhone})` : ""}` : ""}`,
        href: "/money/tax",
        action: "보기",
      });
    }
  }
  return out;
}

/** 앞으로 12개월 신고·납부 기한(토·일·공휴일이면 다음 날로) */
export async function taxCalendar(db: Db, today: string) {
  const p = await loadTaxProfile(db);
  const shop = await loadShopInfo(db);
  const form = p.form || formFromBizNo(shop.bizNo);
  if (!form) return [];
  const cal = await loadShopCalendar(db);
  const isHoliday = (d: string) => holidayName(cal, d) != null;
  const [anyRun] = await db.select({ id: payrollRun.id }).from(payrollRun).limit(1);
  const year = Number(today.slice(0, 4));
  const end = addDays(today, 365);
  const out: { key: string; due: string; days: number; what: string; detail: string }[] = [];
  for (const y of [year, year + 1])
    for (const d of taxDeadlines(y, { form, fiscalStartMonth: p.fiscalStartMonth || 1, withholding: !!anyRun, halfYear: p.halfYearWithholding, diligent: false })) {
      const due = shiftDue(d.due, isHoliday);
      if (due < today || due > end) continue;
      out.push({ ...d, due, days: Math.round((Date.parse(due) - Date.parse(today)) / 864e5) });
    }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
