// 설정 › 도메인(대표 2026-11-21): 계정 금고·토큰 교체·만료 알림
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, auditLog, notification } from "@/db/schema";
import { agentReport } from "@/modules/platform/server-ops";
import { apexOf, domainReminders, domainView, revealPassword, saveAccount, setManualExpiry, submitCfToken } from "@/modules/platform/domain";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const t = (min: number) => new Date(Date.parse("2026-11-21T10:00:00+09:00") + min * 60_000);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const notes = async () => (await db.select().from(notification).where(eq(notification.userId, ids.owner))).map((n) => n.title);
const TOKEN = "abcDEF0123456789abcDEF0123456789abcdWXYZ";

describe("설정 › 도메인", () => {
  it("앱 주소에서 도메인: co.kr 같은 두 단계 끝도", () => {
    expect(apexOf("app.jmotors.co.kr")).toBe("jmotors.co.kr");
    expect(apexOf("app.example.com")).toBe("example.com");
    expect(apexOf("jmotors.kr")).toBe("jmotors.kr");
  });

  it("계정 비밀번호는 암호화해 두고, 앱 비밀번호를 다시 넣어야 열린다. 열 때마다 기록·알림", async () => {
    await saveAccount(db, owner(), "registrar", { company: "가비아", loginId: "jm", email: "a@b.kr", password: "Gabia!pw1", twoFactor: "on", autoRenew: "on" });
    const raw = JSON.stringify((await db.select().from(appConfig).where(eq(appConfig.key, "domain")))[0]?.data);
    expect(raw).not.toContain("Gabia!pw1");
    const v = await domainView(db, t(0).getTime());
    expect(v.accounts.registrar).toMatchObject({ company: "가비아", loginId: "jm", twoFactor: true, autoRenew: true, hasPassword: true });
    expect(JSON.stringify(v)).not.toContain("pwEnc");

    await expect(revealPassword(db, owner(), "registrar", "wrong", t(1))).rejects.toThrow(/앱 비밀번호/);
    expect(await revealPassword(db, owner(), "registrar", ids.password, t(2))).toBe("Gabia!pw1");
    const acts = (await db.select().from(auditLog)).map((a) => a.action);
    expect(acts).toContain("domain.reveal_failed");
    expect(acts).toContain("domain.reveal");
    expect((await notes()).some((n) => n.includes("열어 보았습니다"))).toBe(true);

    // 비밀번호 칸을 비우고 저장하면 그대로 둔다
    await saveAccount(db, owner(), "registrar", { company: "가비아", loginId: "jm2", password: "" });
    expect(await revealPassword(db, owner(), "registrar", ids.password, t(3))).toBe("Gabia!pw1");
    await expect(saveAccount(db, { id: ids.owner, roles: ["manager" as never] }, "registrar", {})).rejects.toThrow(/대표만/);
  });

  it("새 토큰은 미니 PC 가 한 번 받아 가고, 결과를 알려 오면 대표에게 알린다", async () => {
    await expect(submitCfToken(db, owner(), "short", t(0))).rejects.toThrow(/토큰 모양/);
    await submitCfToken(db, owner(), TOKEN, t(0));
    expect((await domainView(db, t(0).getTime())).tokenPending?.last4).toBe("WXYZ");
    const r = (await agentReport(db, { status: { host: "abs-server", version: "a" } }, t(1))) as { cfTokenNew?: string };
    expect(r.cfTokenNew).toBe(TOKEN);
    await agentReport(db, { cfTokenResult: { ok: true, message: "저장", last4: "WXYZ" } }, t(2));
    const v = await domainView(db, t(2).getTime());
    expect(v.tokenPending).toBeNull();
    expect(v.tokenResult).toMatchObject({ ok: true, last4: "WXYZ" });
    expect(((await agentReport(db, {}, t(3))) as { cfTokenNew?: string }).cfTokenNew).toBeUndefined();
    expect((await notes()).some((n) => n.includes("WXYZ"))).toBe(true);
  });

  it("30분 안에 안 가져가면 버린다", async () => {
    await submitCfToken(db, owner(), TOKEN, t(0));
    expect(((await agentReport(db, {}, t(40))) as { cfTokenNew?: string }).cfTokenNew).toBeUndefined();
    expect((await domainView(db, t(40).getTime())).tokenResult?.ok).toBe(false);
  });

  it("도메인 정보(RDAP·NS·토큰 상태)를 받아 두고, 만료 60·30·7일 전 한 번씩 알린다. 토큰이 나빠지면 알린다", async () => {
    await agentReport(db, { domainInfo: { apex: "jmotors.co.kr", expiry: "2027-01-10T00:00:00Z", ns: ["a.ns.cloudflare.com", "b.ns.cloudflare.com"], token: { ok: false, status: "invalid", last4: "ABCD" }, record: { type: "A", content: "198.51.100.7", proxied: false } } }, t(0));
    const v = await domainView(db, t(0).getTime());
    expect(v).toMatchObject({ expiry: "2027-01-10", nsCloudflare: true, info: { apex: "jmotors.co.kr" } });
    expect(v.expiryDays).toBe(50);
    expect((await notes()).some((n) => n.includes("토큰이 맞지 않습니다"))).toBe(true);
    await domainReminders(db, t(0));
    await domainReminders(db, t(1));
    expect((await notes()).filter((n) => n.includes("50일 뒤")).length).toBe(1);
    await domainReminders(db, t(25 * 1440)); // 25일 뒤: 25일 남음 → 30일 단계
    expect((await notes()).filter((n) => n.includes("만료됩니다")).length).toBe(2);
  });

  it("RDAP 를 못 읽으면 대표가 적은 만료일을 쓴다", async () => {
    await expect(setManualExpiry(db, owner(), "2027/3/1")).rejects.toThrow();
    await setManualExpiry(db, owner(), "2027-03-01");
    expect((await domainView(db, t(0).getTime())).expiry).toBe("2027-03-01");
  });
});
