// 기록 보관함(2026-11-21 대표 결정): 조회줄이 붙은 모든 대장·전표 목록을 한 번에 찾는다.
// 목록마다 양식 번호와 '한 건 열기' 주소를 여기 적는다(없는 목록은 그 목록 화면을 번호로 찾아 연다).
import type { ListDef } from "./core";
import { cashbookList, expensesList, paymentsList } from "./defs/money";
import { fixturesList, ordersList, outsourceList, stockList, suppliersList } from "./defs/purchase";
import { chemicalsList, incidentsList, legalList, ncList, risksList, suggestionsList } from "./defs/quality";
import { approvalsList, corrList, docsList, messageLogList, tasksList, toolsList } from "./defs/work";
import { claimsList, complaintsList, consultsList, customersList, estimatesList, repairsList } from "./defs/repair";

export type ArchiveEntry = {
  key: string;
  /** 양식 번호(없으면 대장 이름만) */
  form?: string;
  /** 묶음(찾기 결과를 나눠 보임) */
  area: "수리·고객" | "구매·자재" | "돈" | "품질·안전" | "문서·업무";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  open?: (r: any) => string | null;
};

/** 타입을 지키며 열기 주소를 적는 도우미 */
const e = <R,>(def: ListDef<R>, area: ArchiveEntry["area"], form?: string, open?: (r: R) => string | null): ArchiveEntry => ({ key: def.key, area, form, open: open as ArchiveEntry["open"] });

export const ARCHIVE: ArchiveEntry[] = [
  e(consultsList, "수리·고객", "F-01-01", (r) => `/consults/${r.id}`),
  e(repairsList, "수리·고객", "F-02-01", (r) => `/repairs/${r.id}`),
  e(estimatesList, "수리·고객", "F-03-02"),
  e(claimsList, "수리·고객", undefined, (r) => `/repairs/${r.ro.id}`),
  e(customersList, "수리·고객", undefined, (r) => `/customers/${r.id}`),
  e(complaintsList, "수리·고객", "F-06-02", (r) => `/complaints/${r.c.id}`),
  e(paymentsList, "돈"),
  e(expensesList, "돈", "F-12-01", (r) => `/money/expenses/${r.id}`),
  e(cashbookList, "돈"),
  e(ordersList, "구매·자재", "F-07-02", (r) => `/purchases/${r.o.id}`),
  e(stockList, "구매·자재", undefined, (r) => `/stock/${r.id}`),
  e(suppliersList, "구매·자재", "F-07-01", (r) => `/suppliers/${r.id}`),
  e(outsourceList, "구매·자재", "F-07-03", (r) => `/outsource/${r.j.id}`),
  e(fixturesList, "구매·자재", "F-07-04", (r) => `/fixtures/${r.f.id}`),
  e(ncList, "품질·안전", "F-Q-10", (r) => `/nc/${r.n.id}`),
  e(legalList, "품질·안전", "F-Q-06", (r) => `/legal/${r.id}`),
  e(risksList, "품질·안전", "F-Q-03", (r) => `/risks/${r.id}`),
  e(incidentsList, "품질·안전", "F-09-03", (r) => `/incidents/${r.id}`),
  e(chemicalsList, "품질·안전", "F-09-02", (r) => `/chemicals/${r.id}`),
  e(suggestionsList, "품질·안전", "F-08-06", (r) => `/suggestions/${r.s.id}`),
  e(toolsList, "품질·안전", "F-08-08", (r) => `/tools/${r.id}`),
  e(docsList, "문서·업무", "F-Q-04", (r) => `/qms/docs/${r.id}`),
  e(corrList, "문서·업무", "F-Q-11", (r) => `/corr/${r.r.id}`),
  e(approvalsList, "문서·업무", undefined, (r) => `/approvals/${r.id}`),
  e(tasksList, "문서·업무", undefined, (r) => `/tasks/${r.i.id}`),
  e(messageLogList, "문서·업무"),
];
