import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
/** postgres-js(운영)와 PGlite(테스트) 모두 받는 DB 타입. 트랜잭션도 같은 타입으로 다룬다. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export async function connect(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error("DATABASE_URL 이 없음");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  return drizzle(postgres(url), { schema }) as unknown as Db;
}

export { schema };
