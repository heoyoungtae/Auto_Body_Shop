// 사업 형태(개인·법인)와 세금 일정·감면 판단 규칙. 화면·서버·테스트가 같이 쓴다(DB 없음).
// 근거: 조세특례제한법 제6조(창업중소기업 세액감면, 2026~2027년 창업분 지역별 감면율), 제7조(중소기업 특별세액감면),
// 수도권정비계획법 시행령 별표 1(과밀억제권역), 국세기본법 제5조(기한이 공휴일·토요일·일요일이면 다음 날).
// 감면율·지역은 법이 바뀌면 고친다 [확인 필요]. 최종 판단은 세무사가 한다.

export const BIZ_FORMS = { individual: "개인사업자", corporate: "법인사업자" } as const;
export type BizForm = keyof typeof BIZ_FORMS;
export const isBizForm = (s: string): s is BizForm => s in BIZ_FORMS;

/** 사업자등록번호 가운데 두 자리로 개인·법인을 짐작한다(81·82·83·84·85·86·87·88 = 법인) */
export function formFromBizNo(bizNo: string): BizForm | null {
  const d = bizNo.replace(/\D/g, "");
  if (d.length !== 10) return null;
  const mid = Number(d.slice(3, 5));
  return mid >= 81 && mid <= 88 ? "corporate" : "individual";
}

export const REGIONS = {
  overcrowded: "수도권 과밀억제권역",
  capital: "수도권(과밀억제권역 밖)",
  depop: "인구감소지역(수도권 안)",
  outside: "수도권 밖",
} as const;
export type Region = keyof typeof REGIONS;
export const isRegion = (s: string): s is Region => s in REGIONS;

const INCHEON_SEOGU_OUT = ["대곡동", "불로동", "마전동", "금곡동", "오류동", "왕길동", "당하동", "원당동"];
/** 인천경제자유구역(송도·영종·청라) 법정동 */
const INCHEON_FEZ = ["송도동", "운서동", "운남동", "운북동", "중산동", "을왕동", "남북동", "덕교동", "무의동", "경서동", "연희동", "원창동", "청라동"];
const GYEONGGI_OVER = ["의정부시", "구리시", "하남시", "고양시", "수원시", "성남시", "안양시", "부천시", "광명시", "과천시", "의왕시", "군포시"];
const CAPITAL_DEPOP = ["강화군", "옹진군", "가평군", "연천군"];

/**
 * 주소로 과밀억제권역 여부를 짐작한다. 같은 구 안에서도 법정동에 따라 갈리는 곳은 sure=false(대표가 확인해 고름).
 * 도로명 주소에는 법정동이 없을 수 있어 상세 주소의 '(○○동)'까지 본다.
 */
export function regionOf(address: string): { region: Region | null; sure: boolean; why: string } {
  const a = address.replace(/\s+/g, " ");
  const has = (w: string) => a.includes(w);
  const dong = (list: string[]) => list.find((d) => has(d));
  if (!a.trim()) return { region: null, sure: false, why: "주소가 비어 있습니다" };
  if (has("서울")) return { region: "overcrowded", sure: true, why: "서울 전역은 과밀억제권역입니다" };
  const depop = CAPITAL_DEPOP.find((g) => has(g));
  if (depop && (has("인천") || has("경기"))) return { region: "depop", sure: true, why: `${depop}은 수도권 인구감소지역입니다` };
  if (has("인천")) {
    const fez = dong(INCHEON_FEZ);
    if (fez) return { region: "capital", sure: true, why: `${fez}은 인천경제자유구역이라 과밀억제권역에서 빠집니다` };
    if (has("서구")) {
      const d = dong(INCHEON_SEOGU_OUT);
      if (d) return { region: "capital", sure: true, why: `인천 서구 ${d}은 과밀억제권역에서 빠집니다` };
      return { region: "overcrowded", sure: false, why: "인천 서구는 대곡·불로·마전·금곡·오류·왕길·당하·원당동과 청라(경제자유구역)만 과밀억제권역 밖입니다. 법정동을 확인하세요" };
    }
    if (has("남동구"))
      return { region: "overcrowded", sure: false, why: "남동국가산업단지 안이면 과밀억제권역 밖입니다. 산업단지 안인지 확인하세요" };
    if (has("연수구") || has("중구"))
      return { region: "overcrowded", sure: false, why: "송도·영종(경제자유구역)이면 과밀억제권역 밖입니다. 법정동을 확인하세요" };
    return { region: "overcrowded", sure: true, why: "인천 대부분은 과밀억제권역입니다" };
  }
  if (has("경기")) {
    const city = GYEONGGI_OVER.find((c) => has(c));
    if (city) return { region: "overcrowded", sure: true, why: `${city}는 과밀억제권역입니다` };
    if (has("남양주시")) return { region: "overcrowded", sure: false, why: "남양주는 호평·평내·금곡·일패·이패·삼패·가운·수석·지금·도농동만 과밀억제권역입니다" };
    if (has("시흥시")) return { region: "overcrowded", sure: false, why: "시흥은 반월특수지역(시화 산업단지 쪽)만 과밀억제권역 밖입니다" };
    return { region: "capital", sure: true, why: "경기도 중 과밀억제권역이 아닌 시·군입니다" };
  }
  return { region: "outside", sure: true, why: "수도권 밖입니다" };
}

