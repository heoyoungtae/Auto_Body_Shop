// 메뉴 찾기 — 사이드 메뉴 맨 위 검색칸의 거르기 규칙(사용자 확정 2026-11-11 "제안대로 만들기").
// 메뉴 이름·묶음 이름·표준서 번호·별칭(직원들이 흔히 쓰는 다른 말)으로 찾는다.
// 초성(ㄱㅈ → 견적), 치는 중인 글자(견저 → 견적), 한/영을 깜빡하고 친 영문 자판(ruswjr → 견적)도 알아듣는다.
// 띄어쓰기와 '·' 같은 기호는 무시한다. 권한 거르기는 이 파일이 아니라 사이드바(_sidebar.tsx)의 allowed 가 맡는다.
import { PAGE_HELP, ROUTE_HELP } from "@/modules/help/pages";
import { MENU, TOP, type MenuItem } from "./_menu";

/** 메뉴 이름 → 별칭. 새 메뉴를 만들면 여기에도 직원들이 부를 만한 말을 적는다(테스트가 모든 메뉴에 있는지 본다). */
export const MENU_ALIAS: Record<string, string[]> = {
  대시보드: ["홈", "첫화면", "현황"],
  "통계·보고서": ["통계", "매출", "리포트", "보고"],
  "내 할 일": ["할일", "해야할일", "처리할일"],
  일정표: ["달력", "캘린더", "스케줄"],
  업무지시: ["지시", "지시사항", "결과보고"],
  업무일지: ["일지", "일일보고"],
  결재: ["승인", "전자결재", "기안"],
  알림: ["공지", "새소식"],
  "상담·예약": ["예약", "상담", "전화상담", "문의"],
  "접수·입고": ["입고", "접수", "차량입고", "진단"],
  "견적·고객 승인": ["견적서", "견적", "고객승인", "동의"],
  "작업·공정": ["판금", "도색", "도장", "수리", "작업지시", "공정"],
  "검사·출고": ["출고", "품질검사", "인도", "출차"],
  "보험 청구": ["보험", "보험사", "청구", "손해사정"],
  "고객·차량": ["고객", "차량", "차량번호", "전화번호", "고객카드"],
  "보증 수리": ["보증", "재수리", "AS", "에이에스"],
  "만족도·불만": ["불만", "클레임", "민원", "설문", "해피콜"],
  "문자 발송": ["문자", "SMS", "단체문자"],
  "발송 이력": ["문자이력", "보낸문자"],
  "문구 서식": ["문자서식", "템플릿"],
  "기프티콘 발송": ["선물", "쿠폰"],
  "기프티콘 이력": ["보낸선물", "쿠폰이력"],
  "설비 대장": ["장비", "기계", "설비"],
  "일상 점검": ["점검표", "일일점검"],
  윤활: ["오일", "그리스", "주유"],
  예방정비: ["PM", "정기점검"],
  "측정 장비 교정": ["교정", "게이지", "측정기"],
  "3정5S 점검": ["5S", "정리정돈", "청소"],
  치공구: ["공구", "지그"],
  "개선 제안": ["제안", "아이디어", "건의"],
  품질목표: ["목표", "KPI"],
  "부적합·시정 조치": ["부적합", "시정조치", "NC", "재발방지"],
  "문서 목록": ["표준서", "문서", "양식"],
  "문서 개정 요청": ["개정", "표준서수정"],
  "법규 대장": ["법규", "법령", "인허가"],
  "리스크·기회": ["리스크", "위험", "기회"],
  "내부 심사": ["심사", "감사", "내부감사"],
  "조직 상황 검토": ["이해관계자", "SWOT", "조직상황"],
  경영검토: ["경영회의", "경영"],
  협력업체: ["거래처", "업체", "공급업체", "협력사", "계좌"],
  "발주·입고": ["발주", "주문", "구매", "부품주문"],
  재고: ["품목", "품목등록", "부품", "부품등록", "자재", "자재등록", "재고조사", "페인트", "도료"],
  외주: ["외주수리", "위탁"],
  "비품·자산": ["비품", "자산"],
  "사고·아차사고": ["사고", "산재", "아차"],
  "화학물질·MSDS": ["MSDS", "화학물질", "도료", "유해물질"],
  위험성평가: ["위험성", "안전"],
  "환경 관리": ["폐기물", "폐유", "VOC", "배출"],
  "직원 명부·역량표": ["직원", "사원", "명부", "역량"],
  "계약서·서약서": ["근로계약서", "계약서", "서약서"],
  취업규칙: ["규칙", "사규"],
  "출퇴근·근태": ["출근", "퇴근", "근태", "연장근무", "지각"],
  "교육 훈련": ["교육", "훈련"],
  인사평가: ["평가", "고과"],
  "퇴직 처리": ["퇴사", "퇴직금"],
  재직증명서: ["증명서", "경력증명"],
  급여대장: ["급여", "월급", "임금", "봉급"],
  "내 임금명세서": ["명세서", "월급명세", "급여명세"],
  "청구·수납": ["수납", "입금", "미수금", "받을돈"],
  "지출 결의": ["지출", "경비", "비용"],
  "외상매입금·미지급금": ["거래처 정산", "외상", "매입", "지급", "미지급", "줄돈", "원장", "거래처 원장"],
  마감: ["일마감", "월마감", "결산"],
  "사업장 정보": ["사업자등록", "회사정보", "사업장"],
  "공임 기준표": ["공임", "시간당공임", "단가"],
  정책값: ["기준값", "정책"],
  "전결 규정": ["전결", "위임"],
  "로그인 계정": ["직원·역할", "계정", "사용자", "아이디", "역할", "접속", "접속 현황", "비밀번호 초기화", "임시 비밀번호", "로그아웃", "잠금"],
  권한표: ["권한"],
  "문자 발송 서비스": ["문자설정"],
  "카카오 알림톡": ["카카오", "알림톡"],
  "기프티콘 공급사": ["기프티콘설정"],
  "영업일·휴무일": ["휴일", "공휴일", "휴무"],
  "도움말 센터": ["도움말", "사용법", "매뉴얼"],
  "내 계정·비밀번호": ["비밀번호", "비번", "내정보"],
};

