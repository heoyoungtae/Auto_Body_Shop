// 홈페이지 화면 글 목록(대표 2026-11-22 "설정 홈페이지에서 홈페이지의 모든 관리 수정할 수 있게").
// 화면에 박혀 있던 문구를 여기 한 곳에 '처음 문구'로 모아 두고, 설정 › 홈페이지에서 고친 것만 app_config 'site_pages'에 따로 남긴다.
// 고친 적 없는 칸은 늘 처음 문구를 쓰므로, 처음 문구를 다듬으면 고치지 않은 홈페이지에도 그대로 들어간다.
// 숫자 기준(보증 기간·도막 두께 등)은 {도장보증}처럼 적으면 정책값이 들어간다 → 정책을 바꾸면 홈페이지도 함께 바뀐다.
import type { Policy } from "@/modules/platform/policy";
import { CARBOOK_CHAPTERS, CARBOOK_TEXT } from "./carbook-guide-text";
import { SERVICE_PAGES } from "./service-pages";
import { SERVICE_TEXT } from "./service-text";

export type Pair = { t: string; d: string };

/** 글 안에 적는 자리표시: {이름} → 정책값 */
export const TOKENS: Record<string, { label: string; get: (p: Policy) => string }> = {
  도장보증: { label: "도장·판금 보증(개월)", get: (p) => String(p["warranty.paint_months"]) },
  도막최소: { label: "도막 두께 아래 기준(μm)", get: (p) => String(p["inspect.film_min_um"]) },
  도막최대: { label: "도막 두께 위 기준(μm)", get: (p) => String(p["inspect.film_max_um"]) },
  간극: { label: "패널 간극 좌우 차(mm)", get: (p) => String(p["inspect.gap_mm"]) },
  사진장수: { label: "작업 후 사진(장)", get: (p) => String(p["inspect.after_photos"]) },
  회신일: { label: "사진 견적 회신(영업일)", get: (p) => String(p["consult.reply_business_days"]) },
  세차금지일: { label: "출고 뒤 세차 피할 날(일)", get: (p) => String(p["delivery.no_wash_days"]) },
  견적유효일: { label: "견적서 유효 기간(일)", get: (p) => String(p["estimate.valid_days"]) },
};

const TOKEN_RE = /\{([^{}\s]{1,10})\}/g;

/** 자리표시를 정책값으로 바꾼다(모르는 이름은 그대로 둔다) */
export const fillTokens = (s: string, p: Policy) => s.replace(TOKEN_RE, (m, k: string) => TOKENS[k]?.get(p) ?? m);

/** 글에 쓴 모르는 자리표시 이름 */
export const unknownTokens = (s: string) => [...s.matchAll(TOKEN_RE)].map((m) => m[1]).filter((k) => !TOKENS[k]);

type TextDef = { kind: "text"; label: string; def: string; multi?: boolean; max?: number };
type PairsDef = { kind: "pairs"; label: string; def: Pair[]; max: number; min?: number };
type LinesDef = { kind: "lines"; label: string; def: string[]; max: number; min?: number };
/** 칸이 여럿인 목록(예: 수리 방법 = 방법·이럴 때·이렇게·기간) */
type RowsDef = { kind: "rows"; label: string; fields: readonly { k: string; label: string; max: number }[]; def: Record<string, string>[]; max: number; min?: number };
export type ItemDef = TextDef | PairsDef | LinesDef | RowsDef;

const text = (label: string, def: string, o: { multi?: boolean; max?: number } = {}): TextDef => ({ kind: "text", label, def, ...o });
const pairs = (label: string, def: Pair[], max = 8, min = 1): PairsDef => ({ kind: "pairs", label, def, max, min });
const lines = (label: string, def: string[], max = 10, min = 1): LinesDef => ({ kind: "lines", label, def, max, min });

