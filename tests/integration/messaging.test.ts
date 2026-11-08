import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, messageLog, messagingConfig } from "@/db/schema";
import { listLogs, MessagingError, saveSms, smsOverview, smsTest } from "@/modules/messaging/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("문자 발송 설정", () => {
  it("데모로 시험 발송하면 이력이 남고 번호는 가려진다", async () => {
    await saveSms(db, ids.owner, { provider: "demo", sender: "", optout: "", fields: {}, checklist: [] });
    const r = await smsTest(db, ids.owner, "010-1234-5678");
    expect(r.ok).toBe(true);
    expect(r.demo).toBe(true);
    const logs = await listLogs(db);
    expect(logs).toHaveLength(1);
    expect(logs[0].to).not.toContain("1234");
    expect((await db.select().from(messageLog))[0].toEnc).not.toContain("01012345678");
  });

  it("비밀 값은 화면에 돌려주지 않고, 빈칸으로 다시 저장하면 그대로 둔다", async () => {
    const base = { provider: "solapi", sender: "0212345678", optout: "080-123-4567", checklist: ["sender"] };
    await saveSms(db, ids.owner, { ...base, fields: { apiKey: "KEY1", apiSecret: "TOPSECRET" } });
    let o = await smsOverview(db);
    let sol = o.providers.find((p) => p.id === "solapi")!;
    expect(sol.fields.find((f) => f.key === "apiSecret")).toMatchObject({ value: "", saved: true });
    expect(JSON.stringify(o)).not.toContain("TOPSECRET");
    const [row] = await db.select().from(messagingConfig);
    expect(row.secrets).not.toContain("TOPSECRET");
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain("TOPSECRET");

    await saveSms(db, ids.owner, { ...base, fields: { apiKey: "KEY2", apiSecret: "" } });
    o = await smsOverview(db);
    sol = o.providers.find((p) => p.id === "solapi")!;
    expect(sol.fields.find((f) => f.key === "apiKey")!.value).toBe("KEY2");
    expect(sol.fields.find((f) => f.key === "apiSecret")!.saved).toBe(true);
  });

  it("실제 대행사는 발신번호가 없으면 저장되지 않는다", async () => {
    await expect(saveSms(db, ids.owner, { provider: "solapi", sender: "", optout: "", fields: { apiKey: "k", apiSecret: "s" }, checklist: [] })).rejects.toBeInstanceOf(MessagingError);
  });
});
