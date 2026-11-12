// 급여 이체 파일(CSV). 은행 인터넷뱅킹 '대량 이체'에 올린다.
// 은행마다 양식이 조금씩 달라, 칸은 대부분 은행이 받는 기본 순서(은행·계좌·금액·예금주·받는 분 표시·내 통장 표시)로 둔다.
// 사업용 계좌 은행(설정 › 사업장 정보)을 파일 이름에 붙인다.
import { getDb } from "@/db/runtime";
import { loadTaxProfile } from "@/modules/money/tax-profile";
import { loadShopInfo } from "@/modules/platform/shop";
import { payrollTransfer } from "@/modules/staff/payroll";
import { currentUser, userMessage } from "../../../_lib/session";

const cell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ym: string }> },
) {
  const user = await currentUser();
  if (!user || user.mustChangePassword)
    return new Response("로그인이 필요합니다", { status: 401 });
  const { ym } = await params;
  const db = await getDb();
  let data;
  try {
    data = await payrollTransfer(db, user, ym);
  } catch (e) {
    return new Response(userMessage(e), { status: 403 });
  }
  const tax = await loadTaxProfile(db);
  const shop = await loadShopInfo(db);
  const m = Number(ym.slice(5));
  const shopName = (shop.name || "급여").slice(0, 7);
  const lines = [
    ["입금 은행", "입금 계좌번호", "이체 금액", "예금주", "받는 분 통장 표시", "내 통장 표시", "직원"].join(","),
    ...data.lines.map((l) =>
      [l.bank, l.account, l.amount, l.holder, `${shopName}${m}월급여`, `${m}월급여 ${l.name}`, l.name]
        .map(cell)
        .join(","),
    ),
  ];
  const name = encodeURIComponent(`급여이체_${ym}_${tax.bankName || "은행미정"}.csv`);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
    },
  });
}
