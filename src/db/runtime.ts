// 앱이 쓰는 DB 연결. DATABASE_URL 이 있으면 PostgreSQL, 없으면(로컬 개발) .data/ 의 PGlite.
import type { Db } from "./client";
import { connect, schema } from "./client";

const g = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__db ??= open().catch((e) => {
    g.__db = undefined; // 실패한 연결은 다음 요청에서 다시 시도
    throw e;
  });
  return g.__db;
}

async function open(): Promise<Db> {
  const { seed } = await import("./seed");
  if (process.env.DATABASE_URL) {
    const db = await connect(process.env.DATABASE_URL);
    await seed(db);
    return db;
  }
  if (process.env.NODE_ENV === "production") throw new Error("운영 환경에는 DATABASE_URL 이 필요함");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: "src/db/migrations" });
  await seed(db);
  return db;
}
