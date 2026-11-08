// 법정 서식 [별지 제89호의3 서식] 자동차점검ㆍ정비견적서(자동차관리법 시행규칙, 2023.6.9. 개정) 그대로 인쇄한다.
// 차량·사업자 칸은 발급할 때 고정한 값(snapshot)을 쓴다. 하단 안내 문구는 서식 원문이다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getEstimate } from "@/modules/repair/estimate";
import { totals } from "@/modules/repair/estimate-rules";
import { shopAddressLine, type ShopInfo } from "@/modules/platform/shop";
import { SignMark } from "../../../../sign-mark";
import { requireUser } from "../../../../../_lib/session";
import { buttonClass, PageTitle } from "../../../../../_ui";
import { PrintButton } from "./print-button";

type Snap = { owner: string; plateNo: string; carName: string; mileage: number | null; registeredOn: string | null; vin: string | null; shop: ShopInfo; writer: string | null; writerSign?: string | null };
const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "");
const cell = "border border-black px-1.5 py-1";
const head = `${cell} bg-neutral-100 text-center font-medium`;

const NOTES = [
  "1. 견적요금은 교통사고 등의 처리를 목적으로 견적서를 발행한 경우에 청구가 가능합니다.",
  "2. 본 견적서는 교부일로부터 1개월간 유효합니다.",
  "3. 본 견적서에 포함되지 아니한 부품을 추가 시에는 소비자의 동의를 받아야 하며, 정비의뢰자는 동의한 부품 및 작업부분만 금액을 지급합니다.",
  "4. 공급자의 직인이 없는 것은 무효로 합니다.",
  "5. 부품가는 견적일자 기준입니다.",
  "6. 본 견적서는 2부를 작성, 정비의뢰자에게 1부를 교부하고, 정비업자는 1부를 1년간 문서 또는 전산자료로 보관하여야 합니다.",
  "7. 부품내역란의 코드란은 다음 각 목에 따라 기재해야 합니다.",
  "  가. 자동차 제작사 및 부품업체가 공급하는 신품(자동차 제작사의 경우에는 사후관리용 보증부품을 포함합니다): A",
  "  나. 재제조품: B",
  "  다. 중고품(재생품을 포함합니다): C",
  "  라. 인증대체부품: D",
  "  마. 수입부품: F",
];