// ── 한글 낱자
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const BASE = 0xac00;
const isSyllable = (c: string) => c >= "가" && c <= "힣";
const isCho = (c: string) => CHO.includes(c);
const parts = (c: string) => {
  const n = c.charCodeAt(0) - BASE;
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
};

/** 글자마다 초성으로: "견적" → "ㄱㅈ" (한글이 아닌 글자는 그대로) */
export const chosung = (s: string) => [...s].map((c) => (isSyllable(c) ? CHO[parts(c).cho] : c)).join("");

/** 띄어쓰기·기호를 빼고 영문은 소문자로 */
export const normalize = (s: string) => s.toLowerCase().replace(/[\s·・.,\-_()/~]+/g, "");

// ── 영문 자판으로 친 글자를 한글로(두벌식)
const KEY: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};
const V2: Record<string, string> = { ㅗㅏ: "ㅘ", ㅗㅐ: "ㅙ", ㅗㅣ: "ㅚ", ㅜㅓ: "ㅝ", ㅜㅔ: "ㅞ", ㅜㅣ: "ㅟ", ㅡㅣ: "ㅢ" };
const C2: Record<string, string> = { ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ", ㄹㅌ: "ㄾ", ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ" };
const C2_SPLIT: Record<string, [string, string]> = Object.fromEntries(Object.entries(C2).map(([k, v]) => [v, [k[0], k[1]]]));

/** "ruswjr" → "견적". 자판 글자가 아닌 것이 섞이면 null */
export function qwertyToHangul(s: string): string | null {
  if (!/^[a-zA-Z]+$/.test(s)) return null;
  const jamo = [...s].map((c) => KEY[c] ?? KEY[c.toLowerCase()]);
  let out = "";
  let cho: string | null = null;
  let jung: string | null = null;
  let jong: string | null = null;
  const flush = () => {
    if (cho && jung) out += String.fromCharCode(BASE + CHO.indexOf(cho) * 588 + JUNG.indexOf(jung) * 28 + JONG.indexOf(jong ?? ""));
    else out += (cho ?? "") + (jung ?? "");
    cho = jung = jong = null;
  };
  for (const j of jamo) {
    if (isCho(j)) {
      if (cho && jung && !jong && JONG.includes(j)) jong = j;
      else if (cho && jung && jong && C2[jong + j]) jong = C2[jong + j];
      else {
        flush();
        cho = j;
      }
    } else if (jong) {
      // 받침이 다음 글자의 첫소리로 넘어간다: 견ㅈ+ㅓ → 견저
      const [keep, move]: [string | null, string] = C2_SPLIT[jong] ?? [null, jong];
      jong = keep;
      flush();
      cho = move;
      jung = j;
    } else if (jung && V2[jung + j]) jung = V2[jung + j];
    else if (cho && !jung) jung = j;
    else {
      flush();
      jung = j;
    }
  }
  flush();
  return out;
}

/** 찾는 말의 한 글자 c 가 메뉴의 한 글자 t 와 맞는가. last 는 아직 치는 중인 마지막 글자(받침 없음) */
const charHit = (t: string, c: string, last: boolean) => {
  if (t === c) return true;
  if (!isSyllable(t)) return false;
  if (isCho(c)) return CHO[parts(t).cho] === c;
  if (last && isSyllable(c)) {
    const a = parts(t);
    const b = parts(c);
    return b.jong === 0 && a.cho === b.cho && a.jung === b.jung;
  }
  return false;
};

/** text 안에서 q 가 처음 맞는 자리(못 찾으면 -1). 둘 다 normalize 한 값 */
export function findIn(text: string, q: string): number {
  const t = [...text];
  const c = [...q];
  for (let i = 0; i + c.length <= t.length; i++) if (c.every((ch, k) => charHit(t[i + k], ch, k === c.length - 1))) return i;
  return -1;
}

