import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, messageLog, messagingConfig } from "@/db/schema";
import { kakaoOverview, listLogs, MessagingError, saveKakao, saveSms, smsOverview, smsTest } from "@/modules/messaging/service";
import { KAKAO_KEYS } from "@/modules/messaging/kakao";
import { myTodos } from "@/modules/dashboard/todo";
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

describe("카카오 알림톡 문구 검수", () => {
  it("검수 전 문구는 대표 할 일, 새로 고친 문구를 먼저 보이고, 모두 표시하면 사라진다", async () => {
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const t0 = (await myTodos(db, owner)).find((t) => t.key === "kakao-review");
    expect(t0?.what).toBe(`카카오 알림톡 문구 검수 받기 ${KAKAO_KEYS.length}건`);
    expect(t0?.detail).toMatch(/새로 만들거나 고친 문구: 수리 완료·출고 안내, 내 차 수첩 알림, 견적 요청 답변 · 그 밖에 검수 전 \d+건/);
    await saveKakao(db, ids.owner, { enabled: false, pfId: "", codes: {}, reviewed: ["ready_notice"] });
    expect((await kakaoOverview(db)).templates.find((t) => t.key === "ready_notice")?.review).toBe("ok");
    await saveKakao(db, ids.owner, { enabled: false, pfId: "", codes: {}, reviewed: [...KAKAO_KEYS] });
    expect((await myTodos(db, owner)).some((t) => t.key === "kakao-review")).toBe(false);
    expect((await myTodos(db, { id: ids.advisor, roles: ["advisor"] })).some((t) => t.key === "kakao-review")).toBe(false);
  });
});