/** 첫 화면 단락(맨 위 배경 단락은 늘 첫째라 여기 없음) */
export const HOME_SECTIONS = [
  { key: "services", label: "수리 분야" },
  { key: "why", label: "고를 이유" },
  { key: "quality", label: "품질 기준·자격 인증" },
  { key: "photos", label: "공업사 사진", note: "사진을 올렸을 때만 보입니다" },
  { key: "process", label: "진행 순서" },
  { key: "carbook", label: "내 차 수첩 홍보" },
  { key: "cases", label: "작업 사례", note: "공개 사례가 없으면 예시 그림" },
  { key: "reviews", label: "고객 후기", note: "후기나 별점을 넣었을 때만 보입니다" },
  { key: "insurance", label: "보험·보증" },
  { key: "tech", label: "기술자료" },
  { key: "faq", label: "자주 묻는 질문" },
  { key: "notice", label: "공지·오시는 길" },
  { key: "cta", label: "마무리 견적 띠", note: "견적 요청을 받을 때만 보입니다" },
] as const;
export type SectionKey = (typeof HOME_SECTIONS)[number]["key"];
export const SECTION_KEYS = HOME_SECTIONS.map((s) => s.key) as SectionKey[];

/**
 * 고칠 수 있는 화면 글. 묶음(group)마다 설정 화면 한 칸으로 보인다.
 * key 앞부분이 묶음: home.<단락>.*, insurance.*, guide.*, about.*, footer.*
 */