export type MenuEntry = MenuItem & {
  group?: string;
  groupId?: string;
  /** 메뉴 안의 화면(예: 재고 › 재고 품목 등록)이면 그 메뉴 이름 */
  parent?: string;
};
export type MenuHit = MenuEntry & {
  score: number;
  /** 메뉴 이름에서 맞은 글자 자리(굵게 표시). 별칭·번호로 맞으면 없음 */
  mark?: { start: number; end: number };
  /** 이름이 아닌 것으로 맞았을 때 그 말(예: 별칭 '도색') */
  via?: string;
};

/** 메뉴 전체(맨 위 화면 + 묶음 안 화면)를 한 줄로 */
export const ALL_ENTRIES: MenuEntry[] = [...TOP.map((i) => ({ ...i })), ...MENU.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label, groupId: g.id })))];

/**
 * 메뉴에는 없지만 메뉴 안에서 들어가는 화면(등록·점검·사용 등). 화면 도움말 제목으로 찾게 한다.
 * 예: '품목 등록'은 재고 화면 안의 단추라 메뉴 이름에 없지만, 화면 제목 '재고 품목 등록'으로 찾아 바로 연다.
 * 보이는 권한은 그 화면이 든 메뉴를 따른다. 번호가 들어가는 화면([id])과 메뉴 밖 화면(로그인·고객용)은 뺀다.
 */
export const SUB_ENTRIES: MenuEntry[] = Object.entries(ROUTE_HELP)
  .filter(([route]) => !route.includes("["))
  .flatMap(([route, key]) => {
    if (ALL_ENTRIES.some((e) => e.href?.split("?")[0] === route)) return [];
    const parent = ALL_ENTRIES.filter((e) => e.href && !e.href.includes("?") && route.startsWith(e.href + "/")).sort((a, b) => b.href!.length - a.href!.length)[0];
    if (!parent) return [];
    const { title } = PAGE_HELP[key] as { title: string };
    return [{ label: title, href: route, group: parent.group, groupId: parent.groupId, std: parent.std, perm: parent.perm, roles: parent.roles, parent: parent.label }];
  });

/** 이름의 normalize 한 글자 자리를 원래 글자 자리로 바꾼다(굵게 표시용) */
function markOf(label: string, start: number, len: number) {
  const idx: number[] = [];
  [...label].forEach((ch, i) => {
    if (normalize(ch)) idx.push(i);
  });
  return { start: idx[start], end: idx[start + len - 1] + 1 };
}

/** 한 낱말이 메뉴 하나에 맞는 점수(0이면 안 맞음) */
function scoreWord(e: MenuEntry, w: string): { score: number; mark?: { start: number; end: number }; via?: string } {
  const label = normalize(e.label);
  const at = findIn(label, w);
  if (at >= 0) return { score: (at === 0 ? 100 : 80) - Math.min(at, 10) - (e.parent ? 5 : 0), mark: markOf(e.label, at, [...w].length) };
  for (const a of MENU_ALIAS[e.label] ?? []) {
    const p = findIn(normalize(a), w);
    if (p >= 0) return { score: p === 0 ? 60 : 50, via: a };
  }
  // 메뉴 안 화면은 제목으로만 찾는다(번호·묶음으로는 그 메뉴가 나오면 충분하다). 같은 점수면 메뉴가 앞에
  if (e.parent) return { score: 0 };
  if (e.std && findIn(normalize(e.std), w) >= 0) return { score: 45, via: e.std };
  if (e.group && findIn(normalize(e.group), w) >= 0) return { score: 30, via: e.group };
  return { score: 0 };
}

/** 찾는 말 하나를 그대로·영문 자판→한글로 바꿔 두 번 맞춰 보고 나은 쪽 */
function scoreQuery(e: MenuEntry, raw: string) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let total = 0;
  let mark: MenuHit["mark"];
  let via: string | undefined;
  for (const word of words) {
    const tries = [normalize(word), normalize(qwertyToHangul(word) ?? "")].filter(Boolean);
    const best = tries.map((w) => scoreWord(e, w)).sort((a, b) => b.score - a.score)[0];
    if (!best || !best.score) return null;
    total += best.score;
    mark ??= best.mark;
    via ??= best.via;
  }
  return { score: total, mark, via };
}

/** 찾기: 맞는 메뉴를 점수 높은 순으로(같으면 메뉴 순서). 거르기(권한·개발 예정)는 부르는 쪽에서 */
export function searchMenu(q: string, entries: MenuEntry[] = [...ALL_ENTRIES, ...SUB_ENTRIES]): MenuHit[] {
  return entries
    .map((e, order) => ({ e, order, r: scoreQuery(e, q) }))
    .filter((x) => x.r)
    .sort((a, b) => b.r!.score - a.r!.score || a.order - b.order)
    .map(({ e, r }) => ({ ...e, ...r! }));
}