export default async function EstimatePrint({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id: roId, eid } = await params;
  await requireUser();
  const e = await getEstimate(await getDb(), eid);
  const s = e.snapshot as Partial<Snap>;
  const issued = !!e.issuedOn && !!s.shop;
  const t = totals(e.lines);
  const [y, m, d] = (e.issuedOn ?? "").split("-");
  const MIN_ROWS = 12;
  const blanks = Math.max(0, MIN_ROWS - e.lines.length);

  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="repairs.estimatePrint"
          sub="법정 서식 별지 제89호의3. 2부를 뽑아 직인을 찍고 1부를 고객에게 드립니다."
          actions={
            <>
              <Link href={`/repairs/${roId}/estimate/${eid}`} className={buttonClass("secondary")}>
                견적으로 돌아가기
              </Link>
              {issued && <PrintButton />}
            </>
          }
        >
          견적서 인쇄 {e.docNo}
        </PageTitle>
        {!issued && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 발급하지 않은 견적입니다. 검토를 마치고 &lsquo;법정 견적서 발급&rsquo;을 누른 뒤 인쇄하세요.</p>}
      </div>
      {issued && (
        <article className="mx-auto max-w-[190mm] bg-white p-4 text-[11px] leading-snug text-black print:max-w-none print:p-0">
          <p className="text-[10px]">■ 자동차관리법 시행규칙 [별지 제89호의3 서식] &lt;개정 2023. 6. 9.&gt;</p>
          <h1 className="my-2 text-center text-xl font-bold tracking-[0.3em]">자동차점검ㆍ정비견적서</h1>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={head} colSpan={2}>
                  일련번호
                </td>
                <td className={cell} colSpan={6}>
                  {e.docNo}
                  {e.rev > 1 ? ` (${e.rev}차)` : ""}
                </td>
              </tr>
              <tr>
                <td className={head} rowSpan={3}>
                  차량
                </td>
                <td className={head}>소유자</td>
                <td className={cell} colSpan={6}>
                  {s.owner}
                </td>
              </tr>
              <tr>
                <td className={head}>등록번호</td>
                <td className={cell} colSpan={2}>
                  {s.plateNo}
                </td>
                <td className={head}>차명(차종)</td>
                <td className={cell}>{s.carName}</td>
                <td className={head}>주행거리</td>
                <td className={`${cell} text-right`}>{s.mileage != null ? `${s.mileage.toLocaleString("ko-KR")} km` : "km"}</td>
              </tr>
              <tr>
                <td className={head}>등록년월일</td>
                <td className={cell} colSpan={2}>
                  {s.registeredOn}
                </td>
                <td className={head}>차대번호</td>
                <td className={cell} colSpan={3}>
                  {s.vin}
                </td>
              </tr>
              <tr>
                <td className={head} rowSpan={2}>
                  정비
                  <br />
                  사업자
                </td>
                <td className={head}>사업자등록번호</td>
                <td className={cell} colSpan={2}>
                  {s.shop!.bizNo}
                </td>
                <td className={head}>정비업 등록번호</td>
                <td className={cell} colSpan={3}>
                  {s.shop!.repairRegNo}
                </td>
              </tr>
              <tr>
                <td className={head}>업체명 및 대표자</td>
                <td className={cell} colSpan={2}>
                  {s.shop!.name} {s.shop!.ceo} <SignMark path={s.shop!.sealPath} kind="seal" />
                </td>
                <td className={head}>주소</td>
                <td className={cell} colSpan={3}>
                  {shopAddressLine(s.shop!)} (전화번호 {s.shop!.phone})
                </td>
              </tr>
              <tr>
                <td className={head} colSpan={2}>
                  견적구분
                </td>
                <td className={cell} colSpan={6}>
                  [{e.kind === "insurance" ? "√" : " "}] 보험 &nbsp; [{e.kind === "general" ? "√" : " "}] 일반
                </td>
              </tr>
            </tbody>
          </table>

          <p className="my-2 text-center font-medium">아래와 같이 견적합니다.</p>

          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head} rowSpan={2}>
                  구분
                  <br />
                  (보험ㆍ일반)
                </th>
                <th className={head} colSpan={5}>
                  부품내역
                </th>
                <th className={head} rowSpan={2}>
                  공임
                </th>
                <th className={head} rowSpan={2}>
                  합계
                </th>
              </tr>
              <tr>
                <th className={head}>작업내용ㆍ부품명</th>
                <th className={head}>코드</th>
                <th className={head}>수량</th>
                <th className={head}>단가</th>
                <th className={head}>계</th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l) => (
                <tr key={l.id}>
                  <td className={`${cell} text-center`}>{l.payer === "insurance" ? "보험" : "일반"}</td>
                  <td className={cell}>
                    {l.name}
                    {l.partNo ? ` (${l.partNo})` : ""}
                  </td>
                  <td className={`${cell} text-center`}>{l.partCode}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? l.qty : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? won(l.unitWon) : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? won(l.qty * l.unitWon) : ""}</td>
                  <td className={`${cell} text-right`}>{l.category === "part" ? "" : won(l.laborWon)}</td>
                  <td className={`${cell} text-right`}>{won(l.qty * l.unitWon + l.laborWon)}</td>
                </tr>
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <tr key={`b${i}`}>
                  {Array.from({ length: 8 }, (_, j) => (
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
                <td className={head}>계</td>
                <td className={head}>부가가치세</td>
                <td className={head}>총액</td>
              </tr>
              <tr>
                <td className={`${cell} text-right`}>{t.parts.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{t.labor.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{t.sum.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right`}>{t.vat.toLocaleString("ko-KR")}</td>
                <td className={`${cell} text-right font-bold`}>{t.total.toLocaleString("ko-KR")}</td>
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
            대표이사 {s.shop!.ceo} <SignMark path={s.shop!.sealPath} kind="seal" />
          </p>

          <div className="mt-3 border-t border-black pt-2 text-[10px] whitespace-pre-wrap">
            {NOTES.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          {e.validUntil && <p className="mt-2 text-[10px] text-neutral-600">유효기간: {e.validUntil}까지 · 예상 출고일 {e.dueDate ?? "—"} · 추가 작업은 사전 승인 후 진행합니다(사내 표준서 STD-03 5절).</p>}
        </article>
      )}
    </div>
  );
}
