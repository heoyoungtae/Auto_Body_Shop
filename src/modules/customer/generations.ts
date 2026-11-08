// 차종별 세대(코드·생산 연도)와 수리에 영향이 큰 사양. 화면(고르기·연식 점검)과 서버(자동 채움)가 같이 쓴다.
// 사용자 지시(2026-11-08): 세대는 목록화, 트림은 고정 목록 대신 이 정비소 기록·유료 조회로 추천.
// 연도는 국내 출시 기준의 대략값이다(연식·등록 시기에 따라 앞뒤 1년 차이가 날 수 있음). 부분변경은 같은 세대로 본다.

export type Generation = { code: string; name?: string; from: number; to?: number };

const g = (code: string, from: number, to?: number, name?: string): Generation => ({ code, from, to, name });

export const GENERATIONS: Record<string, Generation[]> = {
  // 현대
  아반떼: [g("MD", 2010, 2015), g("AD", 2015, 2020), g("CN7", 2020)],
  쏘나타: [g("YF", 2009, 2014), g("LF", 2014, 2019), g("DN8", 2019)],
  그랜저: [g("HG", 2011, 2016), g("IG", 2016, 2022), g("GN7", 2022)],
  "아이오닉 5": [g("NE", 2021)],
  "아이오닉 6": [g("CE", 2022)],
  캐스퍼: [g("AX1", 2021)],
  베뉴: [g("QX", 2019)],
  코나: [g("OS", 2017, 2023), g("SX2", 2023)],
  투싼: [g("LM", 2009, 2015, "투싼 ix"), g("TL", 2015, 2020), g("NX4", 2020)],
  싼타페: [g("CM", 2005, 2012), g("DM", 2012, 2018), g("TM", 2018, 2023), g("MX5", 2023)],
  팰리세이드: [g("LX2", 2018, 2025), g("LX3", 2025)],
  스타리아: [g("US4", 2021)],
  포터: [g("HR", 2004, undefined, "포터 II")],
  넥쏘: [g("FE", 2018, 2025), g("2세대", 2025)],
  i30: [g("GD", 2011, 2016), g("PD", 2016, 2020)],
  벨로스터: [g("FS", 2011, 2017), g("JS", 2018, 2022)],
  엑센트: [g("RB", 2010, 2019)],
  맥스크루즈: [g("NC", 2013, 2019)],
  쏠라티: [g("EU", 2016)],
  // 기아
  모닝: [g("TA", 2011, 2017), g("JA", 2017)],
  레이: [g("TAM", 2011)],
  K3: [g("YD", 2012, 2018), g("BD", 2018, 2024)],
  K5: [g("TF", 2010, 2015), g("JF", 2015, 2019), g("DL3", 2019)],
  K7: [g("VG", 2009, 2016), g("YG", 2016, 2021)],
  K8: [g("GL3", 2021)],
  K9: [g("KH", 2012, 2018), g("RJ", 2018)],
  스팅어: [g("CK", 2017, 2023)],
  니로: [g("DE", 2016, 2022), g("SG2", 2022)],
  스토닉: [g("YB", 2017, 2023)],
  셀토스: [g("SP2", 2019)],
  쏘울: [g("AM", 2008, 2013), g("PS", 2013, 2019), g("SK3", 2019, 2022)],
  스포티지: [g("SL", 2010, 2015), g("QL", 2015, 2021), g("NQ5", 2021)],
  쏘렌토: [g("XM", 2009, 2014), g("UM", 2014, 2020), g("MQ4", 2020)],
  모하비: [g("HM", 2008)],
  카니발: [g("VQ", 2006, 2014), g("YP", 2014, 2020), g("KA4", 2020)],
  카렌스: [g("RP", 2013, 2018)],
  EV3: [g("SV1", 2024)],
  EV6: [g("CV", 2021)],
  EV9: [g("MV", 2023)],
  봉고: [g("PU", 2004, undefined, "봉고 III")],
  // 제네시스
  G70: [g("IK", 2017)],
  G80: [g("DH", 2016, 2020), g("RG3", 2020)],
  G90: [g("HI", 2015, 2022, "EQ900·G90"), g("RS4", 2022)],
  GV60: [g("JW1", 2021)],
  GV70: [g("JK1", 2020)],
  GV80: [g("JX1", 2020)],
  // KG모빌리티
  티볼리: [g("X100", 2015)],
  코란도: [g("C200", 2011, 2019, "코란도 C"), g("C300", 2019)],
  토레스: [g("J100", 2022)],
  렉스턴: [g("Y290", 2012, 2017, "뉴 렉스턴"), g("Y400", 2017, undefined, "G4 렉스턴·렉스턴")],
  "렉스턴 스포츠": [g("Q200", 2018)],
  액티언: [g("J120", 2024)],
  // 르노코리아
  "아르카나(XM3)": [g("LJL", 2020)],
  QM6: [g("HZG", 2016)],
  SM6: [g("LFD", 2016)],
  "그랑 콜레오스": [g("1세대", 2024)],
  SM3: [g("L38", 2009, 2020)],
  SM5: [g("L43", 2010, 2019)],
  SM7: [g("L47", 2011, 2019)],
  // 쉐보레
  스파크: [g("M300", 2011, 2015), g("M400", 2015, 2022)],
  트랙스: [g("1세대", 2013, 2022), g("크로스오버", 2023, undefined, "트랙스 크로스오버")],
  말리부: [g("V300", 2011, 2016), g("V400", 2016, 2022)],
  // 수입
  "3시리즈": [g("F30", 2012, 2019), g("G20", 2019)],
  "5시리즈": [g("F10", 2010, 2017), g("G30", 2017, 2023), g("G60", 2023)],
  "7시리즈": [g("G11", 2015, 2022), g("G70", 2022)],
  X3: [g("F25", 2011, 2017), g("G01", 2017, 2024), g("G45", 2024)],
  X5: [g("F15", 2013, 2018), g("G05", 2018)],
  C클래스: [g("W205", 2014, 2021), g("W206", 2021)],
  E클래스: [g("W212", 2009, 2016), g("W213", 2016, 2023), g("W214", 2023)],
  S클래스: [g("W222", 2013, 2020), g("W223", 2020)],
  GLC: [g("X253", 2015, 2022), g("X254", 2022)],
  GLE: [g("W166", 2015, 2019), g("V167", 2019)],
  A4: [g("B8", 2008, 2015), g("B9", 2015)],
  A6: [g("C7", 2011, 2018), g("C8", 2018)],
  "모델 3": [g("1세대", 2017)],
  "모델 Y": [g("1세대", 2020)],
};

