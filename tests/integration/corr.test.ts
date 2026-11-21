// 문서 수발신 대장(F-Q-11)·회사 공문(F-Q-12): 접수 → 담당·기한 → 회신 공문 결재 → 발송 → 받은 문서 저절로 처리 끝
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, corrDoc, notification } from "@/db/schema";
import { act } from "@/modules/approval/service";
import { myTodos } from "@/modules/dashboard/todo";
import {
  addCorrFile,
  closeReceived,
  corrDailyAlerts,
  discardLetter,
  draftLetter,
  getCorr,
  letterPrefill,
  listCorr,
  openCorrFile,
  partySuggestions,
  receiveCorr,
  recordSent,
  removeCorrFile,
  reopenReceived,
  updateLetter,
  updateReceived,
} from "@/modules/quality/corr";
import { endMark, enclosureList, replyTitle } from "@/modules/quality/corr-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-21T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const safety = () => ({ id: ids.safety, roles: ["safety" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

const inDoc = {
  receivedOn: "2026-11-21",
  via: "post",
  party: "○○구청 환경과",
  partyKind: "agency",
  theirNo: "환경과-1234",
  theirDate: "2026-11-18",
  title: "도장시설 배출시설 현황 제출 요청",
  body: "12월 5일까지 현황 제출",
  ownerId: "",
  needReply: true,
  dueOn: "",
  note: "",
};
const letter = { party: "", partyKind: "", partyAddr: "", cc: "", title: "", body: "", enclosures: "", replyToId: "" };