export const PAGE_TEXT = {
  // ── 첫 화면 ──
  "home.hero.eyebrow": text("맨 위 작은 머리말", "COLLISION · PANEL · PAINT", { max: 40 }),
  "home.hero.button": text("둘째 단추", "내 차 수첩 둘러보기", { max: 20 }),
  "home.services.eyebrow": text("머리말", "SERVICES", { max: 30 }),
  "home.services.title": text("제목", "이런 수리를 합니다", { max: 40 }),
  "home.why.eyebrow": text("머리말", "WHY US", { max: 30 }),
  "home.why.title": text("제목(줄 바꿈 가능)", "작은 수리도\n같은 기준으로", { multi: true, max: 60 }),
  "home.why.lead": text("설명", "문콕 하나를 고쳐도 견적, 기록, 검사, 보증까지 같은 순서를 밟습니다. 그래서 결과가 사람이나 날에 따라 달라지지 않습니다.", { multi: true, max: 300 }),
  "home.why.items": pairs(
    "고를 이유",
    [
      { t: "표준서대로 일합니다", d: "상담부터 출고까지 사내 업무 표준서의 순서와 기준을 따릅니다. 사람마다 다르게 하지 않습니다." },
      { t: "모든 공정을 기록합니다", d: "공정마다 사진, 조색 배합, 도막 두께를 남기고 고객님과 함께 봅니다." },
      { t: "검사는 다른 사람이", d: "작업한 사람이 아닌 검사자가 기준표대로 재고 확인한 뒤 출고합니다." },
      { t: "승인한 만큼만 받습니다", d: "법정 견적서로 먼저 알려 드리고, 승인 없는 작업이나 금액 추가는 없습니다." },
    ],
    6,
  ),
  "home.quality.eyebrow": text("머리말", "QUALITY STANDARD", { max: 30 }),
  "home.quality.title": text("제목(줄 바꿈 가능)", "감으로 하지 않습니다.\n재고, 기록하고, 검사합니다.", { multi: true, max: 60 }),
  "home.quality.lead": text("설명", "모든 수리는 사내 표준서에 정한 순서와 기준을 따릅니다. 조색 배합과 도막 두께를 기록하고, 출고 전에 작업한 사람이 아닌 검사자가 다시 확인합니다.", {
    multi: true,
    max: 300,
  }),
  "home.photos.eyebrow": text("머리말", "OUR SHOP", { max: 30 }),
  "home.photos.title": text("제목", "공업사를 미리 둘러보세요", { max: 40 }),
  "home.process.eyebrow": text("머리말", "PROCESS", { max: 30 }),
  "home.process.title": text("제목", "이렇게 진행합니다", { max: 40 }),
  "home.process.items": pairs(
    "진행 단계",
    [
      { t: "상담", d: "전화·방문·홈페이지로 다친 곳을 알려 주세요." },
      { t: "진단", d: "차를 직접 보고 부위마다 고칠 방법을 정합니다." },
      { t: "견적 승인", d: "법정 견적서를 드리고, 승인하신 작업만 합니다." },
      { t: "작업", d: "판금·도장 공정마다 사진과 기록을 남깁니다." },
      { t: "검사", d: "작업자가 아닌 검사자가 기준대로 잽니다." },
      { t: "출고", d: "명세서·사진·보증을 내 차 수첩에 남깁니다." },
    ],
    8,
    3,
  ),
  "home.carbook.eyebrow": text("머리말", "MY CAR BOOK", { max: 30 }),
  "home.carbook.title": text("제목(줄 바꿈 가능)", "수리가 끝나도\n기록은 남습니다", { multi: true, max: 60 }),
  "home.carbook.lead": text("설명", "제이모터스에서 고친 차는 모두 '내 차 수첩'에 남습니다. 앱을 깔 필요도, 회원가입도 없이 휴대폰 문자 인증 한 번이면 됩니다.", { multi: true, max: 300 }),
  "home.carbook.items": pairs(
    "좋은 점",
    [
      { t: "수리 진행을 실시간으로", d: "지금 어느 공정인지, 부위마다 얼마나 됐는지 휴대폰으로 봅니다." },
      { t: "견적은 휴대폰으로 승인", d: "부위별 금액을 보고 맡길 작업만 골라 서명합니다." },
      { t: "서류는 평생 보관", d: "법정 견적서·정비명세서·작업 사진을 언제든 다시 봅니다." },
      { t: "보증 신청은 사진 한 장", d: "이상이 생기면 사진과 한 줄이면 됩니다. 어느 수리인지는 저절로 이어집니다." },
    ],
    6,
  ),
  "home.carbook.note": text("아래 한 줄", "차를 팔 때는 수리 이력 확인서를 뽑아 사는 분께 보여 줄 수 있습니다. QR로 진짜인지 누구나 확인합니다.", { multi: true, max: 200 }),
  "home.cases.eyebrow": text("머리말", "OUR WORK", { max: 30 }),
  "home.cases.title": text("제목(공개 사례가 있을 때)", "작업 사례", { max: 40 }),
  "home.cases.sampleTitle": text("제목(예시 그림일 때)", "이렇게 고칩니다", { max: 40 }),
  "home.reviews.eyebrow": text("머리말", "REVIEWS", { max: 30 }),
  "home.reviews.title": text("제목", "고객님이 남긴 말", { max: 40 }),
  "home.insurance.title": text("보험 칸 제목", "보험 수리, 맡겨 주세요", { max: 40 }),
  "home.insurance.lead": text(
    "보험 칸 설명",
    "내 보험(자차)·상대 보험(대물) 모두 됩니다. 사고 접수번호와 보험사만 알려 주시면 보험사 협의는 저희가 진행합니다. 견적 금액을 보고 자비 수리와 비교해 고르셔도 됩니다.",
    { multi: true, max: 300 },
  ),
  "home.insurance.warrantyTitle": text("보증 칸 제목", "고친 곳은 끝까지 책임집니다", { max: 40 }),
  "home.insurance.warrantyNote": text("보증 칸 설명", "보증 기간과 내용은 내 차 수첩에 남고, 문제가 생기면 사진과 함께 바로 신청하실 수 있습니다.", { multi: true, max: 200 }),
  "home.tech.eyebrow": text("머리말", "KNOWLEDGE", { max: 30 }),
  "home.tech.title": text("제목", "차를 오래 아끼는 방법", { max: 40 }),
  "home.faq.title": text("제목", "자주 묻는 질문", { max: 40 }),
  "home.notice.title": text("공지 칸 제목", "공지사항", { max: 30 }),
  "home.notice.mapTitle": text("오시는 길 칸 제목", "오시는 길", { max: 30 }),
  "home.cta.title": text("제목", "사진 몇 장이면 충분합니다", { max: 40 }),
  "home.cta.lead": text("설명", "다친 곳 사진을 보내 주시면 영업일 {회신일}일 안에 대략 금액과 기간을 알려 드립니다. 회원가입은 필요 없습니다.", { multi: true, max: 200 }),

  // ── 보험 수리 안내 ──
  "insurance.sub": text("화면 설명", "내 보험(자차)이든 상대 보험(대물)이든, 접수번호만 알려 주시면 보험사 협의는 저희가 합니다.", { multi: true, max: 200 }),
  "insurance.after.title": text("사고 직후 제목", "사고가 났다면", { max: 40 }),
  "insurance.after.items": pairs(
    "사고 직후 할 일",
    [
      { t: "안전 먼저", d: "비상등을 켜고 차를 안전한 곳으로 옮깁니다. 다친 사람이 있으면 119에 먼저 연락합니다." },
      { t: "사진 남기기", d: "두 차의 위치, 다친 곳 가까이·멀리, 상대 차 번호판을 찍어 둡니다." },
      { t: "보험사 접수", d: "내 보험사(또는 상대 보험사)에 사고 접수를 하고 접수번호를 받아 둡니다." },
      { t: "제이모터스에 알리기", d: "접수번호와 보험사를 알려 주시면 그다음은 저희가 이어서 진행합니다." },
    ],
    6,
  ),
  "insurance.own": text("자차 설명", "내 과실이 있거나 상대가 없는 사고(혼자 긁음 등)에 씁니다. 약관에 따라 자기부담금이 있고, 보험료가 오를 수 있습니다.", { multi: true, max: 300 }),
  "insurance.property": text("대물 설명", "상대 과실로 난 사고에 상대 보험사가 수리비를 냅니다. 과실 100%면 자기부담금이 없고, 수리 동안 대차를 받을 수 있습니다.", { multi: true, max: 300 }),
  "insurance.wedo.title": text("대신 하는 일 제목", "저희가 대신 해 드리는 일", { max: 40 }),
  "insurance.wedo.items": lines(
    "대신 하는 일",
    [
      "보험사에 수리 견적과 사진을 보내고 손해사정사와 협의합니다.",
      "뜯어 보니 손상이 더 있으면 추가 견적(사진 포함)을 보험사와 고객님께 함께 알립니다.",
      "대물 수리면 상대 보험사에 대차(렌트)를 요청해 드립니다.",
      "출고 때 자기부담금과 보험 처리 금액을 나눠 정비명세서에 적어 드립니다.",
    ],
    8,
  ),
  "insurance.partners.title": text("보험사 목록 제목", "보험 수리를 해 온 보험사", { max: 40 }),
  "insurance.compare.title": text("자비 비교 제목", "보험으로 할까, 자비로 할까?", { max: 40 }),
  "insurance.compare.lead": text(
    "자비 비교 설명",
    "수리비가 적으면 보험료가 오르는 것보다 자비가 나을 때가 있습니다. 견적 금액을 먼저 보고 고르셔도 됩니다. 보험료 할증은 보험사에 직접 확인해 주세요.",
    { multi: true, max: 300 },
  ),

  // ── 이용 안내 ──
  "guide.sub": text("화면 설명", "처음 맡기셔도 헷갈리지 않게, 맡기기 전부터 출고 뒤까지 정리했습니다.", { multi: true, max: 200 }),
  "guide.before.title": text("맡기기 전 제목", "맡기기 전에", { max: 30 }),
  "guide.before.items": lines("맡기기 전", [
    "차 안 귀중품·하이패스 카드·블랙박스 메모리는 챙겨 가세요.",
    "열쇠(스마트키)를 하나 맡겨 주세요. 작업 중 차를 옮겨야 합니다.",
    "보험 수리면 사고 접수번호와 보험사를 알려 주세요.",
    "입고할 때 차를 한 바퀴 돌며 사진을 찍고 지금 상태를 함께 확인합니다.",
  ]),
  "guide.during.title": text("맡긴 동안 제목", "맡긴 동안", { max: 30 }),
  "guide.during.items": lines("맡긴 동안", [
    "진행 단계(진단·견적·작업·검사·출고)는 내 차 수첩에서 바로 보입니다.",
    "뜯어 보니 손상이 더 있으면 작업을 멈추고 사진과 추가 견적을 먼저 보내 드립니다.",
    "승인하신 작업만 합니다. 승인 없이 금액이 오르지 않습니다.",
  ]),
  "guide.pickup.title": text("찾아갈 때 제목", "찾아가실 때", { max: 30 }),
  "guide.pickup.items": lines("찾아가실 때", ["밝은 곳에서 고친 곳을 함께 보고 확인합니다.", "정비명세서·영수증을 드리고, 사진·보증 기간은 내 차 수첩에 남습니다."]),
  "guide.after.title": text("출고 뒤 제목", "출고 뒤 관리", { max: 30 }),
  "guide.after.items": lines("출고 뒤 관리", [
    "출고 뒤 {세차금지일}일 동안은 자동 세차·고압 세차·왁스를 피해 주세요(도막이 굳는 동안).",
    "새 도장 위에 스티커·테이프를 붙이지 마세요.",
    "새·나무 수액·벌레 자국은 바로 물로 닦아 주세요.",
    "문제가 생기면 보증 기간(도장·판금 {도장보증}개월) 안에 내 차 수첩에서 사진과 함께 신청하세요.",
  ]),

  // ── 공업사 소개 ──
  "about.services": pairs(
    "수리 분야",
    [
      { t: "찌그러짐", d: "찌그러진 철판을 판금으로 펴고 다시 칠해 원래 모양을 되살립니다. 문콕·주차 사고 자국부터 크게 눌린 곳까지 고칩니다." },
      { t: "긁힘", d: "긁힌 깊이와 넓이를 보고 필요한 만큼만 부분 도색합니다. 경계가 보이지 않게 번지게 칠합니다." },
      { t: "도색", d: "색상 코드와 배합 기록으로 같은 색을 맞추고, 도막 두께를 재서 검사합니다." },
    ],
    6,
  ),
  "about.rules.title": text("작업 기준 제목", "작업 기준", { max: 30 }),
  "about.rules.lead": text("작업 기준 설명", "모든 수리는 사내 표준서에 정한 순서와 기준을 따릅니다.", { multi: true, max: 200 }),
  "about.rules.items": lines(
    "작업 기준",
    [
      "작업 전 법정 견적서로 금액을 먼저 알려 드리고, 승인하신 작업만 합니다.",
      "부품은 순정·품질인증 대체부품·재제조 중에서 고르실 수 있습니다.",
      "조색 배합과 도막 두께를 기록하고, 출고 전 단차·색상·광택을 검사합니다.",
      "수리 전·중·후 사진을 남겨 내 차 수첩에서 언제든 보실 수 있습니다.",
      "출고한 수리에는 보증 기간을 드리고, 기간 안에 문제가 생기면 내 차 수첩에서 바로 신청합니다.",
    ],
    10,
  ),

  // ── 이용약관(조항 제목+내용. 고쳐 공개한 뒤 설정 › 홈페이지 › 약관에서 새 판으로 시행) ──
  "terms.items": pairs(
    "조항",
    [
      { t: "목적", d: "이 약관은 제이모터스 홈페이지, 견적 요청, 내 차 수첩을 쓰실 때의 규칙을 정합니다." },
      { t: "견적 요청 답변", d: "사진만 보고 드리는 답은 대략 금액입니다. 정식 견적은 차를 직접 진단한 뒤 법정 견적서로 드리며, 승인하신 작업만 합니다." },
      { t: "본인 확인", d: "견적 요청과 내 차 수첩은 휴대폰 문자 인증으로 본인을 확인합니다. 다른 사람의 번호로 요청하면 안 됩니다." },
      { t: "사진", d: "보내 주신 사진은 견적과 수리 기록에만 씁니다. 홍보에는 따로 동의하신 경우에만 번호판·얼굴을 가려 씁니다." },
      { t: "금지 행위", d: "광고·욕설·다른 사람 정보가 담긴 내용, 자동 프로그램으로 반복 요청하는 것은 막고 지울 수 있습니다." },
      { t: "서비스 중단", d: "점검·정전·통신 장애로 잠시 열리지 않을 수 있습니다. 급한 일은 전화로 연락해 주세요." },
      { t: "책임", d: "제이모터스는 수리 결과에 대해 보증 기간 동안 책임집니다. 홈페이지 정보는 안내용이며, 계약 내용은 견적서·정비명세서를 따릅니다." },
      { t: "분쟁", d: "분쟁은 서로 협의하며, 자동차 정비 관련 분쟁은 한국소비자원 등의 조정을 받을 수 있습니다." },
    ],
    15,
    3,
  ),

  // ── 바닥글 ──
  "footer.tagline": text("바닥글 소개 한 줄", "찌그러짐·긁힘·도색 차체 외관 수리. 사내 표준에 따라 기록하고 검사합니다.", { multi: true, max: 150 }),
} as const satisfies Record<string, ItemDef>;

