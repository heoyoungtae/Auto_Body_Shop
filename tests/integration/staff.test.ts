// 직원 명부(F-11-01)·역량 표(F-11-02), STD-11: 명부 권한·암호화, 평가 → 대표 확인, 배정·지도자 점검
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { staffProfile } from "@/db/schema";
import { assignStep, createWorkOrder, getWorkOrder } from "@/modules/repair/work";
import { tenureText } from "@/modules/staff/rules";
import { assessCompetency, confirmAssessment, getProfile, levelsOf, listStaff, pendingAssessments, registerStaff, saveProfile, type ProfileView } from "@/modules/staff/service";
import { approvedRepair } from "./flow";
import { seedShop, testDb } from "./db";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const boss = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

const profile = (o: Partial<ProfileView> = {}): ProfileView => ({
  job: "판금·도장 기술자",
  gender: "m",
  birth: "1990-05-01",
  phone: "010-1111-2222",
  emName: "홍길순",
  emRelation: "배우자",
  emPhone: "01033334444",
  zip: "12345",
  address: "경기도 가나시 다라로 1",
  addressDetail: "101호",
  career: "",
  hiredOn: "2024-03-02",
  contractKind: "regular",
  contractEnd: "",
  licenses: [{ name: "자동차보수도장기능사", no: "A1", on: "2020-01-01" }, { name: "", no: "", on: "" }],
  leftOn: "",
  leftReason: "",
  ...o,
});

describe("근로자 명부", () => {
  it("대표·회계만 적고, 생년월일·주소는 암호화하고, 다른 직원에게는 일부만 보인다", async () => {
    await expect(saveProfile(db, tech(), ids.tech1, profile(), now)).rejects.toThrow(/대표·회계/);
    await expect(saveProfile(db, acct(), ids.tech1, profile({ contractKind: "fixed" }), now)).rejects.toThrow(/기간제/);
    await expect(saveProfile(db, acct(), ids.tech1, profile({ leftOn: "2026-10-01" }), now)).rejects.toThrow(/퇴직 사유/);
    await saveProfile(db, acct(), ids.tech1, profile(), now);
    const [raw] = await db.select().from(staffProfile).where(eq(staffProfile.userId, ids.tech1));
    expect(raw.birthEnc).not.toContain("1990");
    expect(raw.addressEnc).not.toContain("가나시");
    expect(raw.phoneEnc).not.toContain("1111");
    await expect(saveProfile(db, acct(), ids.tech1, profile({ phone: "12345" }), now)).rejects.toThrow(/휴대폰/);
    expect(raw.licenses).toHaveLength(1);
    const mine = await getProfile(db, tech(), ids.tech1);
    expect(mine).toMatchObject({ birth: "1990-05-01", phone: "010-1111-2222", emName: "홍길순", emPhone: "010-3333-4444", zip: "12345", address: "경기도 가나시 다라로 1", addressDetail: "101호" });
    await expect(getProfile(db, tech(), ids.tech2)).rejects.toThrow(/대표·회계/);
    const seen = (await listStaff(db, tech())).find((r) => r.id === ids.tech1)!;
    expect(seen).toMatchObject({ job: "판금·도장 기술자", hiredOn: "2024-03-02", contractKind: null });
    expect((await listStaff(db, owner())).find((r) => r.id === ids.tech1)!.contractKind).toBe("regular");
    expect(tenureText("2024-03-02", "2026-11-08")).toBe("2년 8개월");
  });
});

