// 이용약관·처리방침의 '지금 내용'(공개 중인 화면 글 + 사업장 정보 + 문자 대행사)과 손님 화면에 보일 판 고르기.
import type { Db } from "@/db/client";
import { shopCard } from "@/modules/carbook/service";
import { isProviderId, PROVIDERS } from "@/modules/messaging/providers";
import { smsSenderInfo } from "@/modules/messaging/service";
import { loadShopInfo } from "@/modules/platform/shop";
import { seoulDate } from "@/modules/platform/time";
import { legalState, legalVersions, privacyDoc, termsDoc, type LegalDoc, type LegalKind, type LegalState, type LegalVersion } from "./legal";
import { sitePages } from "./pages";
import { siteConfig } from "./service";

/** 지금 내용으로 만든 글(시행하면 이대로 찍힌다). 화면 글은 공개한 것만 쓴다 */
export async function liveLegalDoc(db: Db, kind: LegalKind): Promise<LegalDoc> {
  const [shop, info, cfg] = await Promise.all([shopCard(db), loadShopInfo(db), siteConfig(db)]);
  if (kind === "terms") return termsDoc((await sitePages(db)).pairs("terms.items"), { name: shop.name });
  const sms = await smsSenderInfo(db);
  const smsName = sms.provider && isProviderId(sms.provider) && sms.provider !== "demo" ? PROVIDERS[sms.provider].label : "문자·알림톡 발송 대행사(계약 후 이름을 적음)";
  return privacyDoc({ name: shop.name, ceo: info.ceo ?? "", officer: cfg.privacyOfficer, contact: cfg.privacyContact, phone: shop.phone, smsName });
}

export type LegalPage = {
  doc: LegalDoc;
  /** 보이는 판의 시행일(판이 없으면 기본 정보의 처리방침 시행일, 그것도 없으면 '개업일') */
  from: string;
  /** 보는 판(지난 판·예정 판을 골라 볼 때) */
  viewing: LegalVersion | null;
  state: LegalState;
  /** 고른 판이 시행 중인 판이 아닐 때: 'past' 지난 판, 'next' 시행 예정 */
  other: "past" | "next" | null;
};

/** 손님 화면: v 가 있으면 그 판, 없으면 시행 중인 판, 판이 없으면 지금 내용 */
export async function legalPage(db: Db, kind: LegalKind, v?: string, now = new Date()): Promise<LegalPage> {
  const today = seoulDate(now);
  const all = await legalVersions(db, kind);
  const state = legalState(all, today);
  const pick = (v && all.find((x) => x.id === v)) || state.now;
  if (pick) return { doc: pick.doc, from: pick.from, viewing: pick, state, other: pick.id === state.now?.id ? null : pick.from > today ? "next" : "past" };
  const cfg = await siteConfig(db);
  return { doc: await liveLegalDoc(db, kind), from: cfg.privacyFrom || "개업일", viewing: null, state, other: null };
}