export type TextKey = { [K in keyof typeof PAGE_TEXT]: (typeof PAGE_TEXT)[K]["kind"] extends "text" ? K : never }[keyof typeof PAGE_TEXT];
export type PairsKey = { [K in keyof typeof PAGE_TEXT]: (typeof PAGE_TEXT)[K]["kind"] extends "pairs" ? K : never }[keyof typeof PAGE_TEXT];
export type LinesKey = { [K in keyof typeof PAGE_TEXT]: (typeof PAGE_TEXT)[K]["kind"] extends "lines" ? K : never }[keyof typeof PAGE_TEXT];
export type PageTextKey = keyof typeof PAGE_TEXT;

/** 모든 화면 글: 위 목록 + 수리 안내(service-text.ts) + 내 차 수첩 설명서(carbook-guide-text.ts) */
export const ALL_TEXT: Record<string, ItemDef> = { ...PAGE_TEXT, ...SERVICE_TEXT, ...CARBOOK_TEXT };

export const pageTextDef = (k: string): ItemDef | undefined => ALL_TEXT[k];

/** 설정 화면 '화면 글' 묶음. parts 가 있으면 묶음 안을 칸 묶음 여러 개로 나눠 보인다 */
export type TextGroup = { id: string; title: string; path: string; parts?: { id: string; title: string; keys: string[] }[] };
const keysOf = (prefix: string) => Object.keys(ALL_TEXT).filter((k) => k.startsWith(`${prefix}.`));
export const TEXT_GROUPS: TextGroup[] = [
  {
    id: "services",
    title: "수리 안내",
    path: "/services",
    parts: [
      { id: "services", title: "수리 안내(모아 보기)", keys: ["services.sub", ...keysOf("services.price"), "services.cta", "services.ctaOne"] },
      ...SERVICE_PAGES.map((s) => ({ id: s.slug, title: `수리 안내 › ${s.title}`, keys: keysOf(`services.${s.slug}`) })),
    ],
  },
  {
    id: "carbook",
    title: "내 차 수첩 설명서",
    path: "/carbook-guide",
    parts: [
      { id: "carbook-sub", title: "화면 설명", keys: ["carbook.sub"] },
      ...CARBOOK_CHAPTERS.map((c) => ({ id: c.id, title: `${c.en} · ${c.name}`, keys: keysOf(`carbook.${c.id}`) })),
      { id: "carbook-faq", title: "자주 묻는 질문", keys: ["carbook.faq"] },
    ],
  },
  { id: "insurance", title: "보험 수리 안내", path: "/insurance" },
  { id: "guide", title: "이용 안내", path: "/guide" },
  { id: "about", title: "공업사 소개", path: "/about" },
  { id: "terms", title: "이용약관", path: "/terms" },
  { id: "footer", title: "바닥글", path: "/" },
];

