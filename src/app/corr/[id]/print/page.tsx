// 회사 공문 인쇄(F-Q-12): 행정 공문 배치를 따른다 — 머리(로고·상호), 수신·참조·제목, 본문, 붙임·끝., 발신 명의와 직인,
// 아래 칸(기안자·결재권자, 시행 문서번호·날짜, 주소·전화). 직인은 대표 승인 뒤에만 찍히고, 결재 중에는 '미리 보기' 표시가 붙는다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadBrand, brandUrl } from "@/modules/platform/brand-assets";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { seoulDate } from "@/modules/platform/time";
import { getCorr } from "@/modules/quality/corr";
import { enclosureList, endMark } from "@/modules/quality/corr-rules";
import type { ResolvedStep } from "@/modules/approval/types";
import { inArray } from "drizzle-orm";
import { appUser } from "@/db/schema";
import { PrintButton } from "../../../repairs/[id]/estimate/[eid]/print/print-button";
import { requireUser, userMessage } from "../../../_lib/session";
import { buttonClass, ErrorBox, PageTitle } from "../../../_ui";

const dot = (iso: string) => iso.replaceAll("-", ". ") + ".";

export default async function LetterPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  let g: Awaited<ReturnType<typeof getCorr>>;
  try {
    g = await getCorr(db, user, id);
    if (g.r.dir !== "out") throw new Error("보낸 공문만 인쇄합니다");
  } catch (e) {
    return (
      <>
        <PageTitle help="corr.print">공문 인쇄</PageTitle>
        <ErrorBox message={userMessage(e)} />
      </>
    );
  }
  const { r, approval, replyTo } = g;
  const [shop, brand] = await Promise.all([loadShopInfo(db), loadBrand(db)]);
  const approved = r.status === "approved" || r.status === "sent";
  const steps = (approval?.steps ?? []) as ResolvedStep[];
  const signer = steps.filter((s) => s.kind === "approve").flatMap((s) => s.doneBy)[0] ?? null;
  const ids = [r.createdBy, signer].filter((x): x is string => !!x);
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  const nm = (u: string | null) => users.find((x) => x.id === u)?.name ?? "";
  const on = r.sentOn ?? (approval?.confirmedAt ? seoulDate(approval.confirmedAt) : seoulDate());
  const { body, enclosures } = endMark(r.body ?? "", enclosureList(r.enclosures));
  const missing = !shop.name || !shop.ceo || !shop.sealPath;
  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="corr.print"
          sub={`${r.no} · ${approved ? "대표 승인됨: 인쇄하거나 'PDF로 저장'해 보냅니다" : "결재 중: 직인 없이 미리 봅니다"}`}
          actions={
            <>
              <Link href={`/corr/${r.id}`} className={buttonClass("secondary")}>
                돌아가기
              </Link>
              <PrintButton />
            </>
          }
        >
          공문 {approved ? "인쇄" : "미리 보기"}
        </PageTitle>
        {missing && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">공업사 정보에 상호·대표자·직인이 다 있어야 합니다. &lsquo;설정 › 공업사 정보&rsquo;에서 채우세요.</p>}
      </div>
      <article className="relative mx-auto flex min-h-[260mm] max-w-[180mm] flex-col bg-white p-8 text-[14px] leading-relaxed text-black print:max-w-none print:p-0">
        {!approved && <p className="absolute top-2 right-2 rounded border border-red-600 px-2 py-0.5 text-xs font-bold text-red-600">미리 보기(결재 중)</p>}
        <header className="mb-6 border-b-2 border-black pb-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brandUrl(brand, "logo-light")} alt="" className="mx-auto mb-1 h-12 w-auto object-contain" />
          <p className="text-2xl font-bold tracking-widest">{shop.name || "(상호)"}</p>
        </header>
        <table className="mb-4 w-full">
          <tbody>
            <tr>
              <th className="w-16 py-1 text-left align-top font-bold">수신</th>
              <td className="py-1">
                {r.party}
                {r.cc ? ` (참조: ${r.cc})` : ""}
                {r.partyAddr && <span className="block text-[12px] text-neutral-600">{r.partyAddr}</span>}
              </td>
            </tr>
            <tr>
              <th className="py-1 text-left align-top font-bold">(경유)</th>
              <td className="py-1" />
            </tr>
            <tr>
              <th className="py-1 text-left align-top font-bold">제목</th>
              <td className="py-1 font-bold">{r.title}</td>
            </tr>
          </tbody>
        </table>
        <hr className="mb-4 border-black" />
        <div className="whitespace-pre-wrap">{body}</div>
        {enclosures.length > 0 && (
          <table className="mt-6">
            <tbody>
              {enclosures.map((e, i) => (
                <tr key={i}>
                  <th className="w-14 pr-2 text-left align-top font-normal">{i === 0 ? "붙임" : ""}</th>
                  <td>{enclosures.length > 1 ? `${i + 1}. ${e}` : e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {replyTo?.theirNo && <p className="mt-2 text-[12px] text-neutral-600">관련: {replyTo.party} {replyTo.theirNo}</p>}
        <div className="mt-16 mb-10 text-center text-2xl font-bold tracking-wider">
          <span className="relative inline-block pr-6">
            {shop.name} 대표 {shop.ceo}
            {approved && shop.sealPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${shop.sealPath}`} alt="직인" className="pointer-events-none absolute top-1/2 right-0 h-16 w-16 -translate-y-1/2 object-contain mix-blend-multiply" />
            )}
          </span>
        </div>
        <footer className="mt-auto border-t-2 border-black pt-2 text-[12px]">
          <p>
            기안 {nm(r.createdBy)}
            {signer ? `  ·  결재 대표 ${nm(signer)}` : "  ·  결재 대표 (승인 전)"}
          </p>
          <p>
            시행 {r.no} ({dot(on)}){"  "}접수 {replyTo ? `${replyTo.no} (${replyTo.receivedOn ? dot(replyTo.receivedOn) : ""})` : ""}
          </p>
          <p>{shopAddressLine(shop)}</p>
          <p>
            전화 {shop.phone}
            {shop.bizNo ? `  ·  사업자등록번호 ${shop.bizNo}` : ""}
          </p>
        </footer>
      </article>
    </div>
  );
}
