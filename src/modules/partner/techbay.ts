// 테크베이(PRND 상품화, 공업사용) 연결 — 미래모터스 앱(server/techbay.js)과 같은 방식.
// 휴대폰 인증번호로 로그인해 세션(쿠키)을 보관하고, '입고완료' 탭의 접수(주문) 건을 읽어 온다.
// 읽기만 한다: 테크베이 쪽 진행 상태는 이 앱이 바꾸지 않고, 사람이 테크베이에서 등록한 뒤 이 앱에 '등록함'으로 남긴다.
// 테크베이가 진행 상태를 바꾸는 주소를 공개하면(또는 확인되면) 여기에 붙인다.
const BASE = "https://car-purchase-api.prnd.co.kr/reconditioning";
export const TECHBAY_DEFAULT_URL = "https://techbay-reconditioning.prnd.co.kr";

const FUEL: Record<string, string> = { gasoline: "가솔린", diesel: "디젤", lpg: "LPG", hybrid: "하이브리드", plugin_hybrid: "플러그인 하이브리드", phev: "플러그인 하이브리드", electric: "전기", ev: "전기", hydrogen: "수소", cng: "CNG" };

/** "현대 디 올 뉴 싼타페 하이브리드 (MX5) (23년~현재)" → 제조사 "현대", 차종 "디 올 뉴 싼타페 하이브리드 (MX5)" */
export function splitCar(name: unknown) {
  const raw = String(name ?? "")
    .replace(/\s*\([^)]*\d+\s*년[^)]*\)\s*$/, "")
    .trim();
  const m = raw.match(/^(\S+)\s+(.+)$/);
  return m ? { make: m[1].replace(/\(.*\)$/, ""), model: m[2].trim() } : { make: "", model: raw };
}
export const phoneDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const fmtPhone = (p: string) => p.replace(/^(01\d)(\d{3,4})(\d{4})$/, "$1-$2-$3");

export type TechbaySession = { cookies: Record<string, string>; shop: string; phone: string; at: string };
export type TechbayPending = { hashId: string; phone: string; at: number };
export type TechbayOrder = {
  hashId: string;
  requestedAt: string;
  plateNo: string;
  make: string;
  model: string;
  year: number | null;
  fuel: string;
  mileage: number;
  vin: string;
  color: string;
  regDate: string;
  items: { type: string; content: string }[];
  memo: string;
};

export class TechbayError extends Error {}

export type TechbayDeps = {
  fetch?: typeof fetch;
  url: string;
  getSession: () => Promise<TechbaySession | null>;
  putSession: (s: TechbaySession | null) => Promise<void>;
  getPending: () => Promise<TechbayPending | null>;
  putPending: (p: TechbayPending | null) => Promise<void>;
};

