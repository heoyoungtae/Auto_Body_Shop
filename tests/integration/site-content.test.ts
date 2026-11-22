// 홈페이지 2단계: 자주 묻는 질문(초안·공개·찾기·상담 답변에서 초안), 공지사항(게시 기간·띠·수첩 알림·광고), 작업 사례(사진 홍보 동의·가린 사진·동의 철회)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { createConsultation } from "@/modules/customer/service";
import {
  addCasePhoto,
  bannerNotice,
  carbookNotices,
  caseCandidates,
  caseSources,
  createCase,
  faqFromConsult,
  loadFaqStarters,
  noticeNotifyJob,
  publicCaseFile,
  publicCases,
  publicFaqs,
  publicNotices,
  readNotice,
  saveCase,
  saveFaq,
  saveNotice,
} from "@/modules/site/content";
import { FAQ_STARTERS } from "@/modules/site/faq-starters";
import { DEFAULT_SITE, LEGACY_SITE, routeFor } from "@/modules/site/rules";
import { siteConfig } from "@/modules/site/service";
import { ensureArticleStarters } from "@/modules/site/starters";
import { CONSENT_VERSION } from "@/modules/customer/rules";
import { seedShop, testDb } from "./db";
import { estimating, PNG, WEBP } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const advisor = () => ({ id: ids.advisor, roles: ["advisor"] as const });
const tech = () => ({ id: ids.tech1, roles: ["technician"] as const });
const UUID = "0b9c4c3e-2f6a-4d8e-9a51-6c7d8e9f0a1b";
// 서울 오후 2시(광고도 보낼 수 있는 때) / 밤 10시
const day = (d: string) => new Date(`${d}T05:00:00Z`);
const night = (d: string) => new Date(`${d}T13:00:00Z`);

describe("주소", () => {
  it("/faq·/notice·/cases 와 글 한 건 주소는 홈페이지 화면으로, 사례 사진은 홈페이지에서 연다", () => {
    expect(routeFor("/faq", true)).toEqual({ kind: "rewrite", to: "/site/faq" });
    expect(routeFor("/cases", false)).toEqual({ kind: "rewrite", to: "/site/cases" });
    expect(routeFor(`/notice/${UUID}`, true)).toEqual({ kind: "rewrite", to: `/site/notice/${UUID}` });
    expect(routeFor(`/cases/${UUID}`, false)).toEqual({ kind: "rewrite", to: `/site/cases/${UUID}` });
    expect(routeFor("/notice/../home", true)).toEqual({ kind: "app" });
    expect(routeFor(`/api/site-file/site/cases/${UUID}/${UUID}.jpg`, true)).toEqual({ kind: "pass" });
    expect(routeFor("/homepage/faq", true)).toEqual({ kind: "app" });
  });
});

