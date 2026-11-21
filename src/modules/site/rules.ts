// 홈페이지(jmotors.co.kr) 규칙: 주소 나누기, 홈페이지 설정 기본값, 견적 요청 한도. DB 를 보지 않는 순수 함수만 둔다(proxy 에서도 쓴다).

/** 홈페이지 주소(.env HOMEPAGE_HOST, 쉼표로 여럿: jmotors.co.kr,www.jmotors.co.kr). 비우면 홈페이지 주소 없음(테스트 서버는 /site 로 본다) */
export function homepageHosts(env = process.env.HOMEPAGE_HOST ?? ""): string[] {
  return env
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);
}

export const isHomepageHost = (host: string | null | undefined, env?: string) => !!host && homepageHosts(env).includes(host.toLowerCase().replace(/:\d+$/, ""));

/** 손님이 보는 깔끔한 주소 → 앱 안 화면. '/'는 홈페이지 주소에서만 홈페이지로 간다(앱 주소의 '/'는 직원 로그인) */
export const SITE_PATHS: Record<string, string> = {
  "/about": "/site/about",
  "/request": "/site/request",
  "/privacy": "/site/privacy",
  "/terms": "/site/terms",
  "/faq": "/site/faq",
  "/notice": "/site/notice",
  "/cases": "/site/cases",
};

/** 글 한 건 주소(/notice/글번호, /cases/글번호)도 홈페이지 화면으로 */
const SITE_PREFIXES = ["/notice/", "/cases/"];

/** 홈페이지 주소에서 그대로 열어 주는 손님용 화면(나머지 직원 화면은 앱 주소로 보낸다) */
const PUBLIC_BASES = ["/site", "/my", "/estimate", "/consent", "/survey", "/verify", "/brand", "/brand-default", "/fonts", "/api/my", "/api/site-file", "/_next", "/icons", "/favicon", "/robots", "/sitemap", "/manifest"];

export type SiteRoute = { kind: "rewrite"; to: string } | { kind: "pass" } | { kind: "app" };

/** 주소 나누기: 홈페이지 주소면 손님 화면만, 앱 주소면 깔끔한 주소(/about 등)만 홈페이지 화면으로 */
export function routeFor(path: string, onHomepage: boolean): SiteRoute {
  const clean = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (onHomepage && clean === "/") return { kind: "rewrite", to: "/site" };
  if (SITE_PATHS[clean]) return { kind: "rewrite", to: SITE_PATHS[clean] };
  if (SITE_PREFIXES.some((p) => clean.startsWith(p)) && /^\/(notice|cases)\/[0-9a-f-]{36}$/i.test(clean)) return { kind: "rewrite", to: `/site${clean}` };
  if (!onHomepage) return { kind: "pass" };
  return PUBLIC_BASES.some((b) => clean === b || clean.startsWith(`${b}/`) || clean.startsWith(`${b}.`)) ? { kind: "pass" } : { kind: "app" };
}

/** 홈페이지 설정(설정 › 홈페이지, 대표). 이름·전화·주소·로고는 사업장 정보·로고 설정에서 불러오므로 여기 없다 */
export type SiteConfig = {
  /** 견적 요청 받기(끄면 전화 안내만) */
  requests: boolean;
  /** 홈 첫 줄 */
  headline: string;
  /** 홈 둘째 줄 */
  lead: string;
  /** 개업일(YYYY-MM-DD). 이날 전에는 '개업 준비 중' 띠를 보인다 */
  openOn: string;
  /** 정비소 소개(인사말). 빈 줄로 문단을 나눈다 */
  about: string;
  /** 영업시간 안내 한 줄 */
  hours: string;
  /** 카카오톡 채널 주소(https://pf.kakao.com/...) */
  kakao: string;
  /** 개인정보 보호책임자 */
  privacyOfficer: string;
  privacyContact: string;
  /** 처리방침 시행일 */
  privacyFrom: string;
};

export const DEFAULT_SITE: SiteConfig = {
  requests: true,
  headline: "찌그러짐·긁힘·도색, 표준대로 고칩니다",
  lead: "차체 외관 수리 전문 정비소입니다. 사진 몇 장이면 대략 견적을 먼저 알려 드립니다.",
  openOn: "",
  about:
    "제이모터스는 찌그러짐(덴트·판금), 긁힘, 도색을 전문으로 하는 차체 외관 수리 정비소입니다.\n\n모든 작업은 사내 표준서(ISO 방식 업무 표준)에 따라 상담·진단·견적·작업·검사·출고 순서로 진행하고, 단계마다 사진과 기록을 남깁니다. 고객님은 '내 차 수첩'에서 수리 진행·사진·명세서·보증 기간을 언제든 보실 수 있습니다.",
  hours: "평일 09:00~18:00 · 토요일 09:00~13:00 · 일요일·공휴일 휴무",
  kakao: "",
  privacyOfficer: "",
  privacyContact: "",
  privacyFrom: "",
};

/** 수리 분야(홈·소개에 보이는 세 칸) */
export const SERVICES = [
  { title: "찌그러짐", body: "도장을 살리는 덴트부터 판금까지. 문콕·우박·주차 사고 자국을 원래 모양으로 펴 드립니다." },
  { title: "긁힘", body: "광택으로 될지, 부분 도색이 필요한지 먼저 보고 알맞은 방법으로 고칩니다." },
  { title: "도색", body: "색상 코드와 배합 기록으로 같은 색을 맞추고, 도막 두께를 재서 검사합니다." },
] as const;

/** 견적 요청 한도: 인증번호는 번호당 하루 5번·주소당 1시간 10번, 요청은 번호당 하루 3건(내 차 수첩 사진 상담과 합산), 사진 5장 */
export const WEB_LIMIT = { codesPerDay: 5, codesPerIpHour: 10, perDay: 3, photos: 5, verifiedMinutes: 30 } as const;

export const WEB_COOKIE = "abs_web";

/** 공개 글에 섞인 전화번호·차량번호 가리기(관리 화면 미리 보기·공지 등에 쓴다) */
export function maskPersonal(text: string): string {
  return text
    .replace(/(01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g, (_m, a: string, _b: string, c: string) => `${a}-****-${c}`)
    .replace(/(\d{2,3}[가-힣])\s?(\d{2})(\d{2})/g, "$1**$3");
}

/** 개업 전이면 남은 날 수(오늘 포함 안 함), 지났거나 비었으면 null */
export function daysToOpen(openOn: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openOn) || openOn <= today) return null;
  return Math.round((Date.parse(openOn) - Date.parse(today)) / 864e5);
}
