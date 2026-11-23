// 기프티콘 공급사 — 미래모터스 server/gift.js·giftishow.js 를 참고했다.
// 설정·비즈머니 조회와 상품 목록·발송·취소(발송 흐름은 gift-send.ts).
// 기프티쇼 비즈(KT알파) 연동규격서 v1.06: POST x-www-form-urlencoded, 응답 JSON, code 0000 이 성공.

export type GiftProviderId = "demo" | "giftishow";
export type GuideStep = {
  id: string;
  title: string;
  detail: string;
  link?: string;
};

export const GIFT_PROVIDERS: Record<
  GiftProviderId,
  {
    label: string;
    summary: string;
    fields: { key: string; label: string; secret?: boolean }[];
    guide: GuideStep[];
  }
> = {
  demo: {
    label: "데모 (실제 발송 안 됨)",
    summary: "보기 상품으로 발송 흐름만 연습합니다. 돈이 나가지 않습니다.",
    fields: [],
    guide: [],
  },
  giftishow: {
    label: "기프티쇼 비즈 (KT알파)",
    summary:
      "모바일 쿠폰 B2B 발송. 비즈머니를 미리 충전해 쓰고, 쿠폰 유효기간은 보통 30일이며 연장·환불되지 않습니다.",
    fields: [
      { key: "userId", label: "회원 ID" },
      { key: "authCode", label: "인증 키", secret: true },
      { key: "authToken", label: "인증 토큰", secret: true },
    ],
    guide: [
      {
        id: "signup",
        title: "기프티쇼 비즈 가입",
        detail: "사업자로 가입합니다.",
        link: "https://biz.giftishow.com",
      },
      {
        id: "openapi",
        title: "오픈 API 서비스 가입",
        detail: "서비스 관리에서 오픈 API 를 신청합니다.",
      },
      {
        id: "key",
        title: "상용 KEY 발급 요청",
        detail:
          "영업일 2~3일 심사가 있고 개발·시험 환경은 없습니다. 받은 회원 ID·인증 키·인증 토큰을 아래에 적습니다.",
      },
      {
        id: "callback",
        title: "발신번호 등록",
        detail:
          "[마이비즈 > 발신번호 관리]에 등록한 번호(또는 기본번호 1588-6474)만 쓸 수 있습니다. 아래 '받는 사람에게 보이는 모양'의 발신번호 칸에 적습니다.",
      },
      {
        id: "decorate",
        title: "카드·배너 만들기(쿠폰 꾸미기)",
        detail:
          "기프티쇼 비즈에서 쿠폰 위에 붙는 배너(가게 이름·로고 띠)와 상품 옆에 붙는 카드 그림을 등록하면 카드 아이디·배너 아이디가 나옵니다. 그 번호와 같은 그림을 아래에 넣으면 보내기 화면에서 받는 사람이 보게 될 모양을 미리 볼 수 있습니다. 안 넣으면 기프티쇼 기본 모양으로 갑니다.",
        link: "https://biz.giftishow.com",
      },
      {
        id: "charge",
        title: "비즈머니 충전",
        detail:
          "발송 금액은 비즈머니에서 빠집니다. 잔액이 없으면 보내지지 않습니다.",
      },
      {
        id: "privacy",
        title: "개인정보 처리방침에 처리 위탁 명시",
        detail:
          "받는 사람 번호가 공급사로 전달됩니다. 수탁자 주식회사 케이티알파, 위탁 업무 '모바일 쿠폰 발송과 고객센터 조회·재전송'을 적으세요.",
      },
    ],
  },
};
export const isGiftProviderId = (v: string): v is GiftProviderId =>
  v in GIFT_PROVIDERS;

const ERR: Record<string, string> = {
  E0008: "인증 키가 올바르지 않습니다.",
  E0009: "인증 토큰이 올바르지 않습니다.",
  E0010: "비즈머니 잔액이 부족합니다. 기프티쇼 비즈에서 충전하세요.",
  ERR0301: "API 가입 정보가 없습니다. 상용 키 승인을 확인하세요.",
};

