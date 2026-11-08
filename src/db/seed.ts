// 첫 실행 데이터. 운영: INIT_OWNER_* 환경값으로 대표 계정 하나만 만든다.
// 테스트 서버·로컬: DEMO_SEED=1 이면 역할별 시연 계정을 만든다(비밀번호 공통, deploy/README.md 참고).
import { count, eq } from "drizzle-orm";
import { appUser, competency } from "./schema";
import type { Db } from "./client";
import { createUser } from "@/modules/auth/service";
import type { Role } from "@/modules/auth/roles";

export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { loginId: "owner", name: "김대표", roles: ["owner"] },
  { loginId: "manager", name: "이공장장", roles: ["plant_manager"] },
  { loginId: "advisor", name: "박상담", roles: ["advisor"] },
  { loginId: "tech1", name: "최기술", roles: ["technician"] },
  { loginId: "tech2", name: "정기술", roles: ["technician"] },
  { loginId: "quality", name: "한품질", roles: ["quality"] },
  { loginId: "safety", name: "오안전", roles: ["safety"] },
  { loginId: "account", name: "윤회계", roles: ["accounting"] },
] as const satisfies readonly { loginId: string; name: string; roles: readonly Role[] }[];

export async function seed(db: Db, env: Record<string, string | undefined> = process.env) {
  const [{ n }] = await db.select({ n: count() }).from(appUser);
  if (n > 0) return;
  if (env.DEMO_SEED === "1" || !env.DATABASE_URL) {
    for (const u of DEMO_USERS) await createUser(db, null, { ...u, roles: [...u.roles], password: DEMO_PASSWORD });
    await seedDemoCompetency(db);
    return;
  }
  if (env.INIT_OWNER_LOGIN && env.INIT_OWNER_PASSWORD) {
    await createUser(db, null, { loginId: env.INIT_OWNER_LOGIN, name: env.INIT_OWNER_NAME ?? "대표", password: env.INIT_OWNER_PASSWORD, roles: ["owner"] });
  }
}

/** 시연용 역량 표(F-11-02): 대표가 확인한 값으로 넣는다 */
const DEMO_LEVELS: Record<string, Record<string, number>> = {
  owner: { consult: 4, inspect: 4 },
  manager: { consult: 3, sheet: 4, dent: 4, weld: 4, putty: 4, color: 4, paint: 4, polish: 4, inspect: 4, equip: 4 },
  advisor: { consult: 3 },
  tech1: { sheet: 3, dent: 3, weld: 3, putty: 3, color: 2, paint: 3, polish: 3, equip: 3 },
  tech2: { sheet: 2, dent: 2, weld: 1, putty: 2, color: 2, paint: 2, polish: 2, equip: 2 },
  quality: { inspect: 3, color: 3, polish: 2 },
};

async function seedDemoCompetency(db: Db) {
  const [owner] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.loginId, "owner"));
  for (const [login, levels] of Object.entries(DEMO_LEVELS)) {
    const [u] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.loginId, login));
    if (!u) continue;
    for (const [skill, level] of Object.entries(levels))
      await db.insert(competency).values({ userId: u.id, skill, level, assessedOn: "2026-11-01", assessedBy: owner?.id, confirmedBy: owner?.id, confirmedAt: new Date("2026-11-01T00:00:00Z"), note: "시연용" });
  }
}