describe("자주 묻는 질문", () => {
  it("처음 질문 23개는 홈페이지를 처음 열 때 저절로 공개, 모두 지워도 다시 채우지 않는다", async () => {
    expect(FAQ_STARTERS).toHaveLength(23);
    expect(FAQ_STARTERS.some((x) => x.key === "panel-or-replace")).toBe(true);
    expect(await publicFaqs(db)).toHaveLength(23);
    const rows = await db.select().from(schema.siteFaq);
    expect(rows.every((r) => r.published && r.origin === "starter")).toBe(true);
    expect(rows.find((r) => r.starterKey === "warranty")?.answer).toMatch(/도장·판금 12개월입니다/);
    expect(await publicFaqs(db)).toHaveLength(23); // 두 번 넣지 않는다
    await db.delete(schema.siteFaq);
    expect(await publicFaqs(db)).toHaveLength(0);
    // 지운 처음 질문은 단추로 되살린다(바로 공개)
    expect(await loadFaqStarters(db, advisor())).toBe(23);
    expect(await loadFaqStarters(db, advisor())).toBe(0);
    expect(await publicFaqs(db)).toHaveLength(23);
    await expect(loadFaqStarters(db, tech())).rejects.toThrow(/상담을 쓸 수 있는/);
  });

  it("처음 여는 화면이 질문을 동시에 두 번 읽어도 둘 다 채워진 목록을 본다", async () => {
    const [a, b] = await Promise.all([publicFaqs(db), publicFaqs(db, "보험")]);
    expect(a).toHaveLength(FAQ_STARTERS.length);
    expect(b.length).toBeGreaterThan(0);
    expect(await db.select().from(schema.siteFaq)).toHaveLength(FAQ_STARTERS.length);
  });

  it("예전에 '공개 안 함'으로 불러 둔 초안만 있으면 처음 열 때 공개로 바꾼다", async () => {
    const now = new Date();
    await db
      .insert(schema.siteFaq)
      .values(
        FAQ_STARTERS.slice(0, 3).map((x, i) => ({
          category: x.category,
          question: x.q,
          answer: "답",
          sort: i,
          published: false,
          origin: "starter",
          starterKey: x.key,
          createdAt: now,
          updatedAt: now,
        })),
      );
    expect(await publicFaqs(db)).toHaveLength(23);
  });

  it("처음 질문을 뒤에 늘리면 새 질문만 저절로 들어가고, 지운 질문은 돌아오지 않는다", async () => {
    await publicFaqs(db);
    await db.delete(schema.siteFaq).where(eq(schema.siteFaq.starterKey, "privacy")); // 직원이 지움
    // 판금·교환 질문이 생기기 전 표시였다고 치고 되돌린다
    await db
      .update(schema.appConfig)
      .set({ data: { at: "x", keys: FAQ_STARTERS.map((x) => x.key).filter((k) => k !== "panel-or-replace") } })
      .where(eq(schema.appConfig.key, "site_seed_faq"));
    await db.delete(schema.siteFaq).where(eq(schema.siteFaq.starterKey, "panel-or-replace"));
    const keys = (await publicFaqs(db)).map((f) => f.question);
    expect(keys).toContain("판금으로 고칠지, 부품을 교환할지는 어떻게 정하나요?");
    expect(keys).toHaveLength(22);
  });

  it("처음 글 판이 오르면 직원이 안 고친 처음 글만 새 문구로(공업사·덴트·광택 빼기), 고친 글과 예전 기본 정보는 그대로·새 문구", async () => {
    await publicFaqs(db);
    await ensureArticleStarters(db);
    const old = new Date(Date.now() - 86_400_000);
    // 예전 판(덴트·광택 문구)으로 들어가 있던 것처럼 되돌린다: 하나는 직원이 고쳐 둔 글
    await db.update(schema.siteFaq).set({ answer: "덴트 6개월, 광택 1개월", createdAt: old, updatedAt: old }).where(eq(schema.siteFaq.starterKey, "warranty"));
    await db.update(schema.siteFaq).set({ answer: "직원이 고친 답(덴트)", updatedBy: ids.advisor, createdAt: old, updatedAt: new Date() }).where(eq(schema.siteFaq.starterKey, "how-long"));
    await db.update(schema.siteArticle).set({ slug: "dent-vs-panel", title: "덴트와 판금, 무엇이 다른가요?" }).where(eq(schema.siteArticle.starterKey, "dent-vs-panel"));
    for (const k of ["site_seed_faq", "site_seed_articles"]) {
      const [c] = await db.select().from(schema.appConfig).where(eq(schema.appConfig.key, k));
      await db
        .update(schema.appConfig)
        .set({ data: { ...(c.data as object), rev: 1 } })
        .where(eq(schema.appConfig.key, k));
    }
    await publicFaqs(db);
    await ensureArticleStarters(db);
    const faq = await db.select().from(schema.siteFaq);
    expect(faq.find((r) => r.starterKey === "warranty")!.answer).toMatch(/^네\. 출고일부터 도장·판금 12개월입니다/);
    expect(faq.find((r) => r.starterKey === "how-long")!.answer).toBe("직원이 고친 답(덴트)");
    const [art] = await db.select().from(schema.siteArticle).where(eq(schema.siteArticle.starterKey, "dent-vs-panel"));
    expect(art).toMatchObject({ slug: "dent-repair", title: "찌그러진 곳은 이렇게 고칩니다" });
    const all = faq.map((r) => `${r.question} ${r.answer}`).join(" ") + (await db.select().from(schema.siteArticle)).map((a) => a.body).join(" ");
    expect(all.replace("직원이 고친 답(덴트)", "")).not.toMatch(/덴트 [0-9]+개월|광택 [0-9]+개월|광택으로 대부분/);
    // 기본 정보를 예전 처음 문구 그대로 저장해 둔 경우 새 처음 문구로 보인다
    await db.insert(schema.appConfig).values({ key: "site", data: { lead: LEGACY_SITE.lead![0], about: "대표가 쓴 인사말" } });
    const cfg = await siteConfig(db);
    expect(cfg.lead).toBe(DEFAULT_SITE.lead);
    expect(cfg.lead).toContain("공업사");
    expect(cfg.about).toBe("대표가 쓴 인사말");
  });

  it("공개한 것만 보이고, 분야·낱말(띄어쓰기 무시)로 찾는다. 공개 글에 휴대폰 번호가 있으면 막는다", async () => {
    // 처음 질문은 이미 넣었다가 모두 지운 상태로 둔다(직접 쓴 질문만 보이게)
    await db.insert(schema.appConfig).values({ key: "site_seed_faq", data: { at: "x", keys: FAQ_STARTERS.map((x) => x.key) } });
    await saveFaq(db, advisor(), { category: "보증·출고 뒤", question: "도색한 뒤 바로 세차해도 되나요?", answer: "출고 뒤 일주일은 자동 세차를 피해 주세요.", sort: 5, published: true });
    await saveFaq(db, advisor(), { category: "보증·출고 뒤", question: "아직 공개하지 않은 질문입니다", answer: "자동 세차 이야기", sort: 6, published: false });
    await saveFaq(db, advisor(), { category: "보험 수리", question: "보험 처리하면 할증되나요?", answer: "보험사에 확인해 주세요.", sort: 10, published: true });
    expect((await publicFaqs(db)).map((f) => f.category)).toEqual(["보험 수리", "보증·출고 뒤"]); // 분야 순서대로
    expect(await publicFaqs(db, "자동 세차")).toHaveLength(1);
    expect(await publicFaqs(db, "자동세차")).toHaveLength(1);
    expect(await publicFaqs(db, "", "보험 수리")).toHaveLength(1);
    expect(await publicFaqs(db, "없는낱말")).toHaveLength(0);
    await expect(saveFaq(db, advisor(), { category: "견적·비용", question: "연락처 남기면 되나요?", answer: "010-1234-5678 로 문자 주세요", sort: 1, published: true })).rejects.toThrow(/휴대폰 번호/);
  });

  it("상담 비밀 답변으로 초안: 이름·번호는 가리고 공개 안 함, 같은 상담은 한 번만", async () => {
    const c = await createConsultation(
      db,
      ids.advisor,
      {
        newCustomer: { name: "홍길동", phone: "010-1234-5678" },
        consent: { required: true, photo: false, marketing: false, method: "phone" },
        newVehicle: { plateNo: "12가3456", model: "아반떼" },
        channel: "online",
        damageTypes: ["찌그러짐"],
        damageParts: "뒷문 찌그러짐 12가3456",
        methods: [],
        insurance: "self",
        result: "open",
      },
      day("2026-11-21"),
    );
    await expect(faqFromConsult(db, advisor(), c.id)).rejects.toThrow(/답이 있어야/);
    await db.update(schema.consultation).set({ webReply: "홍길동 고객님, 판금으로 20~30만원입니다. 010-9999-8888 로 연락 주세요." }).where(eq(schema.consultation.id, c.id));
    const id = await faqFromConsult(db, advisor(), c.id);
    expect(await faqFromConsult(db, advisor(), c.id)).toBe(id);
    const [f] = await db.select().from(schema.siteFaq).where(eq(schema.siteFaq.id, id));
    expect(f).toMatchObject({ published: false, origin: "consult", category: "수리·작업" });
    expect(f.question).toBe("뒷문 찌그러짐 12가**56 — 어떻게 고치고 비용은 얼마나 드나요?");
    expect(f.answer).toBe("고객 고객님, 판금으로 20~30만원입니다. 010-****-8888 로 연락 주세요.");
  });
});

