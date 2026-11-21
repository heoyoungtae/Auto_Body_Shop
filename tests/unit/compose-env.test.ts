// 앱 컨테이너에는 쓰는 환경값만 넘긴다(대표 2026-11-21 '앱에서 비밀값 빼기').
// 앱 코드에서 새 process.env 값을 쓰면 두 compose 파일 app 칸에도 넣어야 운영에서 빠지지 않는다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKIP = new Set(["NODE_ENV", "NEXT_RUNTIME", "VITEST", "PGLITE_DIR", "STORAGE_DIR", "PORT"]);
const SECRETS = ["CF_API_TOKEN", "TUNNEL_TOKEN", "BACKUP_PASSPHRASE", "DB_PASSWORD"];

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
}
function used() {
  const names = new Set<string>();
  for (const f of [...walk("src"), "scripts/migrate.mjs"]) {
    const t = readFileSync(f, "utf8");
    for (const m of t.matchAll(/process\.env\.([A-Z_0-9]+)/g)) names.add(m[1]);
    for (const m of t.matchAll(/\benv\.(INIT_[A-Z_0-9]+|DEMO_SEED)/g)) names.add(m[1]);
  }
  return [...names].filter((n) => !SKIP.has(n));
}
function appEnv(file: string) {
  const t = readFileSync(file, "utf8");
  const from = t.indexOf("\n  app:") + 1;
  const next = t.slice(from + 5).search(/\n  [a-z][a-z0-9_-]*:\n/);
  const app = next < 0 ? t.slice(from) : t.slice(from, from + 5 + next);
  const block = app.slice(app.indexOf("environment:"), app.search(/\n    ports:|\n    volumes:/));
  return { keys: [...block.matchAll(/^\s{6}([A-Z_0-9]+):/gm)].map((m) => m[1]), hasEnvFile: /^ {4}env_file:/m.test(app) };
}

describe("앱 컨테이너 환경값", () => {
  for (const file of ["deploy/compose.minipc.yml", "deploy/compose.yml"]) {
    it(`${file}: 앱이 쓰는 값은 다 넘기고, .env 통째·비밀값은 넘기지 않는다`, () => {
      const { keys, hasEnvFile } = appEnv(file);
      expect(hasEnvFile).toBe(false);
      for (const n of used()) expect(keys, n).toContain(n);
      for (const s of SECRETS) expect(keys).not.toContain(s);
    });
  }
});
