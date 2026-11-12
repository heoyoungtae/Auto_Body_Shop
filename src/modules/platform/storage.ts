// 파일 보관(사진·서명). 운영은 STORAGE_DIR(/data/files, 도커 볼륨, 백업 대상), 로컬은 .data/files.
// DB 에는 보관 폴더 기준 상대 경로만 둔다. 화면에는 /api/files/<경로> 로 로그인한 직원에게만 보여 준다.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { UserError } from "./errors";

export const storageRoot = () => process.env.STORAGE_DIR ?? join(process.cwd(), ".data/files");

/** 받는 형식과 크기 상한 */
export const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** 서류(사업자등록증·통장 사본 등): 그림 또는 PDF, 8MB까지 */
export const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, "application/pdf": "pdf" };
export const MAX_DOC_BYTES = 8 * 1024 * 1024;

const SAFE = /^[a-z0-9][a-z0-9/_.-]*$/;

/** 보관 폴더 밖을 가리키는 경로(../ 등)를 막는다 */
export function resolveStored(rel: string): string {
  const clean = normalize(rel).replace(/^([/\\])+/, "");
  if (!SAFE.test(clean.split(sep).join("/")) || clean.split(sep).includes("..")) throw new UserError("잘못된 파일 경로입니다");
  return join(storageRoot(), clean);
}

/** 파일을 저장하고 상대 경로를 돌려준다. dir 예: ro/RO-2611-0001 */
export async function storeFile(dir: string, bytes: Uint8Array, ext: string): Promise<string> {
  const rel = `${dir}/${randomUUID()}.${ext}`.toLowerCase();
  const abs = resolveStored(rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return rel;
}

export const readStored = (rel: string) => readFile(resolveStored(rel));

export async function removeStored(rel: string) {
  await rm(resolveStored(rel), { force: true });
}

/** 파일 앞머리로 실제 그림 형식을 확인한다(확장자·브라우저 말만 믿지 않음) */
export function sniffImage(b: Uint8Array): keyof typeof IMAGE_TYPES | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

/** 그림 또는 PDF(%PDF-) */
export function sniffDoc(b: Uint8Array): keyof typeof DOC_TYPES | null {
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  return sniffImage(b);
}

export const contentTypeOf = (rel: string) =>
  rel.endsWith(".webp") ? "image/webp" : rel.endsWith(".png") ? "image/png" : rel.endsWith(".jpg") ? "image/jpeg" : rel.endsWith(".pdf") ? "application/pdf" : rel.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