/** 묶음에 든 글 key(적은 차례대로). 'home.why' 처럼 단락까지 적으면 그 단락 글만 */
export const groupKeys = (g: string) => keysOf(g);

// ── 메뉴·바닥글 ──
/** 위 메뉴에 넣을 수 있는 화면 */
export const NAV_PAGES = [
  { href: "/about", name: "공업사 소개" },
  { href: "/services", name: "수리 안내" },
  { href: "/cases", name: "작업 사례" },
  { href: "/insurance", name: "보험 수리" },
  { href: "/tech", name: "기술자료" },
  { href: "/faq", name: "자주 묻는 질문" },
  { href: "/notice", name: "공지사항" },
  { href: "/carbook-guide", name: "내 차 수첩" },
  { href: "/guide", name: "이용 안내" },
] as const;
export type NavItem = { href: string; label: string; on: boolean; isNew: boolean };
export const DEFAULT_NAV: NavItem[] = NAV_PAGES.map((p) => ({ href: p.href, label: p.name, on: p.href !== "/guide", isNew: p.href === "/carbook-guide" }));
/** 위 메뉴가 넓은 화면 한 줄에 들어가는 개수 */
export const NAV_MAX = 8;

/** 바닥글 'INFORMATION' 줄. 개인정보 처리방침은 법으로 늘 보여야 해서 맨 위에 고정(여기 없음) */
export const FOOT_PAGES = [
  { href: "/terms", name: "이용약관" },
  { href: "/insurance", name: "보험 수리 안내" },
  { href: "/guide", name: "이용 안내" },
  { href: "/services", name: "수리 안내" },
  { href: "/tech", name: "기술자료" },
  { href: "/carbook-guide", name: "내 차 수첩 사용설명서" },
  { href: "/about", name: "공업사 소개" },
  { href: "/cases", name: "작업 사례" },
  { href: "/faq", name: "자주 묻는 질문" },
  { href: "/notice", name: "공지사항" },
] as const;
export type FootItem = { href: string; label: string; on: boolean };
export const DEFAULT_FOOT: FootItem[] = FOOT_PAGES.map((p, i) => ({ href: p.href, label: p.name, on: i < 6 }));

