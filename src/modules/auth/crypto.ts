// 비밀번호 해시, 토큰, 개인정보 항목 암호화 — 앱 설계서 9.1·9.2
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(secret, Buffer.from(salt, "base64url"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(expected, actual);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** 운영에서는 APP_ENCRYPTION_KEY(32바이트 base64)가 반드시 있어야 한다 */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY 는 32바이트 base64 여야 함");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY 가 없음");
  return createHash("sha256").update("auto-body-shop-dev-only-key").digest();
}

/** 휴대폰 번호 조회용 HMAC. 숫자만 남겨 정규화한다 */
export function phoneHash(phone: string): string {
  return createHmac("sha256", key()).update(normalizePhone(phone)).digest("hex");
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * 민감정보(주민등록번호·계좌번호, 설계서 9.2) 전용 키. SENSITIVE_ENCRYPTION_KEY 가 있으면 그것을, 없으면 앱 키에서 따로 파생한다.
 * 연락처 키가 새도 민감정보는 바로 열리지 않게 운영에서는 따로 두기를 권한다.
 */
function sensitiveKey(): Buffer {
  const raw = process.env.SENSITIVE_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("SENSITIVE_ENCRYPTION_KEY 는 32바이트 base64 여야 함");
    return k;
  }
  return createHmac("sha256", key()).update("sensitive-data-v1").digest();
}

export function encrypt(plain: string, purpose: "default" | "sensitive" = "default"): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", purpose === "sensitive" ? sensitiveKey() : key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [purpose === "sensitive" ? "s1" : "v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(enc: string): string {
  const [v, iv, tag, body] = enc.split(".");
  if (v !== "v1" && v !== "s1") throw new Error("알 수 없는 암호문 형식");
  const d = createDecipheriv("aes-256-gcm", v === "s1" ? sensitiveKey() : key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** 목록 화면에서 보여 줄 마스킹: 010-****-5678 */
export function maskPhone(phone: string): string {
  const d = normalizePhone(phone);
  return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : "****";
}
