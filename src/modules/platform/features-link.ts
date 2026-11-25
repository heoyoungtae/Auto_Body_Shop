// 안 쓰는 기능 끄기: 주소가 꺼 둔 기능의 화면인지 판단(서버·화면 양쪽에서 쓰는 순수 함수라 따로 둔다)

/** 이 주소(메뉴·할 일·알림의 링크)가 꺼 둔 기능의 화면인가. 경로만 보고(?·# 뒤는 무시) 같거나 그 아래면 숨김. ?가 붙은 항목은 그 조건 화면만(앞부분이 같으면) */
export function linkHidden(link: string | null | undefined, hidden: string[]): boolean {
  if (!link || !hidden.length) return false;
  const path = link.split(/[?#]/)[0];
  return hidden.some((h) => (h.includes("?") ? link.startsWith(h) : path === h || path.startsWith(`${h}/`)));
}