describe("문서 수발신", () => {
  it("받은 문서: 접수·담당 알림·기한 할 일·파일·처리 끝", async () => {
    await expect(receiveCorr(db, tech(), inDoc, [], now)).rejects.toThrow(/권한/);
    await expect(receiveCorr(db, advisor(), { ...inDoc, party: "" }, [], now)).rejects.toThrow(/보낸 곳/);
    await expect(receiveCorr(db, advisor(), { ...inDoc, receivedOn: "2026-11-22" }, [], now)).rejects.toThrow(/오늘/);
    const { id, no } = await receiveCorr(db, advisor(), { ...inDoc, ownerId: ids.safety }, [{ bytes: PDF, name: "공문.pdf" }], now);
    expect(no).toMatch(/^RC-2611-/);
    const r0 = (await getCorr(db, safety(), id)).r;
    expect(r0.dueOn).toBe("2026-11-28"); // 회신 필요 → 받은 날 + 7일
    expect(r0.files).toHaveLength(1);
    expect((await openCorrFile(db, safety(), id, 0)).mime).toBe("application/pdf");
    const n = await db.select().from(notification).where(eq(notification.userId, ids.safety));
    expect(n.some((x) => x.title.includes("배출시설"))).toBe(true);
    // 기술자는 못 보고, 담당·접수자·대표·품질은 본다
    await expect(getCorr(db, tech(), id)).rejects.toThrow(/권한/);
    await getCorr(db, quality(), id);
    expect((await listCorr(db, tech(), "all")).length).toBe(0);
    expect((await listCorr(db, safety(), "todo")).length).toBe(1);
    // 기한 지나면 담당 할 일 '늦음', 하루 전부터 알림
    const late = new Date("2026-11-29T01:00:00Z");
    expect((await myTodos(db, safety(), late)).find((t) => t.key === `corr-in-${id}`)?.when).toBe("late");
    expect(await corrDailyAlerts(db, late)).toMatch(/1건/);
    // 처리 끝 전에는 고치고 파일을 뗄 수 있다
    await updateReceived(db, safety(), id, { ...inDoc, ownerId: ids.safety, dueOn: "2026-12-05" }, now);
    expect((await getCorr(db, safety(), id)).r.dueOn).toBe("2026-12-05");
    await addCorrFile(db, safety(), id, PDF, "붙임.pdf", now);
    const path = (await getCorr(db, safety(), id)).r.files[1].path;
    await removeCorrFile(db, safety(), id, path, now);
    await expect(closeReceived(db, safety(), id, "", now)).rejects.toThrow(/처리했는지/);
    await closeReceived(db, safety(), id, "확인만 함", now);
    await expect(removeCorrFile(db, safety(), id, r0.files[0].path, now)).rejects.toThrow(/기록/);
    await expect(updateReceived(db, safety(), id, inDoc, now)).rejects.toThrow(/다시 열기/);
    await reopenReceived(db, safety(), id, now);
    expect((await getCorr(db, safety(), id)).r.status).toBe("open");
  });

  it("회신 공문: 앞 문서 불러오기·대표 승인·발송 → 받은 문서 처리 끝", async () => {
    const rc = await receiveCorr(db, advisor(), { ...inDoc, ownerId: ids.safety }, [], now);
    const pre = await letterPrefill(db, safety(), { reply: rc.id });
    expect(pre).toMatchObject({ party: "○○구청 환경과", partyKind: "agency", title: "회신: 도장시설 배출시설 현황 제출 요청", replyToId: rc.id });
    expect(pre!.body).toContain("환경과-1234");
    await expect(draftLetter(db, safety(), { ...letter, ...pre!, body: "" }, now)).rejects.toThrow(/본문/);
    const { id, no } = await draftLetter(db, safety(), { ...letter, ...pre!, body: `${pre!.body}가. 도장 부스 1기`, enclosures: "1. 배출시설 현황 1부" }, now);
    expect(no).toMatch(/^OL-2611-/);
    let g = await getCorr(db, safety(), id);
    expect(g.r.status).toBe("writing");
    expect(g.approval?.status).toBe("in_progress");
    expect((g.approval!.data as { replyToNo: string }).replyToNo).toBe(rc.no);
    // 대표가 아무도 결재하기 전에는 기안자가 고친다(결재 문서 내용도 같이)
    await updateLetter(db, safety(), id, { ...letter, ...pre!, body: "고친 본문" }, now);
    const [ad] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, g.r.approvalId!));
    expect((ad.data as { body: string }).body).toBe("고친 본문");
    await expect(recordSent(db, safety(), id, { sentOn: "2026-11-21", via: "email", note: "" }, now)).rejects.toThrow(/승인 뒤/);
    await act(db, g.r.approvalId!, ids.owner, "approve", null, now);
    g = await getCorr(db, safety(), id);
    expect(g.r.status).toBe("approved");
    await expect(updateLetter(db, safety(), id, { ...letter, ...pre!, body: "또" }, now)).rejects.toThrow(/새 공문/);
    expect((await myTodos(db, safety(), now)).some((t) => t.key === `corr-send-${id}`)).toBe(true);
    await expect(recordSent(db, safety(), id, { sentOn: "2026-11-21", via: "", note: "" }, now)).rejects.toThrow(/방법/);
    await recordSent(db, safety(), id, { sentOn: "2026-11-21", via: "email", note: "" }, now);
    const src = (await getCorr(db, safety(), rc.id)).r;
    expect(src.status).toBe("done");
    expect(src.doneNote).toContain(no);
    expect((await getCorr(db, safety(), rc.id)).replies.map((x) => x.id)).toEqual([id]);
  });

  it("반려 뒤 고치면 다시 올라가고, 결재 전 공문은 버린다", async () => {
    const a = await draftLetter(db, quality(), { ...letter, party: "가나페인트", partyKind: "supplier", title: "단가 협의 요청", body: "내년 단가 협의" }, now);
    const ad = (await getCorr(db, quality(), a.id)).r.approvalId!;
    await act(db, ad, ids.owner, "reject", "단가 표를 붙이세요", now);
    await updateLetter(db, quality(), a.id, { ...letter, party: "가나페인트", partyKind: "supplier", title: "단가 협의 요청", body: "내년 단가 협의", enclosures: "1. 단가표 1부" }, now);
    const [d] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, ad));
    expect(d.status).toBe("in_progress");
    const b = await draftLetter(db, quality(), { ...letter, party: "가나페인트", title: "잘못 씀", body: "x" }, now);
    await expect(discardLetter(db, safety(), b.id, now)).rejects.toThrow(/기안한/);
    await discardLetter(db, quality(), b.id, now);
    const [v] = await db.select().from(corrDoc).where(eq(corrDoc.id, b.id));
    expect(v.status).toBe("void");
    // 지난 공문 상대가 입력도우미에 주소와 함께 나온다
    expect((await partySuggestions(db)).find((p) => p.name === "가나페인트")?.kind).toBe("supplier");
  });

  it("대표가 기안하면 본인 결재로 바로 승인된다", async () => {
    const a = await draftLetter(db, owner(), { ...letter, party: "△△손해보험", partyKind: "insurer", title: "수리비 지급 요청", body: "지급 요청합니다" }, now);
    expect((await getCorr(db, owner(), a.id)).r.status).toBe("approved");
  });

  it("공문 끝맺음·붙임·회신 제목", () => {
    expect(endMark("본문", [])).toEqual({ body: "본문  끝.", enclosures: [] });
    expect(endMark("본문 끝.", ["현황 1부", "사진 2부"])).toEqual({ body: "본문", enclosures: ["현황 1부", "사진 2부.  끝."] });
    expect(enclosureList("1. 현황 1부\n\n2) 사진 2부")).toEqual(["현황 1부", "사진 2부"]);
    expect(replyTitle("회신: 요청")).toBe("회신: 요청");
  });
});