describe("공지사항", () => {
  const base = { title: "설 연휴 휴무", body: "2월 16~18일 쉽니다.", pinned: false, banner: false, ad: false, published: true, startsOn: "", endsOn: "", notifyCarbook: false };

  it("게시 기간 안에서만 보이고 끝나면 저절로 내려간다. 고정이 위, 띠는 하나", async () => {
    const a = await saveNotice(db, advisor(), { ...base, startsOn: "2026-11-01", endsOn: "2026-11-20" }, day("2026-11-01"));
    const b = await saveNotice(db, advisor(), { ...base, title: "개업 안내", startsOn: "2026-11-10", pinned: true, banner: true }, day("2026-11-10"));
    const c = await saveNotice(db, advisor(), { ...base, title: "12월 이벤트", startsOn: "2026-12-01" }, day("2026-11-10"));
    await saveNotice(db, advisor(), { ...base, title: "초안", published: false, startsOn: "2026-11-01" }, day("2026-11-10"));
    expect((await publicNotices(db, "2026-11-15")).map((n) => n.id)).toEqual([b.id, a.id]);
    expect((await publicNotices(db, "2026-11-21")).map((n) => n.id)).toEqual([b.id]);
    expect((await publicNotices(db, "2026-12-01")).map((n) => n.id)).toEqual([b.id, c.id]);
    expect((await bannerNotice(db, "2026-11-21"))?.id).toBe(b.id);
    expect(await readNotice(db, a.id, "2026-11-21")).toBeNull();
    expect((await readNotice(db, b.id, "2026-11-21"))?.views).toBe(0);
    expect((await db.select().from(schema.siteNotice).where(eq(schema.siteNotice.id, b.id)))[0].views).toBe(1);
    await expect(saveNotice(db, advisor(), { ...base, startsOn: "2026-11-10", endsOn: "2026-11-01" })).rejects.toThrow(/끝 날/);
  });

  it("수첩 알림: 푸시 켠 손님에게 한 번, 광고는 동의 손님에게만·밤에는 미뤘다가 오후 4시 작업에서", async () => {
    const mk = async (name: string, phone: string, marketing: boolean, ep: string) => {
      const c = await createConsultation(
        db,
        ids.advisor,
        {
          newCustomer: { name, phone },
          consent: { required: true, photo: false, marketing, method: "phone" },
          channel: "phone",
          damageTypes: ["긁힘"],
          damageParts: "범퍼",
          methods: [],
          insurance: "self",
          result: "open",
        },
        day("2026-11-01"),
      );
      const [row] = await db.select({ id: schema.consultation.customerId }).from(schema.consultation).where(eq(schema.consultation.id, c.id));
      await db.insert(schema.carbookPush).values({ customerId: row.id, endpoint: ep });
      return row.id;
    };
    const yes = await mk("김동의", "010-1111-2222", true, "https://fcm.googleapis.com/fcm/send/a");
    const no = await mk("이거절", "010-3333-4444", false, "https://fcm.googleapis.com/fcm/send/b");
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const n = await saveNotice(db, advisor(), { ...base, startsOn: "2026-11-21", notifyCarbook: true }, day("2026-11-21"), fake);
    expect(n.sent).toBe(2);
    await saveNotice(db, advisor(), { ...base, id: n.id, title: "고침", startsOn: "2026-11-21", notifyCarbook: true }, day("2026-11-21"), fake);
    expect(calls).toHaveLength(2); // 고쳐도 다시 안 감

    const ad = await saveNotice(db, advisor(), { ...base, title: "도색 20% 할인", ad: true, startsOn: "2026-11-21", notifyCarbook: true }, night("2026-11-21"), fake);
    expect(ad.sent).toBeNull(); // 밤 10시라 미룸
    expect(await noticeNotifyJob(db, day("2026-11-22"), fake)).toBe("홈페이지 공지 알림 1건(1명)");
    expect(calls.slice(2)).toEqual(["https://fcm.googleapis.com/fcm/send/a"]);
    const box = await db.select().from(schema.carbookInbox).where(eq(schema.carbookInbox.customerId, yes));
    expect(box.map((b) => b.title)).toContain("(광고) 도색 20% 할인");

    // 내 차 수첩 '공업사 소식': 광고는 동의 손님에게만
    expect((await carbookNotices(db, yes, "2026-11-22")).map((x) => x.title)).toContain("도색 20% 할인");
    expect((await carbookNotices(db, no, "2026-11-22")).map((x) => x.title)).not.toContain("도색 20% 할인");
  });
});

