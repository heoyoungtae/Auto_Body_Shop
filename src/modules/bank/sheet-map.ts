// 읽은 표에서 머리글 줄을 찾아 열의 뜻(날짜·입금·출금·잔액·상대방·승인번호…)을 정하고, 거래 줄로 바꾼다(순수 함수).
// 은행·카드사·홈택스마다 머리글 이름이 달라서 같은 뜻의 여러 이름을 모아 두었다. 새 이름이 나오면 여기 넣으면 된다.
import { bizDigits, parseDateTime, parseWon, type TxKind } from "./rules";
import type { Cell, Grid } from "./sheet-read";

export const FILE_KINDS = {
  auto: "자동 인식",
  bank: "은행 통장 거래내역",
  card: "카드 이용(승인)내역",
  tax: "홈택스 전자(세금)계산서 목록(매출·매입)",
  cash_sale: "홈택스 현금영수증 매출내역",
  cash_buy: "홈택스 현금영수증 매입내역",
  card_buy: "홈택스 사업용 신용카드 매입내역",
} as const;
export type FileKind = keyof typeof FILE_KINDS;
export const isFileKind = (s: string): s is FileKind => s in FILE_KINDS;

type Col =
  | "date"
  | "time"
  | "in"
  | "out"
  | "amount"
  | "balance"
  | "party"
  | "memo"
  | "dir"
  | "approval"
  | "status"
  | "cardNo"
  | "supply"
  | "vat"
  | "total"
  | "sellerBiz"
  | "sellerName"
  | "buyerBiz"
  | "buyerName"
  | "item"
  | "merchantBiz";

/** 뜻 → 머리글 이름(공백·괄호 뺀 꼴로 비교). 앞에 있는 이름일수록 먼저 고른다 */
const SYN: Record<Col, string[]> = {
  date: ["거래일시", "거래일자", "거래일", "거래날짜", "이용일시", "이용일자", "이용일", "승인일시", "승인일자", "승인일", "매출일시", "매출일자", "작성일자", "거래년월일", "일자", "날짜", "사용일", "사용일자", "결제일자", "발급일자"],
  time: ["거래시간", "이용시간", "승인시간", "시간", "거래시각", "사용시간"],
  in: ["입금액", "입금", "맡기신금액", "입금금액", "받은금액", "입금원"],
  out: ["출금액", "출금", "찾으신금액", "출금금액", "지급액", "지급금액", "보낸금액", "출금원"],
  amount: ["거래금액", "이용금액", "승인금액", "결제금액", "금액", "사용금액", "매출금액", "이용금액원"],
  balance: ["거래후잔액", "잔액", "잔고", "거래후잔고", "잔액원"],
  party: ["보낸분받는분", "받는분보낸분", "기재내용", "거래내용", "내용", "의뢰인수취인", "상대방", "입금자", "받는분", "보낸분", "이용가맹점", "가맹점명", "가맹점", "이용하신곳", "상호", "거래처", "통장표시내용", "거래기록사항", "적요내용"],
  memo: ["적요", "송금메모", "메모", "비고", "거래점", "처리점", "취급점"],
  dir: ["구분", "거래구분", "입출금구분", "입출구분", "거래종류"],
  approval: ["승인번호"],
  status: ["취소여부", "상태", "승인구분", "취소구분", "매출구분", "거래상태"],
  cardNo: ["카드번호", "이용카드", "카드"],
  supply: ["공급가액", "공급가"],
  vat: ["세액", "부가세", "부가가치세"],
  total: ["합계금액", "총금액", "합계", "매입금액합계"],
  sellerBiz: ["공급자사업자등록번호", "공급자등록번호"],
  sellerName: ["공급자상호"],
  buyerBiz: ["공급받는자사업자등록번호", "공급받는자등록번호"],
  buyerName: ["공급받는자상호"],
  item: ["품목명", "대표품목"],
  merchantBiz: ["가맹점사업자번호", "가맹점사업자등록번호", "판매자사업자번호"],
};

const norm = (c: Cell) =>
  String(c ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s/·._\-[\]]/g, "")
    .trim();

