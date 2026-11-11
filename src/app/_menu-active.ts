// 지금 화면에 맞는 메뉴 고르기. 사이드 메뉴의 선택 표시·묶음 펼침·'최근에 연 메뉴'가 같이 쓴다.
// 메뉴 주소에 ?f=warranty 같은 조건이 붙어 있으면 그 조건까지 맞아야 그 메뉴다.
// 예: /complaints?f=warranty&ym=2026-11 → '보증 수리', /complaints?f=open → '만족도·불만'.

/** 메뉴 주소(href)가 지금 화면(path + search)에 맞으면 맞은 정도(클수록 구체적), 아니면 -1 */
export function matchScore(href: string, path: string, search: string): number {
  const [hp, hq = ""] = href.split("?");
  if (path !== hp && !path.startsWith(hp + "/")) return -1;
  const want = new URLSearchParams(hq);
  const have = new URLSearchParams(search);
  let n = 0;
  for (const [k, v] of want) {
    if (have.get(k) !== v) return -1;
    n++;
  }
  // 경로가 길수록, 같은 경로면 맞춘 조건이 많을수록 구체적
  return hp.length * 100 + n;
}

/** 여러 메뉴 주소 가운데 지금 화면에 가장 구체적으로 맞는 하나 */
export function pickActive(hrefs: readonly string[], path: string, search: string): string | undefined {
  let best: string | undefined;
  let top = -1;
  for (const h of hrefs) {
    const s = matchScore(h, path, search);
    if (s > top) {
      top = s;
      best = h;
    }
  }
  return best;
}
