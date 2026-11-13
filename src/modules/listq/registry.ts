// 조회줄이 붙은 목록 전체(엑셀 내려받기 주소 /lists/<key>/csv 가 여기서 찾는다)
import type { ListDef } from "./core";
import { expensesList } from "./defs/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LISTS: Record<string, ListDef<any>> = Object.fromEntries([expensesList].map((d) => [d.key, d]));