describe("역량 표", () => {
  it("공장장 평가는 대표가 확인해야 반영되고, 대표 평가는 바로 반영된다", async () => {
    await expect(assessCompetency(db, tech(), { userId: ids.tech2, skill: "weld", level: 2, note: "x", assessedOn: "2026-11-09" }, now)).rejects.toThrow(/공장장·대표/);
    await expect(assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: " ", assessedOn: "2026-11-09" }, now)).rejects.toThrow(/근거/);
    await expect(assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: "x", assessedOn: "2026-11-10" }, now)).rejects.toThrow(/평가일/);
    expect(await assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: "시편 용접 확인", assessedOn: "2026-11-09" }, now)).toEqual({ confirmed: false });
    expect((await levelsOf(db, ids.tech2)).weld).toBe(1);
    const [p] = await pendingAssessments(db);
    await expect(confirmAssessment(db, boss(), p.c.id, true, now)).rejects.toThrow(/대표/);
    await confirmAssessment(db, owner(), p.c.id, true, now);
    expect((await levelsOf(db, ids.tech2)).weld).toBe(2);
    await expect(confirmAssessment(db, owner(), p.c.id, true, now)).rejects.toThrow(/이미/);
    expect(await assessCompetency(db, owner(), { userId: ids.tech2, skill: "sheet", level: 1, note: "재교육", assessedOn: "2026-11-09" }, new Date(now.getTime() + 1000))).toEqual({ confirmed: true });
    expect((await levelsOf(db, ids.tech2)).sheet).toBe(1);
  });

  it("단독 기준 미만이면 3단계 이상 지도자가 있어야 배정된다", async () => {
    await assessCompetency(db, owner(), { userId: ids.tech2, skill: "sheet", level: 1, note: "재교육", assessedOn: "2026-11-09" }, new Date(now.getTime() + 1000));
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    const w = await getWorkOrder(db, id);
    const detach = w.steps.find((s) => s.process === "detach")!;
    expect(w.workers.find((u) => u.id === ids.tech2)!.levels.sheet).toBe(1);
    await expect(assignStep(db, boss(), detach.id, { assignee: ids.tech2, planDate: "", stdMinutes: null }, now)).rejects.toThrow(/지도자/);
    await expect(assignStep(db, boss(), detach.id, { assignee: ids.tech2, mentor: ids.tech2, planDate: "", stdMinutes: null }, now)).rejects.toThrow();
    await assignStep(db, boss(), detach.id, { assignee: ids.tech2, mentor: ids.tech1, planDate: "", stdMinutes: null }, now);
    const after = (await getWorkOrder(db, id)).steps.find((s) => s.id === detach.id)!;
    expect(after.mentorName).toBeTruthy();
  });
});

