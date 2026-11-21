// 법규 대장 보강(2026-11-21): 사본 첨부·뗄 때 까닭, 부록 C 새 법규 불러오기 할 일, 대장 법령 자동 개정 감지
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { checkLaws, saveLawKey } from "@/modules/money/law-watch";
import { addLegalFile, createLegal, getLegal, importAppendixC, legalSetupTodos, missingAppendixC, openLegalFile, recordRevCheck, removeLegalFile, type LegalInput } from "@/modules/quality/legal";
import { APPENDIX_C, lawKey, officialLawNames } from "@/modules/quality/legal-rules";
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
const safety = () => ({ id: ids.safety, roles: ["safety" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const base: LegalInput = {
  area: "환경",
  lawName: "대기환경보전법",
  clause: "제23조",
  duty: "도장 부스 배출시설 신고",
  stdRef: "",
  applies: "yes",
  basis: "도장 부스 1기",
  ownerId: "",
  cycle: "yearly",
  nextDue: "2027-11-20",
  evidence: "",
  authority: "구청 환경과",
  permitNo: "",
  validUntil: "",
  note: "",
};

describe("법령명 → 정식 이름", () => {
  it("괄호·시행규칙을 떼고 '·'로 묶인 법을 나눈다", () => {
    expect(officialLawNames("자동차관리법·시행규칙")).toEqual(["자동차관리법"]);
    expect(officialLawNames("근로기준법(직장 내 괴롭힘)")).toEqual(["근로기준법"]);
    expect(officialLawNames("근로기준법·최저임금법")).toEqual(["근로기준법", "최저임금법"]);
    expect(officialLawNames("소방시설법·화재예방법")).toEqual(["소방시설 설치 및 관리에 관한 법률", "화재의 예방 및 안전관리에 관한 법률"]);
    expect(officialLawNames("소음·진동관리법")).toEqual(["소음ㆍ진동관리법"]);
    expect(lawKey("소음ㆍ진동 관리법")).toBe(lawKey("소음·진동관리법"));
  });
});

describe("법규 대장 첨부·새 법규", () => {
  it("사본 올리기·열기·뗄 때 까닭", async () => {
    const id = await createLegal(db, safety(), base, now);
    await expect(addLegalFile(db, tech(), id, PDF, "사본.pdf", now)).rejects.toThrow(/안전환경/);
    await expect(addLegalFile(db, safety(), id, new TextEncoder().encode("hello"), "a.txt", now)).rejects.toThrow(/PDF/);
    await addLegalFile(db, safety(), id, PDF, "배출시설 신고필증.pdf", now);
    const x = await getLegal(db, id);
    expect(x.x.files.map((f) => f.name)).toEqual(["배출시설 신고필증.pdf"]);
    expect((await openLegalFile(db, owner(), id, 0)).mime).toBe("application/pdf");
    await expect(openLegalFile(db, tech(), id, 0)).rejects.toThrow(/권한/);
    await expect(removeLegalFile(db, safety(), id, x.x.files[0].path, "  ", now)).rejects.toThrow(/까닭/);
    await removeLegalFile(db, safety(), id, x.x.files[0].path, "잘못 올림", now);
    const y = await getLegal(db, id);
    expect(y.x.files).toEqual([]);
    expect(y.events.some((v) => v.e.detail?.includes("잘못 올림"))).toBe(true);
  });

  it("부록 C에 새로 더한 법규는 불러오기 할 일로 뜬다", async () => {
    expect((await missingAppendixC(db)).length).toBe(APPENDIX_C.length);
    expect((await legalSetupTodos(db, safety())).map((t) => t.key)).toContain("legal-appendix");
    await importAppendixC(db, safety(), now);
    expect(await missingAppendixC(db)).toEqual([]);
    expect((await legalSetupTodos(db, safety())).map((t) => t.key)).not.toContain("legal-appendix");
    expect(APPENDIX_C.some((c) => c.lawName === "전기안전관리법")).toBe(true);
  });

  it("대장 법령이 바뀌면 할 일, 개정 확인을 기록하면 사라짐", async () => {
    const id = await createLegal(db, safety(), base, now);
    await saveLawKey(db, owner(), "myshop");
    const fake = (stamp: (n: string) => string) =>
      (async (url: string | URL | Request) => {
        const name = new URL(String(url)).searchParams.get("query")!;
        return new Response(JSON.stringify({ LawSearch: { law: [{ 법령명한글: name, 공포일자: stamp(name), 시행일자: "20260101" }] } }), { status: 200 });
      }) as typeof fetch;
    await checkLaws(db, new Date("2026-12-01T00:00:00Z"), { f: fake(() => "20251223") });
    expect((await legalSetupTodos(db, safety())).map((t) => t.key)).not.toContain("legal-law-changed");
    await checkLaws(db, new Date("2027-01-01T00:00:00Z"), { f: fake((n) => (n === "대기환경보전법" ? "20261230" : "20251223")) });
    const t = (await legalSetupTodos(db, safety())).find((x) => x.key === "legal-law-changed");
    expect(t?.detail).toContain("대기환경보전법");
    await recordRevCheck(db, safety(), [id], { changed: true, note: "배출 기준 강화, 영향 없음" }, new Date("2027-01-03T00:00:00Z"));
    expect((await legalSetupTodos(db, safety())).map((x) => x.key)).not.toContain("legal-law-changed");
  });
});
