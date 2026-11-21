// 기록 보관함·변경 이력·문서 목록 보강(파일 판별 보관·정기 검토)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { myTodos } from "@/modules/dashboard/todo";
import { ARCHIVE } from "@/modules/listq/archive";
import { runList } from "@/modules/listq/core";
import { LISTS } from "@/modules/listq/registry";
import { diffOf, recordHistory } from "@/modules/platform/history";
import { receiveCorr } from "@/modules/quality/corr";
import { addDocFile, openDocFile, recordDocReview, removeDocFile, reviewDue } from "@/modules/quality/doc-files";
import { listDocs, saveDoc, seedDocs } from "@/modules/quality/qms";
import { docPreviews } from "@/modules/quality/std";
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
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF");
const ext = { no: "EXT-PPG-TDS", name: "PPG 클리어 TDS", kind: "external", rev: "2025판", effectiveOn: "", owner: "공장장", location: "", source: "PPG", receivedOn: "2026-11-01", note: "" };

describe("문서 목록 보강", () => {
  it("외부 문서 파일은 판별로 남고, 이전 판 파일은 뗄 수 없다", async () => {
    const id = await saveDoc(db, quality(), null, ext, now);
    await expect(addDocFile(db, tech(), id, PDF, "tds.pdf", now)).rejects.toThrow(/품질/);
    await addDocFile(db, quality(), id, PDF, "tds-2025.pdf", now);
    expect((await openDocFile(db, id, 0)).mime).toBe("application/pdf");
    await saveDoc(db, quality(), id, { ...ext, rev: "2026판", receivedOn: "2026-11-20" }, now);
    await addDocFile(db, quality(), id, PDF, "tds-2026.pdf", now);
    const d = (await listDocs(db, "all")).find((x) => x.id === id)!;
    expect(d.files.map((f) => f.rev)).toEqual(["2025판", "2026판"]);
    await expect(removeDocFile(db, quality(), id, d.files[0].path, now)).rejects.toThrow(/이전 판/);
    await removeDocFile(db, quality(), id, d.files[1].path, now);
    // 변경 이력: 문서 번호로 찾고, 판 바뀐 것이 전 → 후로 보인다
    const h = await recordHistory(db, ["EXT-PPG-TDS", id]);
    expect(h.map((x) => x.label)).toEqual(expect.arrayContaining(["문서 파일 올림", "문서 파일 뗌"]));
    expect(h.find((x) => x.changes.some((c) => c.key === "판" && c.before === "2025판" && c.after === "2026판"))).toBeTruthy();
  });

  it("절차서 정기 검토: 1년 뒤 할 일, 검토를 기록하면 다음 해로", async () => {
    await seedDocs(db, quality(), now);
    const std = (await listDocs(db)).find((d) => d.no === "STD-Q")!;
    expect(reviewDue(std)).toBe("2027-11-21");
    const later = new Date("2027-11-05T01:00:00Z");
    const t = (await myTodos(db, quality(), later)).find((x) => x.key === "docs-review");
    expect(t?.when).toBe("soon");
    await expect(recordDocReview(db, quality(), std.id, "", later)).rejects.toThrow(/검토 결과/);
    await recordDocReview(db, quality(), std.id, "바꿀 것 없음", later);
    const again = (await listDocs(db)).find((d) => d.no === "STD-Q")!;
    expect(reviewDue(again)).toBe("2028-11-04");
    // 미리 보기: 양식은 본문, 절차서는 절 차례(F-Q-11 새 양식도 들어 있음)
    const pv = await docPreviews(db, quality(), ["F-Q-11", "STD-Q"]);
    expect(pv.get("F-Q-11")?.form).toContain("RC-");
    expect(pv.get("STD-Q")?.sections?.some((x) => x.title === "문서 관리")).toBe(true);
  });
});

describe("기록 보관함", () => {
  it("모든 대장에 양식·열기 정보가 있고, 끝난 기록까지 번호로 찾는다", async () => {
    // 조회줄 목록은 모두 보관함에 들어 있다
    expect(new Set(ARCHIVE.map((a) => a.key))).toEqual(new Set(Object.keys(LISTS)));
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const { no } = await receiveCorr(db, owner, { receivedOn: "2026-11-21", via: "post", party: "가나화재", partyKind: "insurer", theirNo: "", theirDate: "", title: "보험금 지급 안내", body: "", ownerId: "", needReply: false, dueOn: "", note: "" }, [], now);
    const def = LISTS.corr;
    const r = await runList(db, def, owner, { s: no.slice(3), f: "all" });
    expect(r.count).toBe(1);
    const open = ARCHIVE.find((a) => a.key === "corr")!.open!(r.all[0]);
    expect(open).toMatch(/^\/corr\/[0-9a-f-]{36}$/);
    // 기술자는 수발신 대장을 못 본다
    expect(def.allowed(tech())).toBe(false);
  });

  it("이력 칸 비교", () => {
    expect(diffOf({ rev: "v1", note: "a" }, { rev: "v2", note: "a" })).toEqual([{ key: "판", before: "v1", after: "v2" }]);
    expect(diffOf(null, { count: 3 })).toEqual([{ key: "건수", before: "", after: "3" }]);
  });
});
