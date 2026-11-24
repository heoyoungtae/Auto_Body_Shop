// AOS 1·2묶음(2026-11-23): 청구처 여러 곳·정산 공제·이의 제기·연락 이력·보험사 단가·AOS 씀·AOS 지급 엑셀 맞추기
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { estimateLine, repairOrder, vehicle } from "@/db/schema";
import { applyAosPaid, loadAosUpload, matchAosPaid, parseAosPaid, uploadAosPaid } from "@/modules/repair/aos-paid";
import { splitClaims, adjustedFromLines } from "@/modules/repair/claim-rules";
import { addClaimNote, claimTodos, claimView, markAos, markRequested, saveClaimInfo, saveScope, submitClaim } from "@/modules/repair/claims";
import { getEstimate } from "@/modules/repair/estimate";
import { insurerByName, laborForRo, saveInsurer, setAosEnabled } from "@/modules/repair/insurers";
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
const info = (insurer: string, claimNo: string, deductibleWon = 0) => ({ insurer, claimNo, coverage: "own", faultPct: null, deductibleWon, adjusterName: "", adjusterPhone: "" });

describe("청구처 여러 곳 나누기", () => {
  it("모르는 손해사정 금액은 남은 금액을 똑같이 나누고, 공제는 보험사 몫에서 뺀다", () => {
    const s = splitClaims({ insuranceWon: 1_000_000, generalWon: 0, claims: [
      { adjustedWon: 600_000, deductibleWon: 100_000, customerExtraWon: 0, depreciationWon: 50_000, partsDiscountWon: 20_000 },
      { adjustedWon: null, deductibleWon: 0, customerExtraWon: 0 },
    ] });
    expect(s.per).toEqual([{ adjusted: 600_000, insurerDue: 430_000 }, { adjusted: 400_000, insurerDue: 400_000 }]);
    expect([s.customerDue, s.shopDeduct, s.unapproved]).toEqual([150_000, 20_000, 0]);
    // 줄마다 인정: 10만 원 깎이면 부가세 1만 원까지 빠진다
    expect(adjustedFromLines(1_100_000, [{ id: "a", amount: 300_000 }], { a: { won: 200_000 } })).toBe(990_000);
  });
});

describe("AOS 지급 엑셀 읽기", () => {
  it("제목 줄을 찾아 접수번호·차량번호·지급액·지급일을 읽고 합계 줄은 건너뛴다", () => {
    const rows = parseAosPaid([
      ["보험금 지급 조회", null, null, null],
      ["사고접수번호", "차량번호", "보험사", "지급일자", "지급금액", "비고"],
      ["2611-0001-01", "12가 3456", "가나화재", "2026.11.08", "1,234,000", "도장 감액"],
      ["", "34나5678", "다라손보", 46334, 500000, ""],
      ["합계", "", "", "", "1,734,000", ""],
    ]);
    expect(rows.map((r) => [r.line, r.claimNo, r.plate, r.paidWon, r.paidOn, r.memo])).toEqual([
      [3, "2611-0001-01", "12가3456", 1_234_000, "2026-11-08", "도장 감액"],
      [4, "", "34나5678", 500_000, "2026-11-08", ""],
    ]);
    expect(() => parseAosPaid([["이름", "금액"]])).toThrow(/제목 줄/);
  });
});