describe("직원 등록", () => {
  it("대표는 역할까지, 회계 담당은 역할 없이 잠긴 계정으로 등록하고 대표가 역할을 주면 열린다", async () => {
    const { setRoles } = await import("@/modules/auth/service");
    const { appUser } = await import("@/db/schema");
    await expect(registerStaff(db, tech(), { name: "신입", loginId: "newbie", roles: [], profile: profile() }, now)).rejects.toThrow(/대표·회계/);
    await expect(registerStaff(db, owner(), { name: "신입", loginId: "newbie", roles: [], profile: profile() }, now)).rejects.toThrow(/역할/);
    // 명부가 틀리면 계정도 만들지 않는다
    await expect(registerStaff(db, owner(), { name: "신입", loginId: "newbie", roles: ["technician"], profile: profile({ hiredOn: "" }) }, now)).rejects.toThrow(/입사일/);
    expect(await db.select().from(appUser).where(eq(appUser.loginId, "newbie"))).toHaveLength(0);
    const a = await registerStaff(db, owner(), { name: "신입", loginId: "newbie", roles: ["technician"], profile: profile() }, now);
    expect(a.pendingRoles).toBe(false);
    expect((await getProfile(db, owner(), a.id))!.hiredOn).toBe("2024-03-02");
    const b = await registerStaff(db, acct(), { name: "신입2", loginId: "newbie2", roles: ["owner"], profile: profile() }, now);
    expect(b.pendingRoles).toBe(true);
    const [u] = await db.select().from(appUser).where(eq(appUser.id, b.id));
    expect(u.active).toBe(false);
    expect((await listStaff(db, owner())).find((r) => r.id === b.id)!.roles).toEqual([]);
    await setRoles(db, ids.owner, b.id, ["technician"]);
    const [u2] = await db.select().from(appUser).where(eq(appUser.id, b.id));
    expect(u2.active).toBe(true);
  });

  it("임시 비밀번호로 처음 들어오면 새 비밀번호를 정해야 하고, 기한이 지나면 못 들어온다", async () => {
    const { loginWithPassword, getCurrentUser, setFirstPassword, resetPassword, endSessions, sessionsOf } = await import("@/modules/auth/service");
    const { staffTempPassword } = await import("@/modules/staff/service");
    const a = await registerStaff(db, owner(), { name: "임시", loginId: "tempguy", roles: ["technician"], profile: profile() }, now);
    const t = await staffTempPassword(db, owner(), a.id);
    expect(t!.password).toMatch(/^[a-z]{4}\d{4}$/);
    expect(await staffTempPassword(db, tech(), a.id)).toBeNull();
    const token = await loginWithPassword(db, "tempguy", t!.password, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1" }, now);
    expect((await getCurrentUser(db, token, now))!.mustChangePassword).toBe(true);
    await expect(setFirstPassword(db, a.id, t!.password)).rejects.toThrow(/다른/);
    await setFirstPassword(db, a.id, "mypass123");
    expect((await getCurrentUser(db, token, now))!.mustChangePassword).toBe(false);
    expect(await staffTempPassword(db, owner(), a.id)).toBeNull();
    const s = (await sessionsOf(db, [a.id], undefined, now)).get(a.id)!;
    expect(s[0].device).toBe("아이폰 · 사파리");
    // 대표가 다시 발급하면 기기는 끊기고, 기한(7일)이 지나면 로그인할 수 없다
    const temp2 = await resetPassword(db, ids.owner, a.id, now);
    expect(await getCurrentUser(db, token, now)).toBeNull();
    await expect(loginWithPassword(db, "tempguy", temp2, {}, new Date(now.getTime() + 8 * 86_400_000))).rejects.toThrow(/기한/);
    const tok2 = await loginWithPassword(db, "tempguy", temp2, {}, new Date(now.getTime() + 86_400_000));
    await loginWithPassword(db, "tempguy", temp2, {}, new Date(now.getTime() + 86_400_000));
    expect(await endSessions(db, a.id, a.id, "all", (await getCurrentUser(db, tok2, new Date(now.getTime() + 86_400_000)))!.sessionHash)).toBe(1);
  });
});

describe("직원 서류함", () => {
  it("암호화해 보관하고 대표·회계·본인만 열며, 본인이 올린 것은 확인을 기다리고 퇴직 3년 뒤 파기 대상이 된다", async () => {
    const { addStaffFile, openStaffFile, listStaffFiles, checkStaffFile, removeStaffFile, filesToPurge, staffFileTodos } = await import("@/modules/staff/files");
    const { readStored } = await import("@/modules/platform/storage");
    const { staffFile } = await import("@/db/schema");
    const pdf = new Uint8Array([...Buffer.from("%PDF-1.4\n"), 1, 2, 3, 4]);
    await expect(addStaffFile(db, tech(), ids.tech2, { kind: "resume", title: "", fileName: "a.pdf", bytes: pdf })).rejects.toThrow(/본인/);
    await expect(addStaffFile(db, owner(), ids.tech1, { kind: "resume", title: "", fileName: "a.txt", bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow(/PDF/);
    const id = await addStaffFile(db, acct(), ids.tech1, { kind: "license", title: "", licenseName: "자동차정비기능사", fileName: "lic.pdf", bytes: pdf }, now);
    const [row] = await db.select().from(staffFile).where(eq(staffFile.id, id));
    expect(row.title).toBe("자동차정비기능사");
    expect(row.checkedAt).not.toBeNull();
    // 저장된 파일은 원본이 아니다(암호화)
    expect(Buffer.from(await readStored(row.path!)).includes(Buffer.from("%PDF"))).toBe(false);
    expect(Buffer.from((await openStaffFile(db, tech(), id)).bytes).equals(Buffer.from(pdf))).toBe(true);
    await expect(openStaffFile(db, { id: ids.tech2, roles: ["technician"] }, id)).rejects.toThrow(/본인/);
    // 본인이 올리면 확인 대기 → 내 할 일
    const mine = await addStaffFile(db, tech(), ids.tech1, { kind: "resume", title: "이력서", fileName: "cv.jpg", bytes: pdf }, now);
    expect((await staffFileTodos(db, acct(), "2026-11-09")).some((t) => t.key.startsWith("staff-file-check"))).toBe(true);
    await checkStaffFile(db, acct(), mine);
    await expect(removeStaffFile(db, tech(), mine, "잘못 올림")).rejects.toThrow(/대표·회계/);
    await removeStaffFile(db, owner(), mine, "잘못 올림");
    expect((await listStaffFiles(db, owner(), ids.tech1)).map((r) => r.f.id)).toEqual([id]);
    // 퇴직 3년 지나면 파기 대상
    await saveProfile(db, owner(), ids.tech1, profile({ hiredOn: "2020-03-02", leftOn: "2023-01-10", leftReason: "개인 사정" }), now);
    expect((await filesToPurge(db, new Date("2026-01-11T03:00:00Z"))).length).toBe(1);
    expect((await filesToPurge(db, new Date("2026-01-09T03:00:00Z"))).length).toBe(0);
  });
});
