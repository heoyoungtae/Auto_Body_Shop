// 문자 대행사 어댑터와 연동 준비 안내 — 미래모터스(heoyoungtae/Automotive_Service) server/providers.js 를 옮겨 왔다.
// 어댑터: send(cfg, from, msgs, fetch) → msgs 와 같은 순서의 [{ ok, error? }]. msgs: [{ to(숫자만), text, kind: SMS|LMS, subject }]
import { createHmac, randomBytes } from "node:crypto";

export type SmsKind = "SMS" | "LMS";
export type OutMsg = { to: string; text: string; kind: SmsKind; subject?: string };
export type KakaoMsg = { to: string; text: string; subject?: string; pfId: string; templateId: string; variables: Record<string, string> };
export type SendResult = { ok: boolean; error?: string };
export type Cfg = Record<string, string>;
type F = typeof fetch;

const TIMEOUT = 15_000;
const hmacHex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const hmacB64 = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64");
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const allFail = (msgs: unknown[], error: string): SendResult[] => msgs.map(() => ({ ok: false, error }));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function httpJson(f: F, url: string, opts: RequestInit) {
  const res = await f(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  let data: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    data = JSON.parse(text);
  } catch {
    /* JSON 아님 */
  }
  return { ok: res.ok, status: res.status, data, text };
}

