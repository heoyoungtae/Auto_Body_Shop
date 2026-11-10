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
          "[마이비즈 > 발신번호 관리]에 등록한 번호(또는 기본번호 1588-6474)만 쓸 수 있습니다.",
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
};

/** 데모 상품(실제 발송 안 됨) */
export const DEMO_GOODS: GiftGoods[] = [
  {
    code: "DEMO-AMERICANO",
    name: "아메리카노 Tall",
    brand: "보기 카페",
    price: 4700,
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
