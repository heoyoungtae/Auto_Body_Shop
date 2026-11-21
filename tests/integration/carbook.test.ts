// 내 차 수첩(고객용 차계부) 1단계: 문자 인증 로그인·잠금, 링크 로그인(그 수리 건만), 홈·이력·서류, 견적 승인, 보증 신청, 사진 숨기기, 차 판 기록
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { canSeeFile, carbookStatus, claimWarranty, endAllSessions, makeLink, markSold, myDocs, myEstimateDoc, myHome, myRepair, myRepairs, openLink, photoChoices, requestCode, saveCarbookConfig, sendInvite, sessionOf, setHiddenPhotos, verifyCode } from "@/modules/carbook/service";
import { mySteps, visiblePhotos } from "@/modules/carbook/rules";
import { approveByCarbook, carbookApprovalView } from "@/modules/repair/estimate-approval";
import { createEstimate, getEstimate, issueEstimate, reviewEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { approvalGroups } from "@/modules/repair/estimate-rules";
import { saveShopInfo } from "@/modules/platform/shop";
import { changeConsent } from "@/modules/customer/service";
import { seedShop, testDb } from "./db";
import { approvedRepair, estimating, PNG, WEBP } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-21T01:00:00Z");
const later = (min: number) => new Date(now.getTime() + min * 60_000);
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const PHONE = "010-1234-5678";

async function login(at = now) {
  const r = await requestCode(db, PHONE, { ip: "1.1.1.1" }, at);
  expect(r.demoCode).toMatch(/^\d{6}$/);
  const { token } = await verifyCode(db, PHONE, r.demoCode!, { ip: "1.1.1.1" }, at);
  return (await sessionOf(db, token, at))!;
}

describe("내 차 수첩 규칙", () => {
  it("손님 단계와 보일 사진", () => {
    expect(mySteps("working").map((s) => s.state)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(mySteps("delivered").every((s) => s.state === "done")).toBe(true);
    expect(visiblePhotos([{ path: "a", slot: "front" }, { path: "b", slot: "dash" }, { path: "c", slot: "rear" }], ["c"]).map((p) => p.path)).toEqual(["a"]);
  });
});

describe("문자 인증 로그인", () => {
  it("등록 안 된 번호도 '보냈습니다'(번호는 안 줌), 틀리면 남은 횟수, 5번이면 잠금, 맞으면 90일 로그인", async () => {
    await estimating(db, ids, now);
    expect(await requestCode(db, "010-9999-0000", {}, now)).toEqual({});
    await expect(verifyCode(db, "010-9999-0000", "123456", {}, now)).rejects.toThrow(/맞지 않습니다/);
    await expect(requestCode(db, "02-123-4567", {}, now)).rejects.toThrow(/휴대폰/);

    const { demoCode } = await requestCode(db, PHONE, {}, now);
    await expect(requestCode(db, PHONE, {}, later(0.2))).rejects.toThrow(/30초/);
    const wrong = demoCode === "000000" ? "111111" : "000000";
    await expect(verifyCode(db, PHONE, wrong, {}, now)).rejects.toThrow(/4번 더/);
    for (let i = 0; i < 3; i++) await expect(verifyCode(db, PHONE, wrong, {}, now)).rejects.toThrow(/맞지 않습니다/);
    await expect(verifyCode(db, PHONE, wrong, {}, now)).rejects.toThrow(/잠겼습니다/);
    await expect(verifyCode(db, PHONE, demoCode!, {}, now)).rejects.toThrow(/잠겼습니다/);
    await expect(requestCode(db, PHONE, {}, later(5))).rejects.toThrow(/잠겼습니다/);

    const r2 = await requestCode(db, PHONE, {}, later(31));
    await expect(verifyCode(db, PHONE, r2.demoCode!, {}, later(35))).rejects.toThrow(/시간이 지났습니다/);
    const r3 = await requestCode(db, PHONE, {}, later(36));
    const { token, maxAgeDays } = await verifyCode(db, PHONE, ` ${r3.demoCode!.slice(0, 3)} ${r3.demoCode!.slice(3)} `, { ip: "1.2.3.4" }, later(37));
    expect(maxAgeDays).toBe(90);
    const s = await sessionOf(db, token, later(38));
    expect(s?.scope).toBe("full");
    expect(s?.name).toBe("홍길동");
    await expect(verifyCode(db, PHONE, r3.demoCode!, {}, later(38))).rejects.toThrow(/먼저 받아/);
    // 인증 문자 기록에는 번호가 남지 않는다
    const logs = await db.select().from(schema.messageLog);
    expect(logs.some((l) => l.body.includes(r3.demoCode!))).toBe(false);
    expect(logs.some((l) => l.body.includes("●●●●"))).toBe(true);
    expect(await sessionOf(db, token, new Date(now.getTime() + 91 * 864e5))).toBeNull();
  });

  it("동의 철회로 연락처를 지우면 로그인이 풀리고, 대표가 끄면 못 들어온다", async () => {
    await estimating(db, ids, now);
    const r = await requestCode(db, PHONE, {}, now);
    const { token } = await verifyCode(db, PHONE, r.demoCode!, {}, now);
    const [c] = await db.select().from(schema.customer);
    await saveCarbookConfig(db, { id: ids.owner, roles: ["owner"] }, { enabled: false, notice: "", hours: "" }, now);
    expect(await sessionOf(db, token, now)).toBeNull();
    await expect(requestCode(db, PHONE, {}, later(1))).rejects.toThrow(/쉬고/);
    await expect(saveCarbookConfig(db, advisor(), { enabled: true, notice: "", hours: "" }, now)).rejects.toThrow(/대표/);
    await saveCarbookConfig(db, { id: ids.owner, roles: ["owner"] }, { enabled: true, notice: "", hours: "평일 9~18시" }, now);
    expect(await sessionOf(db, token, now)).not.toBeNull();
    await changeConsent(db, ids.advisor, c.id, { required: false, photo: false, marketing: false, method: "phone" });
    expect(await sessionOf(db, token, now)).toBeNull();
  });
});

describe("보기·승인·보증", () => {
  it("진행 중 수리 단계·견적 승인 할 일 → 내 차 수첩에서 승인", async () => {
    const roId = await estimating(db, ids, now);
    const { id } = await createEstimate(db, advisor(), roId, now);
    let e = await getEstimate(db, id);
    for (const l of e.lines.filter((x) => x.category === "part")) await saveLine(db, advisor(), id, { id: l.id, payer: l.payer, category: "part", name: l.name, partCode: "D", partNo: "", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
    await saveEstimateHeader(db, advisor(), id, { kind: e.kind, paintGrade: "metallic", dueDate: "2026-11-27", note: "", registeredOn: "2021-03-15" }, now);
    await submitEstimate(db, advisor(), id, now);
    await reviewEstimate(db, { id: ids.manager, roles: ["plant_manager"] }, id, true, "", now);
    await saveShopInfo(db, ids.owner, { name: "외관수리", ceo: "김대표", bizNo: "220-81-62517", repairRegNo: "제2026-1호", address: "경기도", phone: "031-000-0000" });
    await issueEstimate(db, advisor(), id, now);

    const s = await login();
    const home = await myHome(db, s, now);
    expect(home.cars).toHaveLength(1);
    expect(home.active[0].statusLabel).toBe("견적을 만드는 중");
    expect(home.active[0].dueDate).toBe("2026-11-27");
    expect(home.todos[0].href).toBe(`/my/estimate/${id}`);

    const v = await carbookApprovalView(db, s.customerId, id, now);
    expect(v.state).toBe("open");
    e = await getEstimate(db, id);
    const groups = approvalGroups(e.lines);
    // 다른 손님 견적은 못 연다
    const [other] = await db.insert(schema.customer).values({ name: "남", kind: "person" }).returning();
    expect((await carbookApprovalView(db, other.id, id, now)).state).toBe("invalid");
    await expect(approveByCarbook(db, other.id, id, { groups: [groups[0].key], name: "남", agree: true, signaturePng: PNG }, {}, now)).rejects.toThrow(/내 수리/);
    const r = await approveByCarbook(db, s.customerId, id, { groups: groups.map((g) => g.key), name: "홍길동", agree: true, signaturePng: PNG }, { ip: "9.9.9.9" }, now);
    expect(r.outcome).toBe("accepted");
    const [row] = await db.select().from(schema.estimate).where(eq(schema.estimate.id, id));
    expect(row.approvalRef).toMatch(/내 차 수첩\(010-\*\*\*\*-5678 문자 인증\)/);
    expect((await myHome(db, s, now)).todos).toHaveLength(0);
    const doc = await myDocs(db, s);
    expect(doc.map((d) => d.kind)).toEqual(["estimate"]);
    expect(await myEstimateDoc(db, s, id)).toBe(roId);
  });

  it("출고한 수리: 이력·보증·사진(계기판 숨김, 직원이 뺀 사진 숨김)·파일 권한·보증 신청", async () => {
    const { roId, estimateId } = await approvedRepair(db, ids, new Date("2026-10-01T01:00:00Z"));
    await db.update(schema.repairOrder).set({ status: "delivered" }).where(eq(schema.repairOrder.id, roId));
    await db.insert(schema.repairStatement).values({ docNo: "IV-T-1", repairOrderId: roId, estimateId, issuedOn: "2026-10-25", deliveredAt: new Date("2026-10-25T05:00:00Z"), totalWon: 550_000, snapshot: { warranty: [{ kind: "도장·판금", until: "2027-10-25" }], writerSign: "sig/w.png", shop: { sealPath: "shop/seal.png" } } });
    const s = await login();
    const list = await myRepairs(db, s, now);
    expect(list[0]).toMatchObject({ statusLabel: "출고함", total: 550_000, inWarranty: true, deliveredOn: "2026-10-25" });
    const home = await myHome(db, s, now);
    expect(home.active).toHaveLength(0);
    expect(home.warranties[0]).toMatchObject({ kind: "도장·판금", until: "2027-10-25" });

    let d = await myRepair(db, s, roId, now);
    expect(d.damages.length).toBe(2);
    const photos = await db.select().from(schema.roPhoto).where(eq(schema.roPhoto.repairOrderId, roId));
    const dash = photos.find((p) => p.slot === "dash")!;
    const front = photos.find((p) => p.slot === "front")!;
    expect(d.before).not.toContain(dash.path);
    expect(d.before).toContain(front.path);
    expect(await canSeeFile(db, s, dash.path)).toBe(false);
    expect(await canSeeFile(db, s, front.path)).toBe(true);
    expect(await canSeeFile(db, s, "shop/seal.png")).toBe(true);
    expect(await canSeeFile(db, s, "staff/x.png")).toBe(false);

    expect((await photoChoices(db, roId)).some((p) => p.path === dash.path)).toBe(false);
    await expect(setHiddenPhotos(db, tech(), roId, [front.path])).rejects.toThrow(/고객 담당/);
    await setHiddenPhotos(db, advisor(), roId, [front.path, "made/up.png"]);
    d = await myRepair(db, s, roId, now);
    expect(d.before).not.toContain(front.path);
    expect(await canSeeFile(db, s, front.path)).toBe(false);

    await expect(claimWarranty(db, s, roId, { content: "x", wish: "", photos: [] }, now)).rejects.toThrow(/적어 주세요/);
    const c = await claimWarranty(db, s, roId, { content: "보닛 도장에 기포가 생겼어요", wish: "무상 재도장", photos: [WEBP] }, now);
    expect(c.docNo).toMatch(/^CP-/);
    const [cp] = await db.select().from(schema.complaint).where(eq(schema.complaint.id, c.id));
    expect(cp).toMatchObject({ channel: "app", repairOrderId: roId, receivedBy: null });
    expect(cp.statementId).toBeTruthy();
    expect(await canSeeFile(db, s, cp.photos[0])).toBe(true);
    await expect(claimWarranty(db, s, roId, { content: "또 신청합니다 기포", wish: "", photos: [] }, later(10))).rejects.toThrow(/이미/);
    expect((await myRepair(db, s, roId, now)).claims).toHaveLength(1);
  });

  it("링크 로그인은 그 수리 건만, 차 판 기록·초대 문자·모든 기기 로그아웃", async () => {
    const { roId } = await approvedRepair(db, ids, now);
    const [c] = await db.select().from(schema.customer);
    const { token: linkToken } = await makeLink(db, c.id, roId, now);
    const o = await openLink(db, linkToken, {}, now);
    const s = (await sessionOf(db, o!.token, now))!;
    expect(s.scope).toBe("link");
    expect((await myHome(db, s, now)).cars).toHaveLength(0);
    expect((await myRepairs(db, s, now)).map((r) => r.id)).toEqual([roId]);
    await expect(markSold(db, s, "x")).rejects.toThrow(/문자 인증/);
    expect(await openLink(db, "nope", {}, now)).toBeNull();
    expect(await openLink(db, linkToken, {}, new Date(now.getTime() + 91 * 864e5))).toBeNull();

    const full = await login();
    const [v] = await db.select().from(schema.vehicle);
    await markSold(db, full, v.id, now);
    expect((await myHome(db, full, now)).cars).toHaveLength(0);
    expect((await carbookStatus(db, c.id, now)).sold[0].plateNo).toBe("12가3456");

    await expect(sendInvite(db, tech(), c.id, now)).rejects.toThrow(/고객 담당/);
    const inv = await sendInvite(db, advisor(), c.id, now);
    expect(inv.url).toMatch(/\/my\/l\//);
    const logs = await db.select().from(schema.messageLog);
    expect(logs.some((l) => l.body.includes(inv.url))).toBe(false);
    expect((await carbookStatus(db, c.id, now)).devices).toBe(1);
    await endAllSessions(db, c.id);
    expect(await sessionOf(db, o!.token, now)).toBeNull();
  });
});
