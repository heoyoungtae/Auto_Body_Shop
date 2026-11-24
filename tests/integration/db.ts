import { SIMPLIFY_KEYS } from "@/modules/platform/simplify";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { DEMO_PASSWORD, DEMO_USERS, seed } from "@/db/seed";
import { eq } from "drizzle-orm";

export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  return db as unknown as Db;
}

/** 역할별 시연 계정 8명. 키는 로그인 아이디 */
export async function seedShop(db: Db) {
  await seed(db, { DEMO_SEED: "1" });
  const ids = {} as Record<(typeof DEMO_USERS)[number]["loginId"], string>;

  for (const u of DEMO_USERS) {
    const [row] = await db.select({ id: schema.appUser.id }).from(schema.appUser).where(eq(schema.appUser.loginId, u.loginId));
    ids[u.loginId as keyof typeof ids] = row.id;
  }
  // 간소화(설정 › 간소화)는 처음 값이 '간편'이지만, 기존 시험은 표준 절차(전부 기록)를 본다. 간소화 시험은 simplify.test.ts 에서 켠다
  await db.insert(schema.policySetting).values(
    SIMPLIFY_KEYS.filter((k) => k.startsWith("simple.")).map((key) => ({ key, value: 0, effectiveFrom: "2000-01-01", reason: "시험: 표준 절차", changedBy: ids.owner })),
  );
  return { ...ids, password: DEMO_PASSWORD };
}
