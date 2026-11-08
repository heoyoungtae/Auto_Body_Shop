// 재직증명서: 근로자 명부(입사일·종사 업무·생년월일·주소)와 정비소 정보·직인으로 찍는다. 발급일은 대표 승인일.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { certificateView } from "@/modules/staff/attendance";
import { getProfile } from "@/modules/staff/service";
import { eq } from "drizzle-orm";
import { appUser } from "@/db/schema";
import { SignMark } from "../../../repairs/sign-mark";
import { PrintButton } from "../../../repairs/[id]/estimate/[eid]/print/print-button";
import { requireUser, userMessage } from "../../../_lib/session";
import { buttonClass, ErrorBox, PageTitle } from "../../../_ui";

const cell = "border border-black px-2 py-2";
const head = `${cell} w-28 bg-neutral-100 text-center font-medium`;
const ko = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
};

export default async function CertificatePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  let v;
  try {
    v = await certificateView(db, user, id);
  } catch (e) {
    return (
      <>
        <PageTitle help="certificates.print">재직증명서</PageTitle>
        <ErrorBox message={userMessage(e)} />
      </>
    );
  }
  const owner = v.doc.drafterId!;
  const [[u], p, shop] = await Promise.all([db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, owner)), getProfile(db, { id: owner, roles: ["owner"] }, owner), loadShopInfo(db)]);
  const missing = !shop.name || !shop.ceo || !shop.sealPath;
  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="certificates.print"
          sub={`${v.doc.docNo} · ${v.data.copies}부 · 대표 승인 ${v.issuedOn}`}
          actions={
            <>
              <Link href="/certificates" className={buttonClass("secondary")}>
                목록으로
              </Link>
              <PrintButton />
            </>
          }
        >
          재직증명서 인쇄
        </PageTitle>
        {missing && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">정비소 설정에 상호·대표자·직인이 다 있어야 합니다. &lsquo;설정 → 정비소 정보&rsquo;에서 채우세요.</p>}
      </div>
      <article className="mx-auto max-w-[180mm] bg-white p-6 text-[13px] leading-relaxed text-black print:max-w-none print:p-0">
        <p className="text-[11px]">발급 번호 {v.doc.docNo}</p>
        <h1 className="my-8 text-center text-3xl font-bold tracking-[0.6em]">재직증명서</h1>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={head} rowSpan={2}>
                인적 사항
              </td>
              <td className={head}>성명</td>
              <td className={cell}>{u?.name}</td>
              <td className={head}>생년월일</td>
              <td className={cell}>{p?.birth ? ko(p.birth) : ""}</td>
            </tr>
            <tr>
              <td className={head}>주소</td>
              <td className={cell} colSpan={3}>
                {p?.address ? `${p.address}${p.addressDetail ? `, ${p.addressDetail}` : ""}` : ""}
              </td>
            </tr>
            <tr>
              <td className={head} rowSpan={3}>
                재직 사항
              </td>
              <td className={head}>회사명</td>
              <td className={cell}>{shop.name}</td>
              <td className={head}>사업자등록번호</td>
              <td className={cell}>{shop.bizNo}</td>
            </tr>
            <tr>
              <td className={head}>종사 업무</td>
              <td className={cell} colSpan={3}>
                {p?.job}
              </td>
            </tr>
            <tr>
              <td className={head}>재직 기간</td>
              <td className={cell} colSpan={3}>
                {p?.hiredOn ? `${ko(p.hiredOn)} ~ 현재(${ko(v.issuedOn)} 기준)` : ""}
              </td>
            </tr>
            <tr>
              <td className={head}>용도</td>
              <td className={cell} colSpan={4}>
                {v.data.purpose}
                {v.data.submitTo && ` (제출처: ${v.data.submitTo})`}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="my-12 text-center text-base">위 사람은 현재 당사에 재직하고 있음을 증명합니다.</p>
        <p className="text-center text-base">{ko(v.issuedOn)}</p>
        <div className="mt-12 space-y-1 text-right text-base">
          <p>주소: {shopAddressLine(shop)}</p>
          <p>상호: {shop.name}</p>
          <p>
            대표자: {shop.ceo} <SignMark path={shop.sealPath} kind="seal" />
          </p>
        </div>
      </article>
    </div>
  );
}
