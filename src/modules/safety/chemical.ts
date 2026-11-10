// 화학물질 목록·MSDS(F-09-02, STD-09 5절)
// 반입 전에 MSDS를 받아 등록 → 작업장 게시함과 앱에서 누구나 열람 → 신규 물질은 취급자 MSDS 교육
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { chemical } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import {
  DOC_TYPES,
  MAX_DOC_BYTES,
  removeStored,
  sniffDoc,
  storeFile,
} from "@/modules/platform/storage";
import { CHEM_CATEGORIES, PPE } from "./rules";

export class ChemicalError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const must = (a: Actor) => {
  if (!can(a, "safety.manage"))
    throw new ChemicalError("화학물질 목록은 안전환경 담당·대표가 관리합니다");
};

async function row(db: Db, id: string) {
  const [x] = await db.select().from(chemical).where(eq(chemical.id, id));
  if (!x) throw new ChemicalError("화학물질을 찾을 수 없습니다");
  return x;
}

export type ChemicalInput = {
  name: string;
  maker: string;
  category: string;
  hazards: string;
  monthlyUse: string;
  location: string;
  ppe: string[];
  flammable: boolean;
  msdsRevisedOn: string;
  trainedOn: string;
  note: string;
};

function check(i: ChemicalInput) {
  if (!i.name.trim()) throw new ChemicalError("제품명을 적어 주세요");
  if (!(CHEM_CATEGORIES as readonly string[]).includes(i.category))
    throw new ChemicalError("분류를 골라 주세요");
  if (!i.location.trim()) throw new ChemicalError("보관 장소를 적어 주세요");
  if (i.flammable && !/보관함|위험물/.test(i.location))
    throw new ChemicalError(
      "인화성 물질은 위험물 보관함에 둡니다. 보관 장소를 확인해 주세요(예: 위험물 보관함 2칸)",
    );
  if (i.msdsRevisedOn && !DATE.test(i.msdsRevisedOn))
    throw new ChemicalError("MSDS 개정일을 확인해 주세요");
  if (i.trainedOn && !DATE.test(i.trainedOn))
    throw new ChemicalError("교육일을 확인해 주세요");
  const ppe = (PPE as readonly string[]).filter((p) => i.ppe.includes(p));
  return {
    name: i.name.trim(),
    maker: clean(i.maker),
    category: i.category,
    hazards: clean(i.hazards),
    monthlyUse: clean(i.monthlyUse),
    location: i.location.trim(),
    ppe,
    flammable: i.flammable,
    msdsRevisedOn: i.msdsRevisedOn || null,
    trainedOn: i.trainedOn || null,
    note: clean(i.note),
  };
}

export type MsdsUpload = { name: string; bytes: Uint8Array };

async function putMsds(db: Db, id: string, f: MsdsUpload, now: Date) {
  if (f.bytes.length > MAX_DOC_BYTES)
    throw new ChemicalError("MSDS 파일이 너무 큽니다(8MB까지)");
  const type = sniffDoc(f.bytes);
  if (!type)
    throw new ChemicalError(
      "MSDS는 PDF나 사진(JPG·PNG·WEBP)만 올릴 수 있습니다",
    );
  const path = await storeFile(`chem/${id}`, f.bytes, DOC_TYPES[type]);
  await db
    .update(chemical)
    .set({
      msdsPath: path,
      msdsName: f.name.slice(0, 120) || `MSDS.${DOC_TYPES[type]}`,
      msdsUploadedAt: now,
      updatedAt: now,
    })
    .where(eq(chemical.id, id));
}

/** 등록. 새 물질이면 현장에 알리고 MSDS 교육을 할 일에 올린다 */
export async function createChemical(
  db: Db,
  actor: Actor,
  input: ChemicalInput,
  msds: MsdsUpload | null,
  now = new Date(),
) {
  must(actor);
  const v = check(input);
  if (msds?.bytes.length) {
    if (msds.bytes.length > MAX_DOC_BYTES || !sniffDoc(msds.bytes))
      throw new ChemicalError("MSDS는 8MB 이하 PDF나 사진만 올릴 수 있습니다");
  }
  const [r] = await db
    .insert(chemical)
    .values({ ...v, createdBy: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: chemical.id });
  if (msds?.bytes.length) await putMsds(db, r.id, msds, now);
  await writeAudit(db, {
    actorId: actor.id,
    action: "chemical.create",
    entityType: "chemical",
    entityId: r.id,
    after: { name: v.name },
  });
  await notifyRole(
    db,
    "plant_manager",
    `새 화학물질 등록: ${v.name}(${v.category}) — 취급자 MSDS 교육 필요`,
    `chem-new-${r.id}`,
    `/chemicals/${r.id}`,
  );
  return r.id;
}

