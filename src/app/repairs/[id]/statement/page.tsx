// 법정 서식 [별지 제89호의2서식] 자동차점검ㆍ정비명세서(자동차관리법 시행규칙, 2025.2.14. 개정)를 인쇄한다.
// 차량·사업자·정비 내역은 발급할 때 고정한 값(snapshot)을 쓴다. 하단 안내는 서식의 안내 사항이다.
// [확인 필요] 표 배치는 서식 원문 글자에서 되살린 것이다. 실제 서식 PDF와 한 번 맞춰 본다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { statementOf } from "@/modules/repair/inspect";
import { shopAddressLine, type ShopInfo } from "@/modules/platform/shop";
import { SignMark } from "../../sign-mark";
import { requireUser } from "../../../_lib/session";
import { buttonClass, PageTitle } from "../../../_ui";
import { PrintButton } from "../estimate/[eid]/print/print-button";

type Line = { payer: string; category: string; name: string; partCode: string | null; partNo: string | null; qty: number; unitWon: number; laborWon: number };
type Snap = { owner: string; plateNo: string; carName: string; mileage: number | null; registeredOn: string | null; requestedOn: string; completedOn: string; shop: ShopInfo; writer: string | null; writerSign?: string | null; estimateNo: string; lines: Line[]; warranty: { kind: string; until: string }[]; legalFreeDays: number; noWashDays: number };
const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "");
const cell = "border border-black px-1.5 py-1";
const head = `${cell} bg-neutral-100 text-center font-medium`;

const NOTES = [
  "1. 점검ㆍ정비 잘못으로 생긴 고장에 대하여는 점검ㆍ정비일부터 다음 기간 안에 무상으로 점검ㆍ정비합니다: 차령 1년 미만 또는 주행거리 2만킬로미터 이내 90일, 차령 3년 미만 또는 주행거리 6만킬로미터 이내 60일, 차령 3년 이상 또는 주행거리 6만킬로미터 이상 30일.",
  "2. 본 명세서는 2부를 작성하여 정비의뢰자에게 1부를 교부하고, 정비업자는 1부를 1년간 보관하여야 합니다.",
  "3. 부품란의 구분란에는 신품(A), 재제조품(B), 중고품(재생품 포함)(C), 인증대체부품(D), 수입부품(F)을 구분하여 기재합니다.",
  "4. 구동축전지를 교체한 경우에는 작업내용란에 부품명과 식별번호를 기재합니다.",
];