export const genLabel = (x: Generation) => `${x.name ? `${x.name} ` : ""}${x.code} · ${x.from}~${x.to ?? ""}`;

/** 목록의 차종 이름과 맞춘다(뒤에 붙은 말은 무시: "아반떼 하이브리드" → 아반떼) */
export function generationsOf(model?: string | null): Generation[] {
  const m = (model ?? "").trim();
  if (!m) return [];
  if (GENERATIONS[m]) return GENERATIONS[m];
  const k = Object.keys(GENERATIONS).find((x) => m.startsWith(`${x} `));
  return k ? GENERATIONS[k] : [];
}

/** 연식에 맞는 세대. 경계 해(두 세대가 겹침)는 고르지 않는다 */
export function generationFor(model: string | null | undefined, year: number | null | undefined): Generation | undefined {
  if (!year) return undefined;
  const hits = generationsOf(model).filter((x) => year >= x.from && year <= (x.to ?? 9999));
  return hits.length === 1 ? hits[0] : undefined;
}

/** 세대와 연식이 맞지 않으면 안내 문구(앞뒤 1년은 허용). 저장을 막지는 않는다 */
export function yearMismatch(model: string | null | undefined, gen: string | null | undefined, year: number | null | undefined): string | null {
  if (!gen || !year) return null;
  const x = generationsOf(model).find((y) => y.code === gen);
  if (!x) return null;
  if (year < x.from - 1 || year > (x.to ?? 9999) + 1) return `${gen}은(는) ${x.to ? `${x.from}~${x.to}년` : `${x.from}년 이후`} 차입니다. 연식 ${year}이(가) 맞는지 확인하세요`;
  return null;
}

/** 수리 사양: 범퍼·미러·램프·도장 공임과 부품에 영향이 큰 것 */
export const VEHICLE_OPTIONS = {
  radar_front: "전방 레이더(스마트 크루즈)",
  pdc_front: "전방 주차 센서",
  pdc_rear: "후방 주차 센서",
  bsd: "후측방 레이더(BSD)",
  svm: "서라운드뷰 카메라",
  led_head: "LED·매트릭스 헤드램프",
  sunroof: "파노라마 선루프",
  paint3: "3코트(펄)·무광 도장",
} as const;
export type VehicleOption = keyof typeof VEHICLE_OPTIONS;
export const isVehicleOption = (k: string): k is VehicleOption => k in VEHICLE_OPTIONS;

/** 이 정비소 기록이 없을 때 보여 줄 흔한 트림 이름(회사별, 모델마다 다를 수 있음) */
export const COMMON_TRIMS: Record<string, string[]> = {
  현대: ["스마트", "모던", "프리미엄", "인스퍼레이션", "익스클루시브", "캘리그래피", "N 라인"],
  기아: ["트렌디", "프레스티지", "노블레스", "시그니처", "그래비티", "X-Line", "GT-Line"],
  KG모빌리티: ["V3", "V5", "V7", "T5", "T7"],
  르노코리아: ["SE", "LE", "RE", "테크노", "아이코닉", "에스프리 알핀"],
  쉐보레: ["LS", "LT", "프리미어", "RS", "ACTIV"],
};