export async function updateChemical(
  db: Db,
  actor: Actor,
  id: string,
  input: ChemicalInput,
  now = new Date(),
) {
  must(actor);
  await row(db, id);
  const v = check(input);
  await db
    .update(chemical)
    .set({ ...v, updatedAt: now })
    .where(eq(chemical.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "chemical.edit",
    entityType: "chemical",
    entityId: id,
    after: { name: v.name },
  });
}

/** MSDS 바꾸기: 새 판을 올리면 개정일도 같이 적는다 */
export async function replaceMsds(
  db: Db,
  actor: Actor,
  id: string,
  f: MsdsUpload,
  revisedOn: string,
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  if (!f.bytes.length) throw new ChemicalError("MSDS 파일을 골라 주세요");
  if (revisedOn && !DATE.test(revisedOn))
    throw new ChemicalError("MSDS 개정일을 확인해 주세요");
  await putMsds(db, id, f, now);
  if (revisedOn)
    await db
      .update(chemical)
      .set({ msdsRevisedOn: revisedOn })
      .where(eq(chemical.id, id));
  if (x.msdsPath) await removeStored(x.msdsPath).catch(() => {});
  await writeAudit(db, {
    actorId: actor.id,
    action: "chemical.msds",
    entityType: "chemical",
    entityId: id,
    after: { revisedOn: revisedOn || x.msdsRevisedOn },
  });
}

/** 사용 중지(목록에서 내림). 기록은 남는다 */
export async function retireChemical(
  db: Db,
  actor: Actor,
  id: string,
  active: boolean,
  now = new Date(),
) {
  must(actor);
  await row(db, id);
  await db
    .update(chemical)
    .set({ active, updatedAt: now })
    .where(eq(chemical.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: active ? "chemical.restore" : "chemical.retire",
    entityType: "chemical",
    entityId: id,
  });
}

export async function listChemicals(db: Db, all = false) {
  const rows = await db
    .select()
    .from(chemical)
    .orderBy(asc(chemical.category), asc(chemical.name));
  return all ? rows : rows.filter((r) => r.active);
}
export const getChemical = row;

/** 지난 등록에서 불러올 값: 같은 분류에서 가장 최근의 보관 장소 */
export async function lastLocations(db: Db) {
  const rows = await db
    .select({ category: chemical.category, location: chemical.location })
    .from(chemical)
    .orderBy(asc(chemical.updatedAt));
  return Object.fromEntries(
    rows.filter((r) => r.location).map((r) => [r.category, r.location!]),
  );
}

/** 내 할 일: 안전환경 담당은 MSDS 없는 물질, 공장장은 교육 안 한 물질 */
export async function chemicalTodos(db: Db, actor: Actor) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const rows = await listChemicals(db);
  if (can(actor, "safety.manage")) {
    const no = rows.filter((r) => !r.msdsPath);
    if (no.length)
      out.push({
        key: "chem-msds",
        when: "today",
        what: `MSDS 없는 화학물질 ${no.length}건`,
        detail: no
          .map((r) => r.name)
          .slice(0, 3)
          .join(", "),
        href: "/chemicals?f=nomsds",
        action: "올리기",
      });
  }
  if (actor.roles.includes("plant_manager") || actor.roles.includes("safety")) {
    const nt = rows.filter((r) => !r.trainedOn);
    if (nt.length)
      out.push({
        key: "chem-train",
        when: "soon",
        what: `MSDS 교육 안 한 화학물질 ${nt.length}건`,
        detail: "새 물질은 취급자에게 MSDS 교육을 하고 교육일을 적습니다",
        href: "/chemicals?f=notrained",
        action: "확인하기",
      });
  }
  return out;
}

/** MSDS 교육 기록(9.2): 안전환경 담당·공장장·대표. 교육 이수는 11장 교육 기록에도 남긴다 */
export async function recordChemTraining(
  db: Db,
  actor: Actor,
  id: string,
  on: string,
  now = new Date(),
) {
  if (!can(actor, "safety.manage") && !actor.roles.includes("plant_manager"))
    throw new ChemicalError("MSDS 교육 기록은 안전환경 담당·공장장이 합니다");
  await row(db, id);
  if (!DATE.test(on)) throw new ChemicalError("교육한 날을 적어 주세요");
  await db
    .update(chemical)
    .set({ trainedOn: on, updatedAt: now })
    .where(eq(chemical.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "chemical.training",
    entityType: "chemical",
    entityId: id,
    after: { on },
  });
}
