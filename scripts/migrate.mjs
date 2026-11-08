// 운영 DB 마이그레이션. 앱을 띄우기 전에 한 번 돌린다(이미 적용된 것은 건너뜀).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 이 없음");
const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "src/db/migrations" });
await sql.end();
console.log("마이그레이션 완료");