/** 비즈머니 잔액(원). 응답 모양이 다를 수 있어 여러 자리를 찾아본다 */
export async function giftishowBalance(
  cfg: Record<string, string>,
  f: typeof fetch = fetch,
): Promise<number> {
  if (!cfg.userId || !cfg.authCode || !cfg.authToken)
    throw new Error("회원 ID·인증 키·인증 토큰을 먼저 적어 주세요.");
  const body = new URLSearchParams({
    api_code: "0301",
    custom_auth_code: cfg.authCode,
    custom_auth_token: cfg.authToken,
    dev_yn: "N",
    user_id: cfg.userId,
  });
  const res = await f("https://bizapi.giftishow.com/bizApi/bizmoney", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const d = (await res.json().catch(() => null)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!d || String(d.code) !== "0000")
    throw new Error(
      ERR[String(d?.code)] ??
        `${d?.message ?? "공급사 오류"} [응답 코드 ${d?.code ?? res.status}]`,
    );
  for (const box of [d, d.result, d.result?.result, d.data]) {
    if (box == null) continue;
    for (const k of [
      "balance",
      "bizmoney",
      "bizMoney",
      "biz_money",
      "remainAmt",
      "amount",
    ]) {
      const n = Number(String(box[k] ?? "").replace(/[^\d.-]/g, ""));
      if (box[k] != null && Number.isFinite(n)) return n;
    }
  }
  throw new Error(
    `비즈머니 잔액을 응답에서 찾지 못했습니다: ${JSON.stringify(d).slice(0, 200)}`,
  );
}

// ── 상품·발송·취소(기프티쇼 비즈 0101·0204·0202) ──
export type GiftGoods = {
  code: string;
  name: string;
  brand: string;
  price: number;
  /** 상품 그림 주소(공급사가 주는 것. 데모는 없음) */
  image?: string;
  /** 쿠폰 유효기간(받은 날부터 며칠) */
  limitDay?: number;
};

/** 문자 제목 기본값(기프티쇼 MMS 제목은 20자까지) */
export const GIFT_TITLE_MAX = 20;
export const defaultGiftTitle = (shop: string) =>
  `${shop} 선물`.slice(0, GIFT_TITLE_MAX);
/** 기본 문구 안 바꿔 넣는 말 */
export const GIFT_VARS = ["{고객}", "{목적}", "{가게}"] as const;
export const BUILTIN_GIFT_MESSAGE =
  "{고객}님, {가게}입니다. {목적}으로 작은 선물을 보내 드립니다. 감사합니다.";
/** 문구 만들기: 직원이 적은 문구 → 설정의 기본 문구 → 앱 기본 문구 순서. 보내기와 미리보기가 같은 것을 쓴다 */
export function giftMessage(
  typed: string,
  template: string,
  v: { customer: string; purpose: string; shop: string },
) {
  const t = typed.trim() || template.trim() || BUILTIN_GIFT_MESSAGE;
  return t
    .replaceAll("{고객}", v.customer)
    .replaceAll("{목적}", v.purpose)
    .replaceAll("{가게}", v.shop)
    .slice(0, 1000);
}

/** 카드·배너 아이디: 기프티쇼 비즈가 주는 번호(보기 202006010058067) */
export const GIFT_ID_RE = /^[0-9A-Za-z_-]{1,40}$/;

/** 카드·배너 그림(미리보기용으로 앱에 넣어 두는 것) */
export const GIFT_IMAGE_KINDS = ["banner", "card"] as const;
export type GiftImageKind = (typeof GIFT_IMAGE_KINDS)[number];
export const GIFT_IMAGE_RULES: Record<
  GiftImageKind,
  { label: string; where: string; advice: string }
> = {
  banner: {
    label: "배너 그림",
    where: "쿠폰 맨 위에 붙는 가로로 긴 띠(가게 이름·로고)",
    advice: "기프티쇼 비즈 [쿠폰 꾸미기]에 올린 배너와 같은 그림. 가로로 긴 PNG·JPG",
  },
  card: {
    label: "카드 그림",
    where: "상품 그림 옆(위)에 붙는 인사 카드",
    advice: "기프티쇼 비즈 [쿠폰 꾸미기]에 올린 카드와 같은 그림. PNG·JPG",
  },
};
export const MAX_GIFT_IMAGE_BYTES = 3 * 1024 * 1024;

/** 데모 상품(실제 발송 안 됨) */
export const DEMO_GOODS: GiftGoods[] = [
  {
    code: "DEMO-AMERICANO",
    name: "아메리카노 Tall",
    brand: "보기 카페",
    price: 4700,
    limitDay: 30,
  },
  {
    code: "DEMO-CAKE",
    name: "조각 케이크 세트",
    brand: "보기 베이커리",
    price: 9800,
  },
  {
    code: "DEMO-CHICKEN",
    name: "후라이드 치킨",
    brand: "보기 치킨",
    price: 23000,
  },
  {
    code: "DEMO-GAS",
    name: "주유권 3만 원",
    brand: "보기 주유소",
    price: 30000,
  },
  {
    code: "DEMO-WASH",
    name: "손세차 이용권",
    brand: "보기 세차",
    price: 15000,
  },
];

type Cfg = Record<string, string>;
const auth = (cfg: Cfg) => {
  if (!cfg.userId || !cfg.authCode || !cfg.authToken)
    throw new Error("기프티쇼 회원 ID·인증 키·인증 토큰이 설정에 없습니다.");
  return {
    custom_auth_code: cfg.authCode,
    custom_auth_token: cfg.authToken,
    dev_yn: "N",
    user_id: cfg.userId,
  };
};
async function call(
  path: string,
  params: Record<string, string>,
  f: typeof fetch,
) {
  const res = await f(`https://bizapi.giftishow.com/bizApi/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const d = (await res.json().catch(() => null)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const inner =
    d?.result && typeof d.result === "object" && "code" in d.result
      ? d.result
      : null;
  const code = String(inner?.code ?? d?.code ?? res.status);
  if (!d || code !== "0000")
    throw new Error(
      ERR[code] ??
        `${inner?.message ?? d?.message ?? "공급사 오류"} [응답 코드 ${code}]`,
    );
  return (inner?.result ?? d.result ?? d) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** 공급사가 준 그림 주소는 https 만 쓴다(http 는 https 로 바꿔 본다) */
function httpsUrl(v: unknown): string | undefined {
  const u = String(v ?? "").trim();
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) return u.replace(/^http:/i, "https:");
  return undefined;
}

/** 상품 목록(판매 중) */
export async function giftishowGoods(
  cfg: Cfg,
  f: typeof fetch = fetch,
): Promise<GiftGoods[]> {
  const r = await call(
    "goods",
    { api_code: "0101", ...auth(cfg), start: "1", size: "200" },
    f,
  );
  const list = (r.goodsList ?? r.goods ?? r.list ?? []) as Record<
    string,
    unknown
  >[];
  return list
    .map((g) => ({
      code: String(g.goodsCode ?? g.goods_code ?? ""),
      name: String(g.goodsName ?? g.goods_name ?? ""),
      brand: String(g.brandName ?? g.brand_name ?? ""),
      price: Number(g.salePrice ?? g.discountPrice ?? g.realPrice ?? 0),
      image: httpsUrl(g.mmsGoodsImg ?? g.goodsImgB ?? g.goodsImgS),
      limitDay: Number(g.limitDay ?? g.limit_day ?? 0) || undefined,
    }))
    .filter((g) => g.code && g.name && g.price > 0);
}

/** 발송: 공급사가 받는 사람에게 MMS로 쿠폰을 보낸다(gubun N). 핀번호는 받지 않는다 */
export async function giftishowSend(
  cfg: Cfg,
  input: {
    goodsCode: string;
    phone: string;
    trId: string;
    title: string;
    message: string;
    callback: string;
    /** 카드 아이디(기프티쇼 비즈 쿠폰 꾸미기). 비우면 기본 카드 */
    templateId?: string;
    /** 배너 아이디. 비우면 기본 배너 */
    bannerId?: string;
  },
  f: typeof fetch = fetch,
) {
  const r = await call(
    "send",
    {
      api_code: "0204",
      ...auth(cfg),
      goods_code: input.goodsCode,
      phone_no: input.phone,
      tr_id: input.trId,
      mms_title: input.title.slice(0, 20),
      mms_msg: input.message.slice(0, 1000),
      callback_no: input.callback,
      ...(input.templateId ? { template_id: input.templateId } : {}),
      ...(input.bannerId ? { banner_id: input.bannerId } : {}),
      gubun: "N",
    },
    f,
  );
  return { orderNo: String(r.orderNo ?? r.order_no ?? "") || null };
}

/** 취소(쓰지 않은 쿠폰만). 비즈머니로 돌아온다 */
export async function giftishowCancel(
  cfg: Cfg,
  trId: string,
  f: typeof fetch = fetch,
) {
  await call("cancel", { api_code: "0202", ...auth(cfg), tr_id: trId }, f);
}
