// 주소(경로)로 그 화면의 도움말 찾기. 도움말 창이 열린 채 메뉴를 고르면 새 화면의 도움말로 바뀐다(대표 요청 2026-11-20).
import { ROUTE_HELP, type PageHelpKey } from "./pages";

const PATTERNS = Object.entries(ROUTE_HELP)
  .map(([route, key]) => ({
    key,
    dyn: route.includes("["),
    re: new RegExp(`^${route.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[^/\]]+\]/g, "[^/]+")}/?$`),
  }))
  // 고정 경로를 먼저(/tasks/new 가 /tasks/[id] 보다 앞)
  .sort((a, b) => Number(a.dyn) - Number(b.dyn));

export function helpForPath(pathname: string): PageHelpKey | null {
  const p = pathname.split(/[?#]/)[0] || "/";
  return PATTERNS.find((x) => x.re.test(p))?.key ?? null;
}
