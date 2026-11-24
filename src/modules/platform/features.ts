// 안 쓰는 기능 끄기(간소화, 대표 2026-11-24): 작은 공업사가 쓰지 않는 화면을 사이드 메뉴·메뉴 찾기에서 숨긴다.
// 숨겨도 기록·주소는 그대로 남고, 다시 켜면 돌아온다. 법정(견적서·정비명세서·개인정보·위험성평가 등)과
// 수리 흐름의 필수 화면은 목록에 없어 끌 수 없다. 설정 › 간소화에서 대표가 켜고 끈다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";

export type Feature = {
  key: string;
  title: string;
  /** 숨기는 메뉴 주소 */
  hrefs: string[];
  /** 끄면 생기는 일(표준서·ISO 관련 주의) */
  note: string;
};

export const FEATURES: Feature[] = [
  { key: "schedule", title: "일정표", hrefs: ["/schedule"], note: "입고·출고 예정은 대시보드와 수리 건에서 그대로 봅니다." },
  { key: "tasks", title: "업무지시", hrefs: ["/tasks"], note: "말로 지시하고 기록을 남기지 않는 가게에 맞습니다." },
  { key: "techbay", title: "업체 주문 앱(테크베이)", hrefs: ["/portal-orders", "/tv/techbay"], note: "테크베이 주문을 받지 않을 때 끕니다." },
  { key: "aos", title: "AOS 지급 엑셀 맞추기", hrefs: ["/claims/aos-paid"], note: "보험 지급은 보험 청구 화면에서 하나씩 확인합니다." },
  { key: "gifts", title: "기프티콘", hrefs: ["/gifts/send", "/gifts", "/settings/gift"], note: "감사 기프티콘을 보내지 않을 때 끕니다." },
  { key: "homepage", title: "홈페이지 관리", hrefs: ["/homepage/faq", "/homepage/notice", "/homepage/cases", "/homepage/articles", "/homepage/trust", "/settings/site"], note: "홈페이지 글은 그대로 공개됩니다. 손님 견적 요청함은 상담 화면에 남습니다." },
  { key: "tv", title: "TV 현황판", hrefs: ["/tv", "/settings/tv"], note: "TV를 두지 않을 때 끕니다." },
  { key: "budget", title: "연간 예산", hrefs: ["/money/budget"], note: "예산 대비 실적 보고서가 비게 됩니다." },
  { key: "reviews", title: "인사평가", hrefs: ["/reviews"], note: "ISO 9001 7.2(역량) 근거는 역량표·교육 기록으로 남습니다." },
  { key: "suggestions", title: "개선 제안", hrefs: ["/suggestions"], note: "ISO 9001 10.3 지속적 개선 근거가 줄어듭니다. 부적합·시정 조치는 그대로 씁니다." },
  { key: "five_s", title: "3정5S 점검", hrefs: ["/five-s"], note: "표준서 STD-08의 3정5S 점검 기록이 끊깁니다(심사 때 다른 기록으로 보여야 함)." },
  { key: "lube_pm", title: "설비 윤활·예방정비", hrefs: ["/equipment/lube", "/equipment/pm"], note: "표준서 STD-08 설비 보전 기록이 끊깁니다. 일상 점검·교정은 그대로 남습니다." },
];

const KEY = "features_off";

/** 꺼 둔 기능 키 */
export async function featuresOff(db: Db): Promise<string[]> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  const off = (r?.data as { off?: unknown } | undefined)?.off;
  return Array.isArray(off) ? off.filter((k): k is string => typeof k === "string" && FEATURES.some((f) => f.key === k)) : [];
}

/** 메뉴에서 숨길 주소 */
export async function hiddenHrefs(db: Db): Promise<string[]> {
  const off = await featuresOff(db);
  return FEATURES.filter((f) => off.includes(f.key)).flatMap((f) => f.hrefs);
}

/** 기능 하나 켜기·끄기. 권한(대표) 확인은 부르는 쪽에서 */
export async function setFeature(db: Db, actorId: string, key: string, on: boolean) {
  const f = FEATURES.find((x) => x.key === key);
  if (!f) throw new UserError("끌 수 없는 기능입니다");
  const before = await featuresOff(db);
  const off = on ? before.filter((k) => k !== key) : [...new Set([...before, key])];
  if (off.length === before.length && off.every((k) => before.includes(k))) return false;
  const data = { off };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "settings.features", entityType: "app_config", entityId: KEY, before: { off: before }, after: { [on ? "on" : "off"]: f.title } });
  return true;
}
