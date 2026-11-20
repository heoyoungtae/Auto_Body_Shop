// 협력업체 옮기기(대표 요청 2026-11-20): 테스트 서버(오라클)에서 '내보내기'로 파일 하나를 받아, 미니 PC 앱에서 '가져오기'로 넣는다.
// 업체 정보와 서류 파일(사진·PDF)을 함께 옮긴다. 입금 계좌·통장 사본은 옮기지 않는다(계좌 바꿔치기 방지 규칙: 받는 쪽에서 회계·대표가 다시 넣고 전화 확인).
// 가져온 업체는 모두 '후보'로 들어가고, 등록 평가·대표 승인은 받는 쪽에서 새로 한다. 같은 사업자등록번호(없으면 같은 이름)는 건너뛴다.
import { inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { supplier } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { readStored } from "@/modules/platform/storage";
import { addSupplierDocFiles, createSupplier, SupplierError } from "./supplier";

type Actor = { id: string; roles: Role[] };
export const TRANSFER_FORMAT = "auto-body-shop/suppliers";

export type TransferFile = { doc: string; name: string; data: string };
export type TransferSupplier = {
  name: string;
  bizNo: string | null;
  kinds: string[];
  items: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  leadDays: number | null;
  returnTerms: string | null;
  docs: string[];
  note: string | null;
  payTerm: string;
  payDay: number | null;
  status: string;
  files: TransferFile[];
};
export type TransferPack = { format: typeof TRANSFER_FORMAT; version: 1; exportedAt: string; suppliers: TransferSupplier[] };

/** 내보내기: 고른 상태의 업체(기본 후보·승인 대기). 공장장·대표 */
export async function exportSuppliers(db: Db, actor: Actor, statuses: string[] = ["candidate", "proposed"], now = new Date()): Promise<TransferPack> {
  if (!can(actor, "supplier.manage")) throw new SupplierError("협력업체 내보내기는 공장장·대표가 합니다");
  const rows = await db.select().from(supplier).where(inArray(supplier.status, statuses)).orderBy(supplier.name);
  const out: TransferSupplier[] = [];
  for (const s of rows) {
    const files: TransferFile[] = [];
    for (const f of s.docFiles) {
      if (f.doc === "bankbook") continue;
      const bytes = await readStored(f.path).catch(() => null);
      if (bytes) files.push({ doc: f.doc, name: f.name, data: Buffer.from(bytes).toString("base64") });
    }
    out.push({
      name: s.name,
      bizNo: s.bizNo,
      kinds: s.kinds,
      items: s.items,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      leadDays: s.leadDays,
      returnTerms: s.returnTerms,
      docs: s.docs.filter((d) => d !== "bankbook"),
      note: s.note,
      payTerm: s.payTerm,
      payDay: s.payDay,
      status: s.status,
      files,
    });
  }
  await writeAudit(db, { actorId: actor.id, action: "supplier.export", entityType: "supplier", entityId: "export", after: { count: out.length, statuses } });
  return { format: TRANSFER_FORMAT, version: 1, exportedAt: now.toISOString(), suppliers: out };
}

export type ImportResult = { added: { id: string; name: string; files: number }[]; skipped: { name: string; why: string }[] };

/** 가져오기: 모두 후보로 넣는다. 한 업체가 틀려도 나머지는 넣고 이유를 알려 준다 */
export async function importSuppliers(db: Db, actor: Actor, raw: string, now = new Date()): Promise<ImportResult> {
  if (!can(actor, "supplier.manage")) throw new SupplierError("협력업체 가져오기는 공장장·대표가 합니다");
  let pack: TransferPack;
  try {
    pack = JSON.parse(raw);
  } catch {
    throw new SupplierError("내보내기 파일이 아닙니다(.json 파일을 고르세요)");
  }
  if (pack?.format !== TRANSFER_FORMAT || !Array.isArray(pack.suppliers)) throw new SupplierError("협력업체 내보내기 파일이 아닙니다");
  if (pack.suppliers.length > 500) throw new SupplierError("한 번에 500곳까지 가져옵니다");
  const have = await db.select({ name: supplier.name, bizNo: supplier.bizNo }).from(supplier);
  const bizSet = new Set(have.map((h) => h.bizNo?.replace(/\D/g, "")).filter(Boolean));
  const nameSet = new Set(have.map((h) => h.name.trim()));
  const res: ImportResult = { added: [], skipped: [] };
  for (const s of pack.suppliers) {
    const name = String(s?.name ?? "").trim();
    const biz = String(s?.bizNo ?? "").replace(/\D/g, "");
    if (!name) {
      res.skipped.push({ name: "(이름 없음)", why: "업체 이름이 없습니다" });
      continue;
    }
    if (biz ? bizSet.has(biz) : nameSet.has(name)) {
      res.skipped.push({ name, why: biz ? "같은 사업자등록번호의 업체가 이미 있습니다" : "같은 이름의 업체가 이미 있습니다" });
      continue;
    }
    try {
      const id = await createSupplier(
        db,
        actor,
        {
          name,
          bizNo: biz,
          kinds: Array.isArray(s.kinds) ? s.kinds.map(String) : [],
          items: String(s.items ?? ""),
          contactName: String(s.contactName ?? ""),
          phone: String(s.phone ?? ""),
          email: String(s.email ?? ""),
          leadDays: Number.isInteger(s.leadDays) ? s.leadDays : null,
          returnTerms: String(s.returnTerms ?? ""),
          docs: Array.isArray(s.docs) ? s.docs.map(String).filter((d) => d !== "bankbook") : [],
          note: String(s.note ?? ""),
          payTerm: s.payTerm ? String(s.payTerm) : undefined,
          payDay: Number.isInteger(s.payDay) ? s.payDay : null,
        },
        now,
      );
      let files = 0;
      const ups = (Array.isArray(s.files) ? s.files : [])
        .filter((f) => f && f.doc !== "bankbook" && typeof f.data === "string")
        .map((f) => ({ doc: String(f.doc), name: String(f.name ?? ""), bytes: new Uint8Array(Buffer.from(f.data, "base64")) }));
      // 파일은 하나씩 넣어서, 틀린 파일 하나 때문에 나머지가 빠지지 않게
      for (const u of ups) files += await addSupplierDocFiles(db, actor, id, [u], now).catch(() => 0);
      res.added.push({ id, name, files });
      if (biz) bizSet.add(biz);
      nameSet.add(name);
    } catch (e) {
      res.skipped.push({ name, why: e instanceof Error ? e.message : "넣지 못했습니다" });
    }
  }
  await writeAudit(db, { actorId: actor.id, action: "supplier.import", entityType: "supplier", entityId: "import", after: { added: res.added.length, skipped: res.skipped.length, from: pack.exportedAt } });
  return res;
}