/** 머리글 줄 찾기: 위 40줄 중 아는 이름이 가장 많은 줄 */
export function findHeader(grid: Grid): { row: number; cols: Partial<Record<Col, number>>; names: Record<number, string> } | null {
  let best: { row: number; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const cells = (grid[r] ?? []).map(norm);
    const score = cells.filter((c) => c && Object.values(SYN).some((l) => l.includes(c))).length;
    if (score >= 2 && (!best || score > best.score)) best = { row: r, score };
  }
  if (!best) return null;
  const cells = (grid[best.row] ?? []).map(norm);
  const cols: Partial<Record<Col, number>> = {};
  const taken = new Set<number>();
  // 세금계산서: 상호가 두 번(공급자·공급받는자) 나오므로 사업자번호 바로 뒤의 상호를 짝짓는다
  const sb = cells.indexOf("공급자사업자등록번호");
  const bb = cells.indexOf("공급받는자사업자등록번호");
  if (sb >= 0) {
    cols.sellerBiz = sb;
    taken.add(sb);
    const n = cells.findIndex((c, i) => i > sb && c === "상호");
    if (n >= 0) {
      cols.sellerName = n;
      taken.add(n);
    }
  }
  if (bb >= 0) {
    cols.buyerBiz = bb;
    taken.add(bb);
    const n = cells.findIndex((c, i) => i > bb && c === "상호");
    if (n >= 0) {
      cols.buyerName = n;
      taken.add(n);
    }
  }
  const order: Col[] = ["approval", "date", "time", "in", "out", "balance", "supply", "vat", "total", "amount", "merchantBiz", "cardNo", "dir", "status", "party", "memo", "item"];
  for (const col of order) {
    if (cols[col] != null) continue;
    for (const name of SYN[col]) {
      const i = cells.findIndex((c, k) => c === name && !taken.has(k));
      if (i >= 0) {
        cols[col] = i;
        taken.add(i);
        break;
      }
    }
  }
  const names: Record<number, string> = {};
  for (const [k, i] of Object.entries(cols)) names[i as number] = `${String(grid[best.row][i as number] ?? "").trim()} → ${COL_LABEL[k as Col]}`;
  return { row: best.row, cols, names };
}

const COL_LABEL: Record<Col, string> = {
  date: "날짜",
  time: "시각",
  in: "입금",
  out: "출금",
  amount: "금액",
  balance: "잔액",
  party: "상대방",
  memo: "적요",
  dir: "입출금 구분",
  approval: "승인번호",
  status: "취소 여부",
  cardNo: "카드 번호",
  supply: "공급가액",
  vat: "세액",
  total: "합계",
  sellerBiz: "공급자 사업자번호",
  sellerName: "공급자 상호",
  buyerBiz: "공급받는자 사업자번호",
  buyerName: "공급받는자 상호",
  item: "품목",
  merchantBiz: "가맹점 사업자번호",
};

/** 머리글로 파일 종류 짐작 */
export function guessKind(cols: Partial<Record<Col, number>>): Exclude<FileKind, "auto"> | null {
  if (cols.sellerBiz != null && cols.buyerBiz != null) return "tax";
  if (cols.merchantBiz != null && cols.supply != null) return "card_buy";
  if (cols.approval != null && cols.supply != null && cols.vat != null) return null; // 현금영수증: 매출·매입은 사람이 고름
  if (cols.balance != null || cols.in != null || cols.out != null) return "bank";
  if (cols.approval != null || cols.cardNo != null) return "card";
  return null;
}

export type SheetTx = {
  kind: TxKind;
  on: string;
  at: string | null;
  amountWon: number;
  balanceWon: number | null;
  party: string | null;
  partyBizNo: string | null;
  memo: string | null;
  approvalNo: string | null;
  supplyWon: number | null;
  vatWon: number | null;
  /** 줄에 보인 카드·계좌 번호 끝자리 */
  digits: string | null;
};

export type SheetResult = {
  kind: Exclude<FileKind, "auto">;
  rows: SheetTx[];
  skipped: { line: number; why: string }[];
  columns: string[];
  /** 머리글 위 줄에 보인 계좌·카드 번호 끝자리(어느 통장인지 짐작) */
  headDigits: string[];
};

export class MapError extends Error {}

/**
 * 표 → 거래 줄. kind 가 auto 면 머리글로 짐작한다. shopBizNo: 우리 사업자번호(세금계산서 매출·매입 가르기)
 */
