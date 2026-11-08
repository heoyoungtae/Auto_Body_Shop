// 제조사·차종 목록과 차대번호(VIN) 읽기. 화면(고르기·추천)과 서버(검사)가 같이 쓴다.
// 목록은 국내에서 흔히 보는 차종이며 고르기 쉽게 하려는 것이다. 목록에 없는 차종도 그대로 적을 수 있다.

export const MAKERS: Record<string, string[]> = {
  현대: ["아반떼", "쏘나타", "그랜저", "아이오닉 5", "아이오닉 6", "캐스퍼", "베뉴", "코나", "투싼", "싼타페", "팰리세이드", "스타리아", "포터", "넥쏘", "i30", "벨로스터", "엑센트", "맥스크루즈", "쏠라티"],
  기아: ["모닝", "레이", "K3", "K5", "K7", "K8", "K9", "스팅어", "니로", "스토닉", "셀토스", "쏘울", "스포티지", "쏘렌토", "모하비", "카니발", "카렌스", "EV3", "EV6", "EV9", "봉고"],
  제네시스: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
  KG모빌리티: ["티볼리", "코란도", "토레스", "렉스턴", "렉스턴 스포츠", "액티언"],
  르노코리아: ["아르카나(XM3)", "QM6", "SM6", "그랑 콜레오스", "QM3", "SM3", "SM5", "SM7"],
  쉐보레: ["스파크", "트랙스", "트레일블레이저", "말리부", "이쿼녹스", "트래버스", "타호", "콜로라도", "볼트 EV"],
  BMW: ["1시리즈", "3시리즈", "4시리즈", "5시리즈", "7시리즈", "X1", "X3", "X4", "X5", "X6", "X7", "i4", "i5", "iX"],
  벤츠: ["A클래스", "C클래스", "E클래스", "S클래스", "CLA", "CLS", "GLA", "GLB", "GLC", "GLE", "GLS", "G클래스", "EQA", "EQE", "EQS"],
  아우디: ["A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "e-tron"],
  폭스바겐: ["골프", "제타", "파사트", "아테온", "티구안", "투아렉", "ID.4"],
  볼보: ["S60", "S90", "V60", "V90", "XC40", "XC60", "XC90", "EX30"],
  테슬라: ["모델 3", "모델 Y", "모델 S", "모델 X"],
  토요타: ["캠리", "프리우스", "라브4", "시에나", "크라운"],
  렉서스: ["ES", "IS", "LS", "NX", "RX", "UX"],
  혼다: ["어코드", "시빅", "CR-V", "파일럿", "오딧세이"],
  포르쉐: ["911", "카이엔", "마칸", "파나메라", "타이칸"],
  미니: ["쿠퍼", "컨트리맨", "클럽맨"],
  랜드로버: ["디펜더", "디스커버리", "디스커버리 스포츠", "레인지로버", "레인지로버 스포츠", "레인지로버 이보크", "레인지로버 벨라"],
  포드: ["익스플로러", "머스탱", "브롱코"],
  지프: ["랭글러", "그랜드 체로키", "컴패스", "레니게이드"],
  폴스타: ["폴스타 2", "폴스타 4"],
  기타: [],
};
export const MAKER_NAMES = Object.keys(MAKERS);

/** 차대번호 앞 3자리(제작사 식별 부호) → 제조사. 대표적인 것만. 모르면 비워 둔다 */
const WMI: [RegExp, string][] = [
  [/^KMT/, "제네시스"],
  [/^KM[HFJ]/, "현대"],
  [/^KN[ACDE]/, "기아"],
  [/^KP[ATH]/, "KG모빌리티"],
  [/^KNM/, "르노코리아"],
  [/^KL/, "쉐보레"],
  [/^(WBA|WBS|WBY|WBX)/, "BMW"],
  [/^(WDD|WDB|WDC|W1K|W1N|W1V)/, "벤츠"],
  [/^(WAU|WA1|TRU)/, "아우디"],
  [/^(WVW|WVG|WV1|WV2|3VW)/, "폭스바겐"],
  [/^(YV1|YV4|LYV)/, "볼보"],
  [/^(5YJ|7SA|LRW|XP7)/, "테슬라"],
  [/^(JTH|JTJ|2T2)/, "렉서스"],
  [/^(JT|4T1|5TD)/, "토요타"],
  [/^(JHM|JHL|5FN|5J6|1HG)/, "혼다"],
  [/^WP[01]/, "포르쉐"],
  [/^WMW/, "미니"],
  [/^SAL/, "랜드로버"],
  [/^(1FA|1FM|1FT)/, "포드"],
  [/^1C4/, "지프"],
  [/^(LPS|YSM)/, "폴스타"],
];

/** 10번째 자리 연식 부호(ISO 3779). A=2010 … Y=2030, 1~9=2001~2009 */
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY";

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const normalizeVin = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

export function decodeVin(raw: string, now = new Date()): { maker?: string; year?: number } | null {
  const v = normalizeVin(raw);
  if (!VIN_RE.test(v)) return null;
  const maker = WMI.find(([re]) => re.test(v))?.[1];
  const c = v[9];
  let year: number | undefined;
  const i = YEAR_CODES.indexOf(c);
  if (i >= 0) year = 2010 + i;
  else if (/[1-9]/.test(c)) year = 2000 + Number(c);
  if (year != null && year > now.getFullYear() + 1) year -= 30;
  return { maker, year };
}

/** 차종 → 제조사(목록에 있으면) */
export function makerOf(model: string): string | undefined {
  const m = model.trim();
  return MAKER_NAMES.find((k) => MAKERS[k].some((x) => m === x || m.startsWith(`${x} `)));
}