export default async function StatementPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const st = await statementOf(await getDb(), id);
  const s = (st?.snapshot ?? null) as Snap | null;
  const MIN_ROWS = 12;
  const [y, m, d] = (st?.issuedOn ?? "").split("-");

  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="repairs.statement"
          sub="법정 서식 별지 제89호의2. 2부를 뽑아 직인을 찍고 1부를 고객에게 드립니다. 1부는 1년 이상 보관합니다."
          actions={
            <>
              <Link href={`/repairs/${id}/delivery`} className={buttonClass("secondary")}>
                출고로 돌아가기
              </Link>
              {s && <PrintButton />}
            </>
          }
        >
          정비명세서 인쇄 {st?.docNo ?? ""}
        </PageTitle>
        {!s && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 발급하지 않았습니다. 출고 화면에서 &lsquo;정비명세서 발급&rsquo;을 누르세요.</p>}
      </div>
      {st && s && (
        <article className="mx-auto max-w-[190mm] bg-white p-4 text-[11px] leading-snug text-black print:max-w-none print:p-0">
          <p className="text-[10px]">■ 자동차관리법 시행규칙 [별지 제89호의2서식] &lt;개정 2025. 2. 14.&gt;</p>
          <h1 className="my-2 text-center text-xl font-bold tracking-[0.3em]">자동차점검ㆍ정비명세서</h1>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={head} rowSpan={3}>
                  차량
                </td>
                <td className={head}>소유자</td>
                <td className={cell} colSpan={2}>
                  {s.owner}
                </td>
                <td className={head}>등록번호</td>
                <td className={cell}>{s.plateNo}</td>
              </tr>
              <tr>
                <td className={head}>차명(차종)</td>
                <td className={cell} colSpan={2}>
                  {s.carName}
                </td>
                <td className={head}>주행거리</td>
                <td className={`${cell} text-right`}>{s.mileage != null ? `${s.mileage.toLocaleString("ko-KR")} km` : "km"}</td>
              </tr>
              <tr>
                <td className={head}>등록연월일</td>
                <td className={cell} colSpan={4}>
                  {s.registeredOn}
                </td>
              </tr>
              <tr>
                <td className={head} colSpan={2}>
                  점검ㆍ정비 의뢰일자
                </td>
                <td className={cell}>{s.requestedOn}</td>
                <td className={head}>완료일자 · 출고일자</td>
                <td className={cell} colSpan={2}>
                  {s.completedOn} · {st.deliveredAt ? st.deliveredAt.toISOString().slice(0, 10) : ""}
                </td>
              </tr>
              <tr>
                <td className={head} rowSpan={2}>
                  정비
                  <br />
                  사업자
                </td>
                <td className={head}>사업자등록번호</td>
                <td className={cell}>{s.shop.bizNo}</td>
                <td className={head}>정비업 등록번호</td>
                <td className={cell} colSpan={2}>
                  {s.shop.repairRegNo}
                </td>
              </tr>
              <tr>
                <td className={head}>업체명 · 대표자</td>
                <td className={cell}>
                  {s.shop.name} · {s.shop.ceo}
                </td>
                <td className={head}>주소 · 전화번호</td>
                <td className={cell} colSpan={2}>
                  {shopAddressLine(s.shop)} · {s.shop.phone}
                </td>
              </tr>
              <tr>
                <td className={head} colSpan={2}>
                  정비책임자
                </td>
                <td className={cell}>
                  {s.writer ?? ""} <SignMark path={s.writerSign} />
                </td>
                <td className={head}>추가정비 동의 여부</td>
                <td className={cell} colSpan={2}>
                  [ ] 동의 &nbsp; [√] 부동의(추가 정비 없음 — 승인 견적 {s.estimateNo} 범위)
                </td>
              </tr>
            </tbody>
          </table>

          <p className="my-2 text-center font-medium">점검ㆍ정비 내역</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head} rowSpan={2}>
                  작업내용
                </th>
                <th className={head} colSpan={4}>
                  부품
                </th>
                <th className={head} rowSpan={2}>
                  공임
                </th>
              </tr>
              <tr>
                <th className={head}>구분</th>
                <th className={head}>수량</th>
                <th className={head}>단가</th>
                <th className={head}>계</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i}>
                  <td className={cell}>
                    {l.name}
                    {l.partNo ? ` (${l.partNo})` : ""}
                  </td>
                  <td className={`${cell} text-center`}>{l.partCode}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? l.qty : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? won(l.unitWon) : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? won(l.qty * l.unitWon) : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? "" : won(l.laborWon)}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, MIN_ROWS - s.lines.length) }, (_, i) => (
                <tr key={`b${i}`}>
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j} className={`${cell} h-5`} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-2 w-full border-collapse">
            <tbody>
              <tr>
                <td className={head}>부품</td>
                <td className={head}>공임</td>
                <td className={head}>소계</td>
                <td className={head}>부가가치세</td>
                <td className={head}>총계</td>
              </tr>
              <tr>
                <td className={`${cell} text-right`}>{st.partsWon.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{st.laborWon.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{(st.partsWon + st.laborWon).toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{st.vatWon.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right font-bold`}>{st.totalWon.toLocaleString("ko-KR")}</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-center">「자동차관리법」 제58조제5항 및 같은 법 시행규칙 제134조제2항에 따라 위와 같이 발급합니다.</p>
          <p className="mt-2 text-right">
            {y}년 {Number(m)}월 {Number(d)}일
          </p>
          <p className="mt-2 text-right">
            작성자 {s.writer ?? ""} <SignMark path={s.writerSign} />
          </p>
          <p className="mt-1 text-right">
            대표이사 {s.shop.ceo} <SignMark path={s.shop.sealPath} kind="seal" />
          </p>
          <div className="mt-3 border-t border-black pt-2 text-[10px]">
            {NOTES.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">
            명세서 {st.docNo} · 사내 보증: {s.warranty.map((w) => `${w.kind} ${w.until}까지`).join(", ") || "—"} · 도장 후 {s.noWashDays}일 동안 세차·왁스 금지 · 이 차의 법정 무상 점검·정비 기간 {s.legalFreeDays}일
          </p>
        </article>
      )}
    </div>
  );
}
