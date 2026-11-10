import Link from "next/link";
import QRCode from "qrcode";
import { getDb } from "@/db/runtime";
import { appUrl } from "@/modules/customer/service";
import { listTools } from "@/modules/equipment/tools";
import { loadShopInfo } from "@/modules/platform/shop";
import { PrintButton } from "../../fixtures/labels/print-button";
import { requireUser } from "../../_lib/session";
import { PageTitle } from "../../_ui";

/** 치공구 라벨(관리 번호·QR). ?ids= 로 고르거나, 없으면 라벨 안 붙인 것 전부. QR을 찍으면 그 치공구 화면(반출·반납)이 열린다 */
export default async function ToolLabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [{ list }, shop] = await Promise.all([listTools(db, user, "active"), loadShopInfo(db)]);
  const pick = q.ids ? new Set(q.ids.split(",")) : null;
  const rows = list.filter((t) => (pick ? pick.has(t.id) : !t.labeledAt));
  const labels = await Promise.all(rows.map(async (t) => ({ t, svg: await QRCode.toString(`${appUrl()}/tools/${t.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) })));
  return (
    <>
      <div className="print:hidden">
        <PageTitle
          help="tools.labels"
          sub={`${labels.length}장. 라벨 용지(가로 6cm)에 인쇄해 치공구에 붙이고, 치공구 화면에서 '라벨 붙였음'을 누릅니다. QR을 휴대폰으로 찍으면 반출·반납 화면이 바로 열립니다.`}
          actions={
            <div className="flex items-center gap-3">
              <PrintButton />
              <Link href="/tools" className="text-sm text-[var(--accent)]">
                ← 치공구
              </Link>
            </div>
          }
        >
          치공구 라벨
        </PageTitle>
      </div>
      {labels.length ? (
        <div className="flex flex-wrap gap-2">
          {labels.map(({ t, svg }) => (
            <div key={t.id} className="flex w-[6cm] items-center gap-2 border border-black bg-white p-2 text-black" style={{ breakInside: "avoid" }}>
              <div className="size-[2cm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 text-xs leading-tight">
                <p className="font-mono text-base font-bold">{t.no}</p>
                <p className="truncate">{t.name}</p>
                <p className="text-[10px]">{shop.name || "정비소"} 치공구{t.special ? " · 반출 기록" : ""}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">인쇄할 라벨이 없습니다(라벨 안 붙인 치공구가 없음).</p>
      )}
    </>
  );
}