// ── 솔라피 ──
const solapiAuth = (cfg: Cfg) => {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  return `HMAC-SHA256 apiKey=${cfg.apiKey}, date=${date}, salt=${salt}, signature=${hmacHex(cfg.apiSecret, date + salt)}`;
};
async function solapiMany(cfg: Cfg, messages: object[], part: unknown[], f: F, what: string): Promise<SendResult[]> {
  const r = await httpJson(f, "https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: { Authorization: solapiAuth(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!r.ok) return allFail(part, r.data?.errorMessage || `솔라피 오류 (${r.status})`);
  const failed = new Map<string, string>((r.data?.failedMessageList || []).map((x: any) => [String(x.to), x.statusMessage || x.reason || `${what} 실패`])); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (part as { to: string }[]).map((m) => (failed.has(m.to) ? { ok: false, error: failed.get(m.to) } : { ok: true }));
}

type Adapter = {
  send(cfg: Cfg, from: string, msgs: OutMsg[], f: F): Promise<SendResult[]>;
  sendKakao?(cfg: Cfg, from: string, items: KakaoMsg[], f: F): Promise<SendResult[]>;
  balance?(cfg: Cfg, f: F): Promise<string>;
};

const solapi: Adapter = {
  async send(cfg, from, msgs, f) {
    const out: SendResult[] = [];
    for (const part of chunk(msgs, 1000)) {
      try {
        out.push(...(await solapiMany(cfg, part.map((m) => ({ to: m.to, from, text: m.text, type: m.kind, ...(m.kind === "LMS" ? { subject: m.subject } : {}) })), part, f, "발송")));
      } catch (e) {
        out.push(...allFail(part, `솔라피 연결 실패: ${errMsg(e)}`));
      }
    }
    return out;
  },
  // 카카오 알림톡(ATA). 카카오톡을 받을 수 없는 고객은 솔라피의 대체 발송(문자)으로 간다
  async sendKakao(cfg, from, items, f) {
    const out: SendResult[] = [];
    for (const part of chunk(items, 1000)) {
      try {
        out.push(
          ...(await solapiMany(
            cfg,
            part.map((m) => ({ to: m.to, from, type: "ATA", text: m.text, subject: m.subject, kakaoOptions: { pfId: m.pfId, templateId: m.templateId, variables: m.variables, disableSms: false } })),
            part,
            f,
            "알림톡",
          )),
        );
      } catch (e) {
        out.push(...allFail(part, `솔라피 연결 실패: ${errMsg(e)}`));
      }
    }
    return out;
  },
  async balance(cfg, f) {
    const r = await httpJson(f, "https://api.solapi.com/cash/v1/balance", { headers: { Authorization: solapiAuth(cfg) } });
    if (!r.ok) throw new Error(r.data?.errorMessage || `솔라피 오류 (${r.status})`);
    // deposit(예치금)이 콘솔의 '잔액'과 같다. 포인트가 있으면 더한다
    const d = r.data || {};
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const cash = d.deposit != null ? num(d.deposit) : num(d.balance);
    const point = num(d.point);
    const fmt = (n: number) => Math.floor(n + 1e-9).toLocaleString("ko-KR");
    const left = Math.max(0, Math.ceil((cash + point) / 50 - 1e-9));
    return `${point > 0 ? `잔액 ${fmt(cash + point)}원 (예치금 ${fmt(cash)} + 포인트 ${fmt(point)})` : `잔액 ${fmt(cash)}원`} · LMS 약 ${left.toLocaleString("ko-KR")}건`;
  },
};

// ── 알리고 ── (건별 내용이 달라 send_mass. 서버 공인 IP 사전 등록 필요)
const ALIGO_HDR = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
const aligo: Adapter = {
  async send(cfg, from, msgs, f) {
    const out: SendResult[] = new Array(msgs.length);
    for (const kind of ["SMS", "LMS"] as const) {
      const idx = msgs.map((m, i) => (m.kind === kind ? i : -1)).filter((i) => i >= 0);
      for (const part of chunk(idx, 500)) {
        const group = part.map((i) => msgs[i]);
        try {
          const p: Record<string, string> = { key: cfg.apiKey, user_id: cfg.userId, sender: from, msg_type: kind, cnt: String(group.length) };
          group.forEach((m, n) => {
            p[`rec_${n + 1}`] = m.to;
            p[`msg_${n + 1}`] = m.text;
          });
          if (kind === "LMS") p.title = group[0].subject ?? "";
          const r = await httpJson(f, "https://apis.aligo.in/send_mass/", { method: "POST", headers: ALIGO_HDR, body: new URLSearchParams(p).toString() });
          const code = Number(r.data?.result_code);
          const res: SendResult[] =
            !r.ok || !(code >= 1)
              ? allFail(group, r.data?.message || `알리고 오류 (${r.status})`)
              : Number(r.data.error_cnt) > 0
                ? group.map(() => ({ ok: true, error: `일부 실패 ${r.data.error_cnt}건 — 알리고는 건별 결과를 주지 않으니 알리고 콘솔에서 확인하세요` }))
                : group.map(() => ({ ok: true }));
          part.forEach((i, n) => (out[i] = res[n]));
        } catch (e) {
          part.forEach((i) => (out[i] = { ok: false, error: `알리고 연결 실패: ${errMsg(e)}` }));
        }
      }
    }
    return out;
  },
  async balance(cfg, f) {
    const r = await httpJson(f, "https://apis.aligo.in/remain/", { method: "POST", headers: ALIGO_HDR, body: new URLSearchParams({ key: cfg.apiKey, user_id: cfg.userId }).toString() });
    if (!r.ok || Number(r.data?.result_code) < 1) throw new Error(r.data?.message || `알리고 오류 (${r.status})`);
    return `SMS ${r.data.SMS_CNT}건 / LMS ${r.data.LMS_CNT}건`;
  },
};

// ── NHN Cloud ── (건별 본문이 달라 건당 1회, 동시 5건)
const nhn: Adapter = {
  async send(cfg, from, msgs, f) {
    const out: SendResult[] = [];
    for (const part of chunk(msgs, 5)) {
      out.push(
        ...(await Promise.all(
          part.map(async (m): Promise<SendResult> => {
            try {
              const url = `https://api-sms.cloud.toast.com/sms/v3.0/appKeys/${encodeURIComponent(cfg.appKey)}/sender/${m.kind === "LMS" ? "mms" : "sms"}`;
              const body = { body: m.text, sendNo: from, recipientList: [{ recipientNo: m.to }], ...(m.kind === "LMS" ? { title: m.subject } : {}) };
              const r = await httpJson(f, url, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8", "X-Secret-Key": cfg.secretKey }, body: JSON.stringify(body) });
              const h = r.data?.header;
              return r.ok && h?.isSuccessful ? { ok: true } : { ok: false, error: h?.resultMessage || `NHN Cloud 오류 (${r.status})` };
            } catch (e) {
              return { ok: false, error: `NHN Cloud 연결 실패: ${errMsg(e)}` };
            }
          }),
        )),
      );
    }
    return out;
  },
};

// ── 네이버 클라우드 SENS ──
const ncp: Adapter = {
  async send(cfg, from, msgs, f) {
    const out: SendResult[] = new Array(msgs.length);
    const path = `/sms/v2/services/${encodeURIComponent(cfg.serviceId)}/messages`;
    for (const kind of ["SMS", "LMS"] as const) {
      const idx = msgs.map((m, i) => (m.kind === kind ? i : -1)).filter((i) => i >= 0);
      for (const part of chunk(idx, 100)) {
        const group = part.map((i) => msgs[i]);
        try {
          const ts = String(Date.now());
          const sig = hmacB64(cfg.secretKey, `POST ${path}\n${ts}\n${cfg.accessKey}`);
          const body = {
            type: kind,
            contentType: "COMM",
            countryCode: "82",
            from,
            content: group[0].text,
            ...(kind === "LMS" ? { subject: group[0].subject } : {}),
            messages: group.map((m) => ({ to: m.to, content: m.text, ...(kind === "LMS" ? { subject: m.subject } : {}) })),
          };
          const r = await httpJson(f, `https://sens.apigw.ntruss.com${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-ncp-apigw-timestamp": ts, "x-ncp-iam-access-key": cfg.accessKey, "x-ncp-apigw-signature-v2": sig },
            body: JSON.stringify(body),
          });
          const res = r.ok && String(r.data?.statusCode) === "202" ? group.map(() => ({ ok: true })) : allFail(group, r.data?.statusName || r.data?.errorMessage || r.data?.error?.message || `SENS 오류 (${r.status})`);
          part.forEach((i, n) => (out[i] = res[n]));
        } catch (e) {
          part.forEach((i) => (out[i] = { ok: false, error: `SENS 연결 실패: ${errMsg(e)}` }));
        }
      }
    }
    return out;
  },
};

/** 데모: 실제로 보내지 않고 이력만 남긴다(연습·시연용) */
const demo: Adapter = {
  async send(_c, _f, msgs) {
    return msgs.map(() => ({ ok: true }));
  },
  async sendKakao(_c, _f, items) {
    return items.map(() => ({ ok: true }));
  },
  async balance() {
    return "데모 모드: 실제 잔액이 없습니다";
  },
};

export const ADAPTERS: Record<ProviderId, Adapter> = { demo, solapi, aligo, nhn, ncp };

// ── 연동 준비 안내 ──
export type GuideStep = { id: string; title: string; detail: string; link?: string };
const COMMON: GuideStep[] = [
  { id: "sender", title: "발신번호 사전 등록", detail: "전기통신사업법에 따라 사전 등록·인증된 번호로만 보낼 수 있습니다. 대행사 콘솔에서 발신번호를 등록하고(통신서비스 이용증명원, 사업자등록증 등 서류 인증), 승인된 번호를 아래 '문자 발신번호'에 똑같이 적으세요." },
  { id: "charge", title: "요금 충전(선불) 또는 결제수단 등록", detail: "잔액이 없으면 보내지지 않습니다. 건당 요금은 서비스마다 다르니 각 서비스에서 확인하세요." },
  { id: "optout", title: "광고 문자: 무료수신거부 번호 준비", detail: "광고성 문자에는 (광고) 표기와 무료수신거부 번호가 필요합니다. 아래 '무료수신거부 번호'에 실제 번호를 적으세요. 오후 9시~오전 8시에는 광고 문자를 보낼 수 없어 앱이 막습니다." },
  { id: "consent", title: "마케팅 수신동의 고객에게만 광고 발송", detail: "광고 문자는 수신 동의한 고객에게만 보낼 수 있습니다. 앱은 '광고성 문자'를 고르면 동의 고객만 자동으로 고릅니다." },
  { id: "privacy", title: "개인정보 처리방침에 처리 위탁 명시", detail: "받는 사람 번호가 대행사로 전달됩니다. 개인정보 처리방침에 수탁자(대행사 이름)와 위탁 업무(문자 발송)를 적어야 합니다." },
];

export type ProviderId = "demo" | "solapi" | "aligo" | "nhn" | "ncp";
export type ProviderDef = { label: string; site: string; kakao?: boolean; summary: string; fields: { key: string; label: string; secret?: boolean }[]; guide: GuideStep[] };

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  demo: { label: "데모 (실제 발송 안 함)", site: "", summary: "발송 이력만 남깁니다. 연습·시연용입니다.", fields: [], guide: [] },
  solapi: {
    label: "솔라피 (Solapi)",
    site: "https://solapi.com",
    kakao: true,
    summary: "개발자 친화적인 API, 가입·시험이 간단합니다. 잔액 조회와 카카오 알림톡을 지원합니다(권장).",
    fields: [
      { key: "apiKey", label: "API Key" },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    guide: [
      { id: "signup", title: "솔라피 가입", detail: "solapi.com 에서 회원가입 후 본인(또는 사업자) 인증을 합니다.", link: "https://solapi.com" },
      COMMON[0],
      { id: "apikey", title: "API Key 발급", detail: "콘솔의 API Key 관리에서 API Key 와 API Secret 을 발급해 아래에 적으세요. Secret 은 발급할 때 한 번만 보일 수 있으니 따로 보관하세요." },
      ...COMMON.slice(1),
    ],
  },
  aligo: {
    label: "알리고 (Aligo)",
    site: "https://smartsms.aligo.in",
    summary: "국내 소상공인 이용이 많은 서비스. 서버 IP 등록이 필요합니다. 잔여 건수 조회 지원.",
    fields: [
      { key: "userId", label: "사용자 ID" },
      { key: "apiKey", label: "인증키(API Key)", secret: true },
    ],
    guide: [
      { id: "signup", title: "알리고 가입", detail: "문자 API 서비스에 가입하고 본인 인증을 합니다.", link: "https://smartsms.aligo.in" },
      COMMON[0],
      { id: "apikey", title: "API 신청 및 인증키 발급", detail: "관리자 화면의 문자 API 메뉴에서 API 사용을 신청하고 인증키를 받아 사용자 ID 와 함께 적으세요." },
      { id: "ip", title: "발송 서버 IP 등록(필수)", detail: "알리고는 등록된 IP 에서만 호출을 받습니다. 이 앱 서버(오라클 클라우드)의 공인 IP 를 알리고 API 설정에 등록하세요." },
      ...COMMON.slice(1),
    ],
  },
  nhn: {
    label: "NHN Cloud SMS",
    site: "https://www.nhncloud.com",
    summary: "클라우드형 서비스, 대량 발송에 알맞습니다.",
    fields: [
      { key: "appKey", label: "App Key" },
      { key: "secretKey", label: "Secret Key", secret: true },
    ],
    guide: [
      { id: "signup", title: "NHN Cloud 가입 및 프로젝트 생성", detail: "가입 후 프로젝트를 만들고 결제 정보를 등록합니다.", link: "https://www.nhncloud.com" },
      { id: "enable", title: "Notification > SMS 서비스 활성화", detail: "프로젝트에서 SMS 서비스를 켭니다." },
      COMMON[0],
      { id: "apikey", title: "App Key / Secret Key 확인", detail: "SMS 콘솔의 URL & AppKey 메뉴에서 확인해 적으세요." },
      ...COMMON.slice(1),
    ],
  },
  ncp: {
    label: "네이버 클라우드 SENS",
    site: "https://www.ncloud.com",
    summary: "네이버 클라우드의 Simple & Easy Notification Service.",
    fields: [
      { key: "serviceId", label: "서비스 ID" },
      { key: "accessKey", label: "Access Key" },
      { key: "secretKey", label: "Secret Key", secret: true },
    ],
    guide: [
      { id: "signup", title: "네이버 클라우드 가입 및 결제수단 등록", detail: "가입 후 결제수단을 등록합니다.", link: "https://www.ncloud.com" },
      { id: "project", title: "SENS 프로젝트 생성", detail: "SENS 에서 프로젝트를 만들고 서비스 ID 를 확인해 적으세요." },
      COMMON[0],
      { id: "apikey", title: "API 인증키 발급", detail: "마이페이지의 인증키 관리에서 Access Key 와 Secret Key 를 발급해 적으세요." },
      ...COMMON.slice(1),
    ],
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const isProviderId = (v: string): v is ProviderId => v in PROVIDERS;
