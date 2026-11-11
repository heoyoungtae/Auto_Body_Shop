// 업무일지 문구 빠짐 검사: 감사 로그에 남기는 대상·기록 종류는 모두 일지 문구가 있어야 한다
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_LABEL, ENTITY, SKIP_ACTIONS, VERB } from "@/modules/journal/labels";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const src = walk(join(process.cwd(), "src/modules"))
  .filter((f) => f.endsWith(".ts") && !f.includes("journal"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("업무일지 문구", () => {
  it("writeAudit 대상(entityType)은 모두 이름·영역·화면이 있다", () => {
    const types = new Set([...src.matchAll(/entityType: "([a-z_]+)"/g)].map((m) => m[1]));
    for (const t of types) expect(ENTITY[t], `대상 '${t}' 이 src/modules/journal/labels.ts ENTITY 에 없습니다`).toBeTruthy();
  });
  it("기록 종류(action)는 문구가 있거나, 끝말로 만들 수 있거나, 일지에서 뺀다", () => {
    const actions = new Set([...src.matchAll(/action: (?:[^,"]*\? )?"([a-z_]+\.[a-z_.]+)"(?: : "([a-z_]+\.[a-z_.]+)")?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
    expect(actions.size).toBeGreaterThan(150);
    for (const a of actions) {
      const ok = ACTION_LABEL[a] || SKIP_ACTIONS.has(a) || VERB[a.split(".").pop()!];
      expect(ok, `기록 종류 '${a}' 의 일지 문구가 없습니다(src/modules/journal/labels.ts)`).toBeTruthy();
    }
  });
});