/** 창업중소기업 세액감면율(2026~2027년 창업, 조특법 제6조) */
export function startupReliefRate(region: Region, youth: boolean) {
  if (region === "overcrowded") return youth ? 50 : 0;
  if (region === "capital") return youth ? 75 : 25;
  return youth ? 100 : 50;
}

/** 중소기업 특별세액감면율(소기업, 자동차정비공장, 조특법 제7조) */
export function smeReliefRate(region: Region) {
  return region === "outside" ? 30 : 20;
}

export type ReliefKind = "startup" | "sme" | "none";
export const RELIEF_KINDS: Record<ReliefKind, string> = {
  startup: "창업중소기업 세액감면",
  sme: "중소기업 특별세액감면",
  none: "받지 않음",
};

/** 두 감면은 같은 해에 겹쳐 받을 수 없어 큰 쪽을 권한다. 창업감면은 처음 소득이 생긴 해부터 5년 */
export function recommendRelief(region: Region, youth: boolean, openedOn: string, today: string) {
  const startup = startupReliefRate(region, youth);
  const sme = smeReliefRate(region);
  const firstYear = Number(openedOn.slice(0, 4));
  const startupLeft = openedOn ? Math.max(0, firstYear + 5 - Number(today.slice(0, 4))) : 5;
  const startupOk = startup > 0 && startupLeft > 0 && (!openedOn || openedOn >= "2026-01-01");
  const kind: ReliefKind = startupOk && startup > sme ? "startup" : "sme";
  return {
    kind,
    rate: kind === "startup" ? startup : sme,
    startup,
    sme,
    startupLeft,
    why:
      kind === "startup"
        ? `창업감면 ${startup}%가 특별세액감면 ${sme}%보다 커서 창업감면을 권합니다(남은 ${startupLeft}년, 그 뒤에는 특별세액감면)`
        : startup > 0 && !startupOk
          ? `창업감면 기간이 끝났거나 대상이 아니어서 특별세액감면 ${sme}%를 권합니다`
          : `이 지역은 창업감면이 ${startup}%라 특별세액감면 ${sme}%를 권합니다`,
  };
}

/** 성실신고확인 대상 수입금액(수리업 등, 소득세법 시행령 제133조) — 업종에 따라 다를 수 있음 [확인 필요] */
export const DILIGENT_REPORT_REVENUE = 500_000_000;

// ---------------- 신고·납부 일정 ----------------

