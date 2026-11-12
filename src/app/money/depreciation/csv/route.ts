// 감가상각 대장 CSV(세무사에게 보냄). 화면과 같은 권한·같은 숫자
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { depreciationRegister } from "@/modules/asset/service";
import { DEP_METHODS } from "@/modules/asset/rules";
import { seoulDate } from "@/modules/platform/time";
import { currentUser } from "../../../_lib/session";

const cell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  if (!can(user, "expense.pay") && !can(user, "fixture.manage")) return new Response("감가상각 대장은 회계 담당·대표가 봅니다", { status: 403 });
  const y = new URL(req.url).searchParams.get("y") ?? "";
  const year = /^\d{4}$/.test(y) ? Number(y) : Number(seoulDate().slice(0, 4));
  const rows = await depreciationRegister(await getDb(), year);
  const lines = [
    ["번호", "구분", "품명", "상각 방법", "내용연수", "사용 시작", "취득가", `${year}년 상각비`, "상각 누계", "장부가"].join(","),
    ...rows.map((r) => [r.a.no, r.a.kind === "fixture" ? "비품" : "설비", r.a.name, DEP_METHODS[r.a.depMethod as keyof typeof DEP_METHODS] ?? r.a.depMethod, r.a.usefulYears ?? "", r.a.depStartOn ?? "", r.cost, r.thisYear, r.accum, r.book].map(cell).join(",")),
  ];
  const name = encodeURIComponent(`감가상각대장_${year}.csv`);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
    },
  });
}
