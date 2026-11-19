// 사내 표준서 조항 번호 → 앱 안 표준서 화면 주소(2026-11-19).
// 메뉴·화면 제목·도움말·표준서 본문에 적힌 'STD-02 5절', '총람 Q.6', 'STD-11.2', 'F-02-01', '부록 B' 같은 글자를 눌러 갈 수 있게 한다.
// 순수 함수만 두어 서버·브라우저 어디서나 쓴다.

/** 장 순서(총람 차례). 00 총칙, Q 품질경영, 01~13, 부록 A~D */
export const STD_CHAPTERS = [
  "00",
  "Q",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
] as const;
export const STD_APPENDICES = ["A", "B", "C", "D"] as const;
export type StdCh = (typeof STD_CHAPTERS)[number] | (typeof STD_APPENDICES)[number];
export const isStdCh = (v: string): v is StdCh =>
  (STD_CHAPTERS as readonly string[]).includes(v) ||
  (STD_APPENDICES as readonly string[]).includes(v);

/** '2'·'02'·'Q' → '02'·'Q' */
export const chOf = (n: string) => (n === "Q" ? "Q" : n.padStart(2, "0"));
/** '02' → '2' (총람 절 번호는 앞 0 없이 '2.2') */
const bare = (ch: string) => (ch === "Q" ? "Q" : String(Number(ch)));

/** 절 키 → 화면 주소 */
export function stdKeyHref(key: string): string {
  const [part, a, b] = key.split(":");
  if (part === "f") return a === "intro" ? "/std/forms" : `/std/form/${a}`;
  if (part === "a") return `/std/${a}`;
  if (part === "p") {
    if (a === "intro") return "/std/00#p-intro";
    const ch = chOf(a.slice(4));
    return b ? `/std/${ch}#p-${b}` : `/std/${ch}#p`;
  }
  // 총람
  if (a === "info") return "/std/00#o-info";
  const m = /^(\d+|Q)(?:\.(\d+))?$/.exec(a);
  if (!m) return "/std";
  return m[2] ? `/std/${chOf(m[1])}#o-${a}` : `/std/${chOf(m[1])}`;
}

export type StdSeg = { text: string; href?: string };

// 순서가 중요: 긴 꼴부터
const RE = new RegExp(
  [
    // 1 양식
    String.raw`(F-(?:Q|\d{2})-\d{2})`,
    // 2~6 STD-NN [ 'M절' | 'M장' | '.M' | ' N.M' ]
    String.raw`STD-(\d{2}|Q)(?:\s?(\d{1,2})(?:·\d{1,2})*\s?[절장]|\.(\d{1,2})|\s((?:\d{1,2}|Q)\.\d{1,2}))?`,
    // 7 총람·표준서 N.M
    String.raw`(?:총람|표준서)\s((?:\d{1,2}|Q)\.\d{1,2})`,
    // 8 부록 X
    String.raw`부록\s([A-D])`,
    // 9 표준서 본문 속 괄호 '(7.4)', '(Q.5)'
    String.raw`\(((?:\d{1,2}|Q)\.\d{1,2})\)`,
  ].join("|"),
  "g",
);

/** 글 속의 조항 번호를 찾아 링크 조각으로 나눈다 */
export function linkifyStd(text: string): StdSeg[] {
  const out: StdSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const i = m.index ?? 0;
    let href: string | undefined;
    let shown = m[0];
    let lead = "";
    if (m[1]) href = `/std/form/${m[1]}`;
    else if (m[2]) {
      const ch = m[2];
      if (m[3]) href = `/std/${ch}#p-${m[3]}`;
      else if (m[4]) href = `/std/${ch}#o-${bare(ch)}.${Number(m[4])}`;
      else if (m[5]) href = `/std/${ch}#o-${m[5]}`;
      else href = `/std/${ch}`;
    } else if (m[6]) {
      const [c] = m[6].split(".");
      href = `/std/${chOf(c)}#o-${m[6]}`;
    } else if (m[7]) href = `/std/${m[7]}`;
    else if (m[8]) {
      const [c] = m[8].split(".");
      if (c === "Q" || Number(c) <= 13) {
        href = `/std/${chOf(c)}#o-${m[8]}`;
        lead = "(";
        shown = m[8];
      }
    }
    if (!href) continue;
    if (i > last) out.push({ text: text.slice(last, i) });
    if (lead) out.push({ text: lead });
    out.push({ text: shown, href });
    if (lead) out.push({ text: ")" });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** 첫 조항 번호의 주소(없으면 null) — 제목 옆 배지처럼 한 곳만 걸 때 */
export function stdHref(text: string): string | null {
  return linkifyStd(text).find((s) => s.href)?.href ?? null;
}

/** 양식 번호 → 그 양식을 쓰는 앱 화면 */
export const FORM_SCREEN: Record<string, string> = {
  "F-Q-01": "/qms/context",
  "F-Q-02": "/qms/goals",
  "F-Q-03": "/risks",
  "F-Q-04": "/qms/docs",
  "F-Q-05": "/approvals/new",
  "F-Q-06": "/legal",
  "F-Q-07": "/legal",
  "F-Q-08": "/audits",
  "F-Q-09": "/qms/review",
  "F-Q-10": "/nc",
  "F-01-01": "/consults",
  "F-02-01": "/repairs",
  "F-03-01": "/settings/labor",
  "F-03-02": "/estimates",
  "F-04-01": "/work",
  "F-05-01": "/repairs?f=qc",
  "F-05-02": "/repairs",
  "F-06-01": "/complaints",
  "F-06-02": "/complaints",
  "F-07-01": "/suppliers",
  "F-07-02": "/purchases",
  "F-07-03": "/outsource",
  "F-07-04": "/fixtures",
  "F-08-01": "/equipment",
  "F-08-02": "/equipment/checks",
  "F-08-03": "/equipment/lube",
  "F-08-04": "/equipment",
  "F-08-05": "/five-s",
  "F-08-06": "/suggestions",
  "F-08-07": "/equipment/pm",
  "F-08-08": "/tools",
  "F-09-01": "/hazards",
  "F-09-02": "/chemicals",
  "F-09-03": "/incidents",
  "F-10-01": "/environment",
  "F-10-02": "/environment",
  "F-11-01": "/staff",
  "F-11-02": "/staff/competency",
  "F-11-03": "/training",
  "F-11-04": "/attendance",
  "F-11-05": "/payroll",
  "F-11-06": "/reviews",
  "F-11-07": "/staff/exit",
  "F-11-08": "/jobs",
  "F-11-09": "/staff/onboarding",
  "F-12-01": "/money/expenses",
  "F-13-01": "/customers",
  "F-13-02": "/staff/docs",
  "F-13-03": "/staff/docs",
};

export type DiffLine = { op: "same" | "del" | "add"; text: string };

/** 줄 단위 비교(개정 요청서에서 바뀌는 곳만 보이게). 절 하나는 길어야 수십 줄이라 단순 LCS 로 충분 */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: "same", text: x[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "del", text: x[i++] });
    else out.push({ op: "add", text: y[j++] });
  }
  while (i < n) out.push({ op: "del", text: x[i++] });
  while (j < m) out.push({ op: "add", text: y[j++] });
  return out;
}