describe("작업 사례", () => {
  async function deliveredWithPhotoConsent() {
    const roId = await estimating(db, ids, day("2026-11-01"));
    await db.update(schema.repairOrder).set({ status: "delivered" }).where(eq(schema.repairOrder.id, roId));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    return { roId, customerId: ro.customerId };
  }
  const consent = (customerId: string, photo: boolean, at: Date) =>
    db.insert(schema.consent).values({ customerId, version: CONSENT_VERSION, required: true, photo, marketing: false, method: "visit", at });

  it("사진 홍보 동의한 출고 건만 사례로, 전·후 가린 사진이 있어야 공개, 동의를 거두면 저절로 빠진다", async () => {
    const { roId, customerId } = await deliveredWithPhotoConsent();
    expect(await caseCandidates(db)).toHaveLength(0);
    await expect(createCase(db, advisor(), roId)).rejects.toThrow(/동의하지 않았습니다/);
    await consent(customerId, true, new Date(Date.now() + 60_000)); // 처음 동의(지금) 뒤에 받은 동의
    expect((await caseCandidates(db)).map((r) => r.id)).toEqual([roId]);

    const id = await createCase(db, advisor(), roId);
    expect(await createCase(db, advisor(), roId)).toBe(id);
    expect(await caseCandidates(db)).toHaveLength(0);
    const [row] = await db.select().from(schema.siteCase).where(eq(schema.siteCase.id, id));
    expect(row).toMatchObject({ category: "찌그러짐", carLabel: "현대 아반떼", published: false }); // 차종은 차 정보에서(번호 없이)
    expect((await caseSources(db, roId)).before).toHaveLength(8); // 계기판 사진은 빼고

    const input = { title: "아반떼 앞범퍼 찌그러짐", body: "판금으로 폈습니다", category: "찌그러짐", carLabel: "현대 아반떼", published: true };
    await expect(saveCase(db, advisor(), id, input)).rejects.toThrow(/수리 전 사진과 수리 후 사진/);
    await expect(addCasePhoto(db, advisor(), id, "before", new Uint8Array([1, 2, 3]))).rejects.toThrow(/사진 파일만/);
    const before = await addCasePhoto(db, advisor(), id, "before", WEBP, { width: 1600, height: 1200 });
    const after = await addCasePhoto(db, advisor(), id, "after", PNG);
    await expect(saveCase(db, advisor(), id, { ...input, title: "12가3456 수리" })).rejects.toThrow(/차량번호/);
    await saveCase(db, advisor(), id, input);

    expect((await publicCases(db)).map((c) => c.id)).toEqual([id]);
    expect(await publicCases(db, "도색")).toHaveLength(0);
    expect(await publicCaseFile(db, before)).toBe(true);
    expect(await publicCaseFile(db, after)).toBe(true);
    expect(await publicCaseFile(db, `site/cases/${id}/../x.jpg`)).toBe(false);

    // 손님이 동의를 거둠 → 홈페이지·사진 주소에서 바로 빠진다
    await consent(customerId, false, new Date(Date.now() + 120_000));
    expect(await publicCases(db)).toHaveLength(0);
    expect(await publicCaseFile(db, before)).toBe(false);
    await expect(saveCase(db, advisor(), id, input)).rejects.toThrow(/동의/);
    await expect(createCase(db, tech(), roId)).rejects.toThrow(/상담을 쓸 수 있는/);
  });
});