export type HomeLayout = {
  /** 단락 차례(맨 위 배경 단락 다음부터) */
  order: SectionKey[];
  /** 숨긴 단락 */
  off: SectionKey[];
  /** 배경 사진 위 어둡게 덮는 정도(40~100, 100이 처음 값). 밝은 사진이면 높이고, 사진을 더 보이려면 낮춘다 */
  shade: number;
  /** 배경 아래 숫자 네 칸(표준 공정·도막·보증·회신) */
  stats: boolean;
};
export const DEFAULT_HOME: HomeLayout = { order: [...SECTION_KEYS], off: [], shade: 100, stats: true };

/** 저장된 차례를 고르게: 모르는 단락은 빼고, 빠진(뒤에 늘린) 단락은 처음 차례 자리에 끼운다 */
export function normalizeOrder(order: readonly string[] | undefined): SectionKey[] {
  const seen = (order ?? []).filter((k, i, a): k is SectionKey => (SECTION_KEYS as string[]).includes(k) && a.indexOf(k) === i);
  for (const k of SECTION_KEYS) {
    if (seen.includes(k)) continue;
    const before = SECTION_KEYS.slice(0, SECTION_KEYS.indexOf(k))
      .reverse()
      .find((x) => seen.includes(x));
    seen.splice(before ? seen.indexOf(before) + 1 : 0, 0, k);
  }
  return seen;
}

/** 메뉴·바닥글 목록 고르게: 정해진 화면만, 빠진 화면은 끝에(숨김으로) 붙인다 */
/** 예전 화면 이름(대표 2026-11-22 정비소→공업사). 이 이름이 그대로 저장돼 있으면 지금 화면 이름으로 */
const LEGACY_LINK_NAMES: Record<string, string> = { "/about": "정비소 소개" };

export function normalizeLinks<T extends { href: string; label: string; on: boolean }>(saved: readonly T[] | undefined, pages: readonly { href: string; name: string }[], defaults: readonly T[]): T[] {
  if (!saved?.length) return defaults.map((d) => ({ ...d }));
  const ok = new Set(pages.map((p) => p.href));
  const out = saved
    .filter((x, i, a) => ok.has(x.href) && a.findIndex((y) => y.href === x.href) === i)
    .map((x) => ({ ...x, label: (x.label.trim() !== LEGACY_LINK_NAMES[x.href] && x.label.trim()) || pages.find((p) => p.href === x.href)!.name }));
  for (const d of defaults) if (!out.some((x) => x.href === d.href)) out.push({ ...d, on: false });
  return out;
}
