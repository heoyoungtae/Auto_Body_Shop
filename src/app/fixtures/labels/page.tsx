import Link from "next/link";
import QRCode from "qrcode";
import { getDb } from "@/db/runtime";
import { appUrl } from "@/modules/customer/service";
import { listFixtures } from "@/modules/purchase/fixture";
import { loadShopInfo } from "@/modules/platform/shop";
import { listUsers } from "@/modules/auth/service";
import { requireUser } from "../../_lib/session";
import { PageTitle } from "../../_ui";
import { PrintButton } from "./print-button";

/** 비품 라벨(관리 번호·QR) 인쇄. ?ids= 로 고르거나, 없으면 라벨 안 붙인 비품 전부. QR을 찍으면 그 비품 화면이 열린다 */
export default async function FixtureLabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [all, shop, users] = await Promise.all([listFixtures(db, user, "active"), loadShopInfo(db), listUsers(db)]);
  const nm = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "-") : "-");
  const pick = q.ids ? new Set(q.ids.split(",")) : null;
  const rows = all.filter(({ f }) => f.status !== "pending" && (pick ? pick.has(f.id) : !f.labeledAt));
  const labels = await Promise.all(rows.map(async ({ f }) => ({ f, svg: await QRCode.toString(`${appUrl()}/fixtures/${f.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) })));
  return (
    <>
      <div className="print:hidden">
        <PageTitle
          help="fixtures.labels"
          sub={`${labels.length}장. 라벨 용지(가로 6cm)에 인쇄해 비품에 붙이고, 비품 화면에서 '라벨 붙였음'을 누릅니다.`}
          actions={
            <div className="flex items-center gap-3">
              <PrintButton />
              <Link href="/fixtures" className="text-sm text-[var(--accent)]">
                ← 비품·자산
              </Link>
            </div>
          }
        >
          비품 라벨
        </PageTitle>
      </div>
      {labels.length ? (
        <div className="flex flex-wrap gap-2">
          {labels.map(({ f, svg }) => (
            <div key={f.id} className="flex w-[6cm] items-center gap-2 border border-black bg-white p-2 text-black" style={{ breakInside: "avoid" }}>
              <div className="size-[2cm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 text-xs leading-tight">
                <p className="font-mono text-base font-bold">{f.no}</p>
                <p className="truncate">{f.name}</p>
                {(f.managerId || f.subManagerId) && (
                  <p className="text-[10px]">
                    정 {nm(f.managerId)} · 부 {nm(f.subManagerId)}
                  </p>
                )}
                <p className="text-[10px]">{shop.name || "정비소"} 비품</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">인쇄할 라벨이 없습니다(라벨 안 붙인 비품이 없음).</p>
      )}
    </>
  );
}