describe("보험 청구 AOS 1·2묶음", () => {
  it("쌍방 과실 두 청구처, 이의 제기 중 청구 막기, 연락 이력, AOS 할 일, 지급 엑셀로 입금 확인", async () => {
    const advisor = { id: ids.advisor, roles: ["advisor" as const] };
    const acct = { id: ids.account, roles: ["accounting" as const] };
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const { roId, estimateId } = await approvedRepair(db, ids, now);
    await db.update(repairOrder).set({ insurance: "own", insurer: "가나화재", claimNo: "2611-1" }).where(eq(repairOrder.id, roId));
    const e = await getEstimate(db, estimateId);
    for (const l of e.lines.filter((x) => x.category !== "etc")) await db.update(estimateLine).set({ payer: "insurance" }).where(eq(estimateLine.id, l.id));

    await saveClaimInfo(db, advisor, roId, info("가나화재", "2611-0001-01", 100_000), now);
    await expect(saveClaimInfo(db, advisor, roId, info("다라손보", "X-1"), now, 3)).rejects.toThrow(/차례로/);
    await saveClaimInfo(db, advisor, roId, info("다라손보", "7788-99"), now, 2);
    let v = await claimView(db, roId, 2);
    expect(v.claims.map((c) => c.seq)).toEqual([1, 2]);
    const ins = v.amounts.insuranceWon;

    // AOS 씀이 꺼져 있으면 AOS 할 일 없음, 켜면 선견적 전송 할 일
    expect((await claimTodos(db, now)).some((t) => t.kind.startsWith("aos"))).toBe(false);
    await expect(setAosEnabled(db, advisor, true, now)).rejects.toThrow(/대표/);
    await setAosEnabled(db, owner, true, now);
    expect((await claimTodos(db, now)).filter((t) => t.kind === "aosEstimate")).toHaveLength(2);
    await markAos(db, advisor, roId, "estimateAt", true, now);
    await markAos(db, advisor, roId, "estimateAt", true, now, 2);
    expect((await claimTodos(db, now)).some((t) => t.kind === "aosEstimate")).toBe(false);

    for (const seq of [1, 2]) await markRequested(db, advisor, roId, "사진·견적 전송", now, seq);
    const half = Math.round(ins / 2);
    // 1번: 이의 제기 → 청구 막힘, 연락 이력에 합의 남기면 풀 수 있음
    await saveScope(db, advisor, roId, { adjustedWon: half, customerExtraWon: 0, agreed: true, note: "", depreciationWon: 30_000, dispute: "disputed", disputeNote: "도장 시간 인정 요청" }, now);
    await saveScope(db, advisor, roId, { adjustedWon: ins - half, customerExtraWon: 0, agreed: false, note: "" }, now, 2);
    expect((await claimTodos(db, now)).some((t) => t.kind === "dispute")).toBe(true);
    await db.update(repairOrder).set({ status: "delivered" }).where(eq(repairOrder.id, roId));
    const docs = ["bill", "statement", "photos", "parts"];
    await expect(submitClaim(db, advisor, roId, { claimedWon: null, docs }, now)).rejects.toThrow(/이의/);
    await addClaimNote(db, advisor, roId, { kind: "reply", note: "손해사정사: 재검토 불가" }, now);
    await saveScope(db, advisor, roId, { adjustedWon: half, customerExtraWon: 0, agreed: true, note: "", depreciationWon: 30_000, dispute: "agreed" }, now);
    v = await claimView(db, roId);
    expect(v.notes.map((n) => n.kind)).toContain("reply");
    expect(v.amounts.insurerDue).toBe(half - 130_000);
    expect(v.amounts.insurerDueTotal).toBe(ins - 130_000);
    expect(v.amounts.depreciationTotal).toBe(30_000);
    await submitClaim(db, advisor, roId, { claimedWon: null, docs }, now);
    await submitClaim(db, advisor, roId, { claimedWon: null, docs }, now, 2);
    // 청구 AOS 전송 할 일
    expect((await claimTodos(db, now)).filter((t) => t.kind === "aosClaim")).toHaveLength(2);

    // AOS 지급 엑셀: 1번은 접수번호로 감액 입금, 2번은 차량번호로 전액
    const [veh] = await db.select({ plate: vehicle.plateNo }).from(vehicle).innerJoin(repairOrder, eq(repairOrder.vehicleId, vehicle.id)).where(eq(repairOrder.id, roId));
    const csv = ["사고접수번호,차량번호,지급일자,지급금액,감액사유", `2611-0001-01,${veh.plate},2026-11-09,${half - 140_000},부품 단가 차이`, `,${veh.plate},2026-11-09,${ins - half},`, "999999,99하9999,2026-11-09,1000,"].join("\n");
    await expect(uploadAosPaid(db, advisor, { bytes: new TextEncoder().encode(csv), fileName: "지급.csv" }, now)).rejects.toThrow(/회계/);
    expect(await uploadAosPaid(db, acct, { bytes: new TextEncoder().encode(csv), fileName: "지급.csv" }, now)).toBe(3);
    const up = (await loadAosUpload(db, acct.id))!;
    expect((await matchAosPaid(db, up.rows)).map((m) => [m.status, m.claim?.seq ?? null])).toEqual([["cut", 1], ["ok", 2], ["none", null]]);
    const r = await applyAosPaid(db, acct, [{ line: 2, cutReason: "" }, { line: 3, cutReason: "" }, { line: 4, cutReason: "" }], now);
    expect([r.done.length, r.failed.length]).toEqual([2, 1]);
    expect((await claimView(db, roId)).claim!.cutReason).toBe("부품 단가 차이");
    // 같은 파일을 다시 맞춰도 두 번 적히지 않는다
    expect((await matchAosPaid(db, up.rows)).map((m) => m.status)).toEqual(["paid", "paid", "none"]);
  });

  it("보험사 목록의 계약 시간당 공임이 보험 견적에 쓰이고, 단가는 대표만 바꾼다", async () => {
    const advisor = { id: ids.advisor, roles: ["advisor" as const] };
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const ins = (await insurerByName(db, "삼성 화재"))!;
    expect(ins).toBeTruthy();
    const base = { id: ins.id, name: ins.name, kind: ins.kind, note: "", active: true, contacts: [] };
    await expect(saveInsurer(db, advisor, { ...base, rateWon: 40_000, partsDiscount: "" }, now)).rejects.toThrow(/대표/);
    await saveInsurer(db, advisor, { ...base, rateWon: null, partsDiscount: "", contacts: [{ name: "김보상", phone: "010-1234-5678" }] }, now);
    await saveInsurer(db, owner, { ...base, rateWon: 41_000, partsDiscount: "2.5" }, now);
    const { roId } = await approvedRepair(db, ids, now);
    expect((await laborForRo(db, roId, now))._insurerRate).toBeUndefined();
    await db.update(repairOrder).set({ insurance: "own", insurer: ins.name }).where(eq(repairOrder.id, roId));
    const t = await laborForRo(db, roId, now);
    expect([t.RATE, t._insurerRate]).toEqual([41_000, 41_000]);
  });
});
