// 도움말 빠짐 검사: 화면·입력 칸·용어에 도움말이 없으면 실패한다(사용자 지시 2026-11-08 "도움말 및 입력도우미를 철저하게").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { addDaysIso, dayLabel, koMoney } from "@/app/_format";
import { FIELD_HELP } from "@/modules/help/fields";
import { DELEGATION_HELP, GLOSSARY, POLICY_HELP, STATUS_HELP } from "@/modules/help/glossary";
import { PAGE_HELP, ROLE_START, ROUTE_HELP } from "@/modules/help/pages";
import { PANEL_HELP } from "@/modules/help/panels";
import { ROLES } from "@/modules/auth/roles";
import { DELEGATION_TASKS } from "@/modules/platform/delegation";
import { POLICY_KEYS } from "@/modules/platform/policy";
import { STATUS_LABEL } from "@/app/_ui";

const APP = join(process.cwd(), "src/app");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(APP).filter((f) => f.endsWith(".tsx"));
const pages = files.filter((f) => f.endsWith(`${sep}page.tsx`)).filter((f) => !f.endsWith(`app${sep}page.tsx`)); // / 는 바로 넘기기만 함
const routeOf = (f: string) => "/" + relative(APP, f).split(sep).slice(0, -1).join("/");

describe("화면 도움말", () => {
  it("모든 화면이 도움말 키를 갖고, 그 키가 PageTitle 에 쓰인다", () => {
    for (const f of pages) {
      const route = routeOf(f);
      const key = ROUTE_HELP[route];
      expect(key, `${route} 화면의 도움말이 ROUTE_HELP 에 없습니다`).toBeTruthy();
      expect(readFileSync(f, "utf8"), `${route} 화면이 help="${key}" 를 쓰지 않습니다`).toContain(`help="${key}"`);
    }
  });

  it("도움말에 적힌 화면은 실제로 있다", () => {
    const routes = new Set(pages.map(routeOf));
    for (const r of Object.keys(ROUTE_HELP)) expect(routes.has(r), `${r} 화면이 없습니다`).toBe(true);
  });

  it("화면 도움말은 목적·쓰는 사람·순서를 모두 갖고, 용어는 용어집에 있다", () => {
    for (const [k, h] of Object.entries(PAGE_HELP)) {
      expect(h.purpose.length, k).toBeGreaterThan(10);
      expect(h.who, k).toBeTruthy();
      expect(h.steps.length, k).toBeGreaterThan(0);
      for (const t of (h as { terms?: string[] }).terms ?? []) expect(GLOSSARY[t], `${k}: 용어 '${t}' 가 용어집에 없습니다`).toBeTruthy();
    }
  });

  it("제목이 있는 패널은 모두 도움말(help)을 갖는다", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<Card\b[\s\S]*?>/g)) {
        if (!/\btitle=/.test(m[0])) continue;
        expect(m[0], `${relative(APP, f)}: 도움말 없는 패널 ${m[0].slice(0, 60)}`).toMatch(/\bhelp=\{/);
      }
    }
  });

  it("패널 도움말의 용어는 용어집에 있다", () => {
    for (const [k, h] of Object.entries(PANEL_HELP)) for (const t of (h as { terms?: string[] }).terms ?? []) expect(GLOSSARY[t], `${k}: ${t}`).toBeTruthy();
  });

  it("모든 역할에 처음 할 일이 있다", () => {
    for (const r of ROLES) expect(ROLE_START[r]?.length, r).toBeGreaterThan(0);
  });
});

describe("입력 칸 도움말", () => {
  it("화면에 맨 input·select·textarea 를 쓰지 않는다(숨은 칸·찾기 칸·미리 보기 칸·사진 올리기 제외). 입력도우미 부품을 쓴다", () => {
    const allowed = new Set(["_input.tsx", "_assist.tsx", "_help-drawer.tsx"]);
    for (const f of files) {
      if (allowed.has(f.split(sep).pop()!)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = m[0];
        // 숨은 칸·찾기 칸·미리 보기 칸, 사진 올리기(data-assist="upload": 단추로 여는 숨은 파일 칸, 패널 도움말이 있음)
        if (/type="hidden"|type="search"|data-assist="preview"|data-assist="upload"/.test(tag)) continue;
        throw new Error(`${relative(APP, f)}: 도움말 없는 입력 칸 ${tag.slice(0, 60)}… → src/app/_input.tsx 부품을 쓰세요`);
      }
    }
  });

  it("화면에서 쓰는 help 키는 모두 FIELD_HELP 에 있다", () => {
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/help="([a-z][\w]*\.[\w]+)"/g)) {
        expect(FIELD_HELP[m[1] as keyof typeof FIELD_HELP] ?? PAGE_HELP[m[1] as keyof typeof PAGE_HELP], `${relative(APP, f)}: ${m[1]}`).toBeTruthy();
      }
    }
  });

  it("형식 규칙은 예시와 맞고, 브라우저(v 플래그)에서 쓸 수 있다", () => {
    for (const [k, h] of Object.entries(FIELD_HELP)) {
      const fmt = (h as { format?: { pattern: string } }).format;
      if (!fmt) continue;
      const re = new RegExp(`^(?:${fmt.pattern})$`, "v");
      const ex = (h as { example?: string }).example;
      if (ex) expect(re.test(ex), `${k} 예시 ${ex}`).toBe(true);
    }
    expect(new RegExp(`^(?:${FIELD_HELP["user.loginId"].format.pattern})$`, "v").test("Hong")).toBe(false);
  });

  it("자세한 설명이나 한 줄 안내가 없는 칸이 없다", () => {
    for (const [k, h] of Object.entries(FIELD_HELP)) expect(("detail" in h && h.detail) || ("hint" in h && h.hint), k).toBeTruthy();
  });
});

describe("설정·상태 설명", () => {
  it("정책값·전결 업무·문서 상태마다 설명이 있다", () => {
    for (const k of POLICY_KEYS) expect(POLICY_HELP[k]?.length, k).toBeGreaterThan(10);
    for (const t of DELEGATION_TASKS) expect(DELEGATION_HELP[t]?.length, t).toBeGreaterThan(10);
    for (const s of Object.keys(STATUS_LABEL)) expect(STATUS_HELP[s], s).toBeTruthy();
  });
});

describe("형식 도우미", () => {
  it("금액을 한글로 읽는다", () => {
    expect(koMoney(1_500_000)).toBe("150만 원");
    expect(koMoney(123_456_789)).toBe("1억 2,345만 6,789원");
    expect(koMoney(300_000_000)).toBe("3억 원");
    expect(koMoney(9_800)).toBe("9,800원");
  });
  it("날짜에 요일과 며칠 뒤를 붙인다", () => {
    expect(dayLabel("2026-11-09", "2026-11-08")).toBe("11월 9일(월) · 내일");
    expect(dayLabel("2026-11-01", "2026-11-08")).toBe("11월 1일(일) · 7일 전");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});