export type TaxDeadline = { key: string; due: string; what: string; detail: string };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 기한이 토·일·공휴일이면 다음 날(국세기본법 제5조) */
export function shiftDue(date: string, isHoliday: (iso: string) => boolean) {
  let t = Date.parse(`${date}T00:00:00Z`);
  for (let i = 0; i < 10; i++) {
    const d = new Date(t);
    const day = d.getUTCDay();
    const s = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !isHoliday(s)) return s;
    t += 864e5;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 한 해의 신고·납부 기한. 개인: 부가세 1·7월 확정(4·10월 예정고지 납부), 종합소득세 5월(성실신고 6월), 중간예납 11월.
 * 법인: 부가세 1·4·7·10월, 법인세(사업연도 끝난 달 + 3개월 말일), 중간예납(사업연도 6개월 뒤 + 2개월 말일).
 * 원천세는 직원이 있을 때만: 매달 10일(반기납부면 1·7월 10일).
 */
export function taxDeadlines(
  year: number,
  o: { form: BizForm; fiscalStartMonth: number; withholding: boolean; halfYear: boolean; diligent: boolean },
): TaxDeadline[] {
  const out: TaxDeadline[] = [];
  if (o.withholding) {
    const months = o.halfYear ? [1, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const m of months)
      out.push({
        key: `wh-${year}-${pad(m)}`,
        due: iso(year, m, 10),
        what: o.halfYear ? `원천세 반기 신고·납부(${m === 1 ? "지난해 하반기" : "상반기"})` : "원천세 신고·납부(지난달 급여)",
        detail: "급여대장의 소득세·지방소득세 합계를 홈택스·위택스에 신고·납부합니다",
      });
    out.push({ key: `wh-annual-${year}`, due: iso(year, 3, 10), what: "근로소득 지급명세서 제출(연말정산)", detail: "지난해 직원별 연간 급여·소득세. 세무사에게 맡기면 자료만 넘깁니다" });
  }
  if (o.form === "individual") {
    out.push({ key: `vat-${year}-01`, due: iso(year, 1, 25), what: "부가가치세 확정 신고(지난해 7~12월)", detail: "매출·매입 세금계산서·카드·현금영수증 자료" });
    out.push({ key: `vat-${year}-04`, due: iso(year, 4, 25), what: "부가가치세 예정고지 납부", detail: "세무서가 보낸 고지서 금액을 냅니다(신고 없음)" });
    out.push({ key: `vat-${year}-07`, due: iso(year, 7, 25), what: "부가가치세 확정 신고(1~6월)", detail: "매출·매입 세금계산서·카드·현금영수증 자료" });
    out.push({ key: `vat-${year}-10`, due: iso(year, 10, 25), what: "부가가치세 예정고지 납부", detail: "세무서가 보낸 고지서 금액을 냅니다(신고 없음)" });
    out.push({
      key: `inc-${year}`,
      due: o.diligent ? iso(year, 6, 30) : iso(year, 5, 31),
      what: `종합소득세 신고·납부(지난해)${o.diligent ? " — 성실신고확인" : ""}`,
      detail: "지난해 장부(매출·지출결의·급여·감가상각)와 노란우산공제 납입 내역. 건강보험료는 신고 뒤 다시 정산됩니다",
    });
    out.push({ key: `inc-mid-${year}`, due: iso(year, 11, 30), what: "종합소득세 중간예납 납부", detail: "세무서 고지서 금액(지난해 세금의 절반)" });
  } else {
    for (const [m, half] of [[1, "지난해 10~12월 확정"], [4, "1~3월 예정"], [7, "4~6월 확정"], [10, "7~9월 예정"]] as const)
      out.push({ key: `vat-${year}-${pad(m)}`, due: iso(year, m, 25), what: `부가가치세 신고(${half})`, detail: "법인은 예정 신고도 직접 합니다" });
    const endM = ((o.fiscalStartMonth + 10) % 12) + 1; // 사업연도 끝 달
    const fileM = ((endM + 2) % 12) + 1;
    out.push({ key: `corp-${year}`, due: iso(year, fileM, lastDay(year, fileM)), what: "법인세 신고·납부", detail: `사업연도(${o.fiscalStartMonth}월 시작) 끝난 뒤 3개월 안. 임원 보수·배당 결의 의사록도 같이 정리합니다` });
    const midM = ((o.fiscalStartMonth + 6) % 12) + 1; // 처음 6개월이 끝난 뒤 2개월 = 시작 달부터 8번째 달 끝
    out.push({ key: `corp-mid-${year}`, due: iso(year, midM, lastDay(year, midM)), what: "법인세 중간예납", detail: "사업연도 처음 6개월분. 직전 연도 세액의 절반 또는 가결산" });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