export function mapSheet(grid: Grid, kind: FileKind, opts: { shopBizNo?: string } = {}): SheetResult {
  const h = findHeader(grid);
  if (!h) throw new MapError("머리글 줄(거래일자·금액 같은 칸 이름)을 찾지 못했습니다. 은행·카드사 화면에서 '엑셀 저장'으로 받은 원본을 그대로 올려 주세요");
  const c = h.cols;
  const k = kind === "auto" ? guessKind(c) : kind;
  if (!k) throw new MapError("어떤 내역인지 알아보지 못했습니다. '파일 종류'를 골라 다시 올려 주세요(현금영수증은 매출·매입을 골라야 합니다)");
  if (c.date == null) throw new MapError("날짜 칸을 찾지 못했습니다");
  const shop = bizDigits(opts.shopBizNo);
  const get = (row: Cell[], col?: number) => (col == null ? null : (row[col] ?? null));
  const str = (row: Cell[], col?: number) => {
    const v = get(row, col);
    return v == null ? null : String(v).trim() || null;
  };
  const headDigits = grid
    .slice(0, h.row)
    .flat()
    .map((v) => String(v ?? ""))
    .flatMap((s) => [...s.matchAll(/\d[\d*-]{7,}\d/g)].map((m) => m[0].replace(/\D/g, "").slice(-4)));
  const rows: SheetTx[] = [];
  const skipped: { line: number; why: string }[] = [];
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (!row.some((v) => v != null && String(v).trim() !== "")) continue;
    const line = r + 1;
    const dateCell = get(row, c.date);
    const dt = parseDateTime(dateCell);
    if (!dt) {
      // 합계·소계 줄은 조용히 넘김
      const joined = row.map((v) => String(v ?? "")).join(" ");
      if (!/합계|소계|총계|건수|조회|페이지|이하\s*여백/.test(joined)) skipped.push({ line, why: `날짜를 읽지 못함(${String(dateCell ?? "빈 칸").slice(0, 20)})` });
      continue;
    }
    const tm = str(row, c.time);
    const at = dt.at ?? (tm && /\d{1,2}:\d{2}/.test(tm) ? tm.match(/(\d{1,2}):(\d{2})/)!.slice(1).map((x) => x.padStart(2, "0")).join(":") : tm && /^\d{4,6}$/.test(tm) ? `${tm.padStart(6, "0").slice(0, 2)}:${tm.padStart(6, "0").slice(2, 4)}` : null);
    const approvalNo = str(row, c.approval);
    const memo = str(row, c.memo);
    const cardDigits = (str(row, c.cardNo) ?? "").replace(/\D/g, "").slice(-4) || null;
    if (k === "bank") {
      const inn = parseWon(get(row, c.in)) ?? 0;
      const out = parseWon(get(row, c.out)) ?? 0;
      let amount = 0;
      let dir: "in" | "out" | null = null;
      if (inn > 0 && out <= 0) [amount, dir] = [inn, "in"];
      else if (out > 0 && inn <= 0) [amount, dir] = [out, "out"];
      else if (c.amount != null) {
        const a = parseWon(get(row, c.amount)) ?? 0;
        const d = `${str(row, c.dir) ?? ""}${memo ?? ""}`;
        if (a < 0) [amount, dir] = [-a, "out"];
        else if (/입금|입/.test(d)) [amount, dir] = [a, "in"];
        else if (/출금|지급|출|인출|이체/.test(d)) [amount, dir] = [a, "out"];
        else if (a > 0) {
          skipped.push({ line, why: "입금인지 출금인지 알 수 없음" });
          continue;
        }
      }
      if (!dir || amount <= 0) {
        if (inn !== 0 || out !== 0) skipped.push({ line, why: "금액을 읽지 못함" });
        continue;
      }
      rows.push({ kind: dir, on: dt.on, at, amountWon: amount, balanceWon: parseWon(get(row, c.balance)), party: str(row, c.party) ?? memo, partyBizNo: null, memo: c.party != null ? memo : null, approvalNo: null, supplyWon: null, vatWon: null, digits: null });
      continue;
    }
    if (k === "card") {
      const a = parseWon(get(row, c.amount) ?? get(row, c.total));
      if (a == null || a === 0) {
        skipped.push({ line, why: "금액을 읽지 못함" });
        continue;
      }
      const cancel = a < 0 || /취소/.test(str(row, c.status) ?? "");
      rows.push({ kind: cancel ? "card_cancel" : "card", on: dt.on, at, amountWon: Math.abs(a), balanceWon: null, party: str(row, c.party), partyBizNo: bizDigits(str(row, c.merchantBiz)) || null, memo, approvalNo, supplyWon: null, vatWon: null, digits: cardDigits });
      continue;
    }
    // 홈택스: 공급가액·세액·합계
    const supply = parseWon(get(row, c.supply));
    const vat = parseWon(get(row, c.vat));
    const total = parseWon(get(row, c.total) ?? get(row, c.amount)) ?? (supply != null ? supply + (vat ?? 0) : null);
    if (total == null || total === 0) {
      skipped.push({ line, why: "합계금액을 읽지 못함" });
      continue;
    }
    if (k === "tax") {
      const seller = bizDigits(str(row, c.sellerBiz));
      const buyer = bizDigits(str(row, c.buyerBiz));
      let tk: TxKind;
      if (shop && seller === shop) tk = "tax_sale";
      else if (shop && buyer === shop) tk = "tax_buy";
      else {
        skipped.push({ line, why: shop ? "공급자·공급받는자 어느 쪽도 우리 사업자번호가 아님" : "설정 › 사업장 정보에 사업자번호가 없어 매출·매입을 가를 수 없음" });
        continue;
      }
      const sale = tk === "tax_sale";
      rows.push({ kind: tk, on: dt.on, at: null, amountWon: Math.abs(total), balanceWon: null, party: str(row, sale ? c.buyerName : c.sellerName), partyBizNo: (sale ? buyer : seller) || null, memo: str(row, c.item), approvalNo, supplyWon: supply, vatWon: vat, digits: null });
      continue;
    }
    const cancel = total < 0 || /취소/.test(str(row, c.status) ?? "");
    if (cancel) {
      skipped.push({ line, why: "취소분(원래 줄과 함께 빼고 봄)" });
      continue;
    }
    rows.push({ kind: k, on: dt.on, at, amountWon: Math.abs(total), balanceWon: null, party: str(row, c.party), partyBizNo: bizDigits(str(row, c.merchantBiz)) || null, memo: str(row, c.item) ?? memo, approvalNo, supplyWon: supply, vatWon: vat, digits: cardDigits });
  }
  return { kind: k, rows, skipped, columns: Object.values(h.names), headDigits: [...new Set(headDigits)] };
}
