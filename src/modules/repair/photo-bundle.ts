// 수리 건 사진 한 번에 내려받기(AOS 사진 등록·보험사 메일용, 대표 결정 2026-11-23).
// 입고(방향별) → 진단(손상 부위별) → 작업(공정별) → 검사 차례로 번호와 이름을 붙인다. 사진을 두 번 찍지 않게 한다.
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { inspection, repairOrder, roDamage, roPhoto, workOrder, workStep } from "@/db/schema";
import { readStored } from "@/modules/platform/storage";
import { zip } from "@/modules/platform/xlsx-write";
import { partName, PHOTO_SLOT_LABEL, type PhotoSlot } from "./rules";
import { processLabel } from "./work-rules";

const ext = (rel: string) => (rel.match(/\.(\w+)$/)?.[1] ?? "jpg").toLowerCase();
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").trim();

/** 파일 이름 목록(내용 없이). 시험·미리 보기용 */
export async function photoList(db: Db, roId: string) {
  const [r] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) return null;
  const out: { name: string; rel: string }[] = [];
  let n = 0;
  const add = (label: string, rel: string) => out.push({ name: `${String(++n).padStart(3, "0")}_${safe(label)}.${ext(rel)}`, rel });
  const dmg = await db.select().from(roDamage).where(eq(roDamage.repairOrderId, roId)).orderBy(asc(roDamage.seq));
  const dmgName = new Map(dmg.map((d) => [d.id, `손상${d.seq}_${partName(d.part, d.subPart)}`]));
  const photos = await db.select().from(roPhoto).where(eq(roPhoto.repairOrderId, roId)).orderBy(asc(roPhoto.createdAt));
  for (const p of photos.filter((x) => !x.damageId)) add(`입고_${PHOTO_SLOT_LABEL[p.slot as PhotoSlot] ?? p.slot}`, p.path);
  for (const p of photos.filter((x) => x.damageId)) add(`진단_${dmgName.get(p.damageId!) ?? "손상"}`, p.path);
  const wos = await db.select({ id: workOrder.id }).from(workOrder).where(eq(workOrder.repairOrderId, roId));
  if (wos.length) {
    const steps = await db.select().from(workStep).where(inArray(workStep.workOrderId, wos.map((w) => w.id))).orderBy(asc(workStep.seq));
    for (const s of steps) for (const rel of s.photos) add(`작업_${s.seq}_${processLabel(s.process)}`, rel);
  }
  const insp = await db.select().from(inspection).where(eq(inspection.repairOrderId, roId)).orderBy(asc(inspection.round));
  for (const i of insp) for (const rel of i.photos) add(`출고검사_${i.round}차`, rel);
  return { docNo: r.docNo, files: out };
}

/** zip 파일 하나로. 보관함에 없는 파일은 건너뛴다 */
export async function photoZip(db: Db, roId: string) {
  const l = await photoList(db, roId);
  if (!l) return null;
  const files: [string, Buffer][] = [];
  for (const f of l.files) {
    try {
      files.push([f.name, await readStored(f.rel)]);
    } catch {
      // 지운 파일은 빼고 묶는다
    }
  }
  return { name: `${l.docNo}_사진.zip`, count: files.length, body: zip(files) };
}
