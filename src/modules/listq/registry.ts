// 조회줄이 붙은 목록 전체(엑셀 내려받기 주소 /lists/<key>/csv 가 여기서 찾는다)
import type { ListDef } from "./core";
import { expensesList, paymentsList } from "./defs/money";
import { fixturesList, ordersList, outsourceList, stockList, suppliersList } from "./defs/purchase";
import { chemicalsList, incidentsList, legalList, ncList, risksList, suggestionsList } from "./defs/quality";
import { approvalsList, docsList, messageLogList, tasksList, toolsList } from "./defs/work";
import { claimsList, complaintsList, consultsList, customersList, estimatesList, repairsList } from "./defs/repair";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL: ListDef<any>[] = [
  consultsList,
  repairsList,
  estimatesList,
  claimsList,
  customersList,
  complaintsList,
  paymentsList,
  expensesList,
  ordersList,
  stockList,
  suppliersList,
  outsourceList,
  fixturesList,
  ncList,
  legalList,
  risksList,
  incidentsList,
  chemicalsList,
  suggestionsList,
  toolsList,
  docsList,
  approvalsList,
  tasksList,
  messageLogList,
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LISTS: Record<string, ListDef<any>> = Object.fromEntries(ALL.map((d) => [d.key, d]));
export const LIST_DEFS = ALL;