export function createTechbay(deps: TechbayDeps) {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const origin = () => {
    try {
      return new URL(deps.url).origin;
    } catch {
      return TECHBAY_DEFAULT_URL;
    }
  };
  const cookieHeader = (s: TechbaySession) =>
    Object.entries(s.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  const mergeCookies = (s: TechbaySession, res: Response) => {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const set = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
    for (const c of set) {
      const m = String(c).match(/^([^=;\s]+)=([^;]*)/);
      if (!m) continue;
      if (/expires=Thu, 01 Jan 1970|max-age=0/i.test(c) || !m[2]) delete s.cookies[m[1]];
      else s.cookies[m[1]] = m[2];
    }
    return s;
  };
  async function call(method: string, path: string, body: unknown, session: TechbaySession | null) {
    const headers: Record<string, string> = { Origin: origin(), Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (session) headers.Cookie = cookieHeader(session);
    if (session?.cookies.csrftoken && method !== "GET") headers["X-CSRFToken"] = session.cookies.csrftoken;
    let res: Response;
    try {
      res = await doFetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new TechbayError("테크베이에 연결하지 못했습니다. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요");
    }
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
    return { res, data };
  }
  const msgOf = (d: Record<string, unknown> | null, dflt: string) => ((d?.toast as { message?: string } | undefined)?.message ?? dflt);

  async function status() {
    const s = await deps.getSession();
    const p = await deps.getPending();
    return { url: deps.url, connected: !!s?.cookies.sessionid, shop: s?.shop ?? "", phone: s?.phone ?? "", at: s?.at ?? "", waitingCode: !!p && Date.now() - p.at < 5 * 60_000 };
  }

  async function requestCode(phone: string) {
    const p = phoneDigits(phone);
    if (!/^01\d{8,9}$/.test(p)) throw new TechbayError("휴대폰 번호를 정확히 적어 주세요(예: 010-1234-5678)");
    const { res, data } = await call("POST", "/phone_number_verifications/request/", { phone_number: p }, null);
    if (!res.ok || !data?.hash_id) throw new TechbayError(msgOf(data, "인증번호를 요청하지 못했습니다. 테크베이에 등록된 번호인지 확인해 주세요"));
    await deps.putPending({ hashId: String(data.hash_id), phone: p, at: Date.now() });
  }

  async function login(code: string, nowIso: string) {
    const p = await deps.getPending();
    if (!p || Date.now() - p.at > 5 * 60_000) throw new TechbayError("인증번호를 먼저 요청해 주세요(요청하고 5분 안에 넣습니다)");
    const c = code.trim();
    if (!/^\d{4,8}$/.test(c)) throw new TechbayError("문자로 받은 인증번호 숫자를 적어 주세요");
    const { res, data } = await call("POST", "/login/", { hash_id: p.hashId, verification_code: c }, null);
    if (!res.ok || !data) throw new TechbayError(msgOf(data, "로그인하지 못했습니다. 인증번호를 확인해 주세요"));
    const s = mergeCookies({ cookies: {}, shop: String(data.reconditioning_shop_name ?? ""), phone: fmtPhone(p.phone), at: nowIso }, res);
    if (!s.cookies.sessionid) throw new TechbayError("테크베이 로그인 정보를 받지 못했습니다. 다시 해 주세요");
    await deps.putSession(s);
    await deps.putPending(null);
  }

  async function logout() {
    await deps.putSession(null);
    await deps.putPending(null);
  }

  /** 로그인이 필요한 요청. 세션이 없거나 끝났으면(401·403) 보관한 세션을 지우고 null */
  async function authed(path: string) {
    const s = await deps.getSession();
    if (!s?.cookies.sessionid) return null;
    const { res, data } = await call("GET", path, null, s);
    if (res.status === 401 || res.status === 403) {
      await deps.putSession(null);
      return null;
    }
    if (!res.ok) throw new TechbayError(msgOf(data, `테크베이에서 주문을 가져오지 못했습니다(${res.status})`));
    const before = JSON.stringify(s.cookies);
    mergeCookies(s, res);
    if (JSON.stringify(s.cookies) !== before) await deps.putSession(s);
    return { data: data as unknown };
  }

  /** '입고완료' 탭의 주문. skip(hashId) 가 true 인 것은 자세히 읽지 않는다(이미 불러온 것) */
  async function orders(skip: (hashId: string) => boolean = () => false): Promise<{ connected: boolean; rows: TechbayOrder[] }> {
    const list: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      const r = await authed(`/reconditioning_orders/?status=reception_completed&page=${page}`);
      if (!r) return { connected: false, rows: [] };
      const d = r.data as { results?: Record<string, unknown>[]; next?: unknown } | Record<string, unknown>[] | null;
      const rows = Array.isArray(d) ? d : (d?.results ?? []);
      const fresh = rows.filter((x) => x?.hash_id && !seen.has(String(x.hash_id)));
      if (!fresh.length) break;
      for (const o of fresh) {
        seen.add(String(o.hash_id));
        list.push(o);
      }
      if (rows.length < 20 && !(!Array.isArray(d) && d?.next)) break;
    }
    const out: TechbayOrder[] = [];
    for (const o of list) {
      const hashId = String(o.hash_id);
      if (skip(hashId)) continue;
      const d = await authed(`/reconditioning_orders/${hashId}/`);
      if (!d) return { connected: false, rows: [] };
      const det = (d.data ?? {}) as Record<string, unknown>;
      const car = ((det.car ?? o.car ?? {}) as Record<string, unknown>) ?? {};
      const cm = splitCar(car.model_part_name);
      const items: { type: string; content: string }[] = [];
      for (const g of (det.groups as { type_display?: string; type?: string; items?: { content?: string }[] }[] | undefined) ?? [])
        for (const it of g.items ?? []) if (it?.content) items.push({ type: g.type_display ?? g.type ?? "", content: String(it.content).trim() });
      out.push({
        hashId,
        requestedAt: String(o.requested_at ?? det.requested_at ?? ""),
        plateNo: String(car.car_number ?? "").replace(/\s/g, ""),
        make: cm.make,
        model: cm.model,
        year: Number(car.year) || null,
        fuel: FUEL[String(car.fuel ?? "").toLowerCase()] ?? "",
        mileage: Number(car.mileage) || 0,
        vin: String(car.vin ?? "").toUpperCase(),
        color: String(car.exterior_description ?? ""),
        regDate: String(car.initial_registration_date ?? "").slice(0, 10),
        items,
        memo: String(det.memo ?? ""),
      });
    }
    return { connected: true, rows: out };
  }

  return { status, requestCode, login, logout, orders };
}
