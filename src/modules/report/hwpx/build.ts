// 보고서 한 장을 한글 문서(HWPX, 한글 2014 이후)로. 제목·기간·핵심 숫자 표·각 표·추이 그래프(그림)+값 표·안내를 담는다.
// 화면·PDF와 글꼴·간격이 조금 다를 수 있다(한글 기본 서식).
import { COMPARE } from "../period";
import { type RunResult } from "../run";
import { delta, fmtMetric } from "../service";
import { type Cell, totalRow } from "../kit";
import { barChartPng } from "./chart-png";
import { CONTAINER_RDF, CONTAINER_XML, HEADER_XML, HPF_OPEN, MANIFEST_XML, SECTION_OPEN, SETTINGS_XML, VERSION_XML } from "./template";
import { zip } from "./zip";

const PAGE_W = 42520; // A4 본문 폭(HWPUNIT, 150mm)
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let seq = 0;
const nid = () => String(1_000_000 + ++seq);

/** 문단 하나. cp = 글자 모양, pp = 문단 모양(0 양쪽, 20 오른쪽, 21 가운데) */
const para = (text: string, cp = 0, pp = 0) => `<hp:p id="${nid()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}">${text ? `<hp:t>${esc(text)}</hp:t>` : "<hp:t/>"}</hp:run></hp:p>`;

type TRow = { cells: string[]; head?: boolean; bold?: boolean };

/** 표: 첫 열은 넓게, 숫자 열(right)은 오른쪽 맞춤 */
function table(rows: TRow[], right: boolean[]) {
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const weights = Array.from({ length: cols }, (_, i) => (i === 0 && cols > 2 ? 2 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((PAGE_W * w) / wsum));
  widths[0] += PAGE_W - widths.reduce((a, b) => a + b, 0);
  const rowH = 1400;
  const trs = rows
    .map((r, ri) => {
      const tcs = Array.from({ length: cols }, (_, ci) => {
        const text = r.cells[ci] ?? "";
        const pp = !r.head && right[ci] ? 20 : r.head ? 21 : 0;
        const cp = r.head || r.bold ? 8 : 0;
        return `<hp:tc name="" header="${r.head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${r.head ? 4 : 3}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${para(text, cp, pp)}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[ci]}" height="${rowH}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
      }).join("");
      return `<hp:tr>${tcs}</hp:tr>`;
    })
    .join("");
  const id = nid();
  const tbl = `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${PAGE_W}" widthRelTo="ABSOLUTE" height="${rowH * rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${trs}</hp:tbl>`;
  return `<hp:p id="${nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p>`;
}

/** 그림(BinData 의 itemId 를 가리킴), 본문 폭에 맞춤 */
function picture(itemId: string, pxW: number, pxH: number) {
  const w = PAGE_W;
  const h = Math.round((PAGE_W * pxH) / pxW);
  const id = nid();
  const m = 'e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"';
  const pic = `<hp:pic id="${id}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix ${m}/><hc:scaMatrix ${m}/><hc:rotMatrix ${m}/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${itemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment/></hp:pic>`;
  return `<hp:p id="${nid()}" paraPrIDRef="21" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${pic}<hp:t/></hp:run></hp:p>`;
}

const num = (v: number, unit?: string) => (unit === "원" || unit === "건" || unit === "대" || !unit ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ko-KR");
const cellText = (v: Cell, unit?: string) => (typeof v === "number" ? num(v, unit) : (v ?? ""));

export function runHwpx(r: RunResult, meta: { family: string; printedOn: string; printedBy: string }): Buffer {
  seq = 0;
  const body: string[] = [];
  const images: { id: string; data: Buffer }[] = [];
  body.push(para(`${r.def.no}. ${r.def.title}`, 7));
  body.push(para(`${meta.family} · ${r.def.desc} · ${r.def.std}`, 9));
  body.push(para(`기간: ${r.p.label} (${r.p.from} ~ ${r.p.to}) · 비교: ${COMPARE[r.cmp]} ${r.q.label}`, 9));
  body.push(para(""));
  if (r.body.kpis.length) {
    const hasTarget = r.body.kpis.some((k) => k.target != null);
    body.push(para("핵심 숫자", 8));
    const head = ["항목", "이번 기간", COMPARE[r.cmp], "변화", ...(hasTarget ? ["목표"] : []), "비고"];
    const rows: TRow[] = [{ cells: head, head: true }];
    for (const k of r.body.kpis) {
      const d = delta(k);
      rows.push({
        cells: [k.label, fmtMetric(k.value, k.unit), k.now ? "지금 기준" : fmtMetric(k.prev, k.unit), d?.text ?? "", ...(hasTarget ? [k.target != null ? `${fmtMetric(k.target, k.unit)} ${k.better === "down" ? "이하" : "이상"}${k.ok === false ? " (미달)" : ""}` : ""] : []), k.note ?? ""],
      });
    }
    body.push(table(rows, [false, true, true, true, false, false]));
    body.push(para(""));
  }
  for (const t of r.body.tables) {
    body.push(para(`${t.title}${t.now ? " · 지금 기준" : ""}`, 8));
    if (!t.rows.length) body.push(para(t.empty ?? "자료가 없습니다."));
    else {
      const rows: TRow[] = [{ cells: t.cols.map((c) => (c.unit && !c.label.includes(c.unit) ? `${c.label}(${c.unit})` : c.label)), head: true }];
      for (const row of t.rows) rows.push({ cells: row.cells.map((v, i) => cellText(v, t.cols[i]?.unit)) });
      const tot = totalRow(t);
      if (tot) rows.push({ cells: tot.map((v, i) => cellText(v, t.cols[i]?.unit)), bold: true });
      body.push(table(rows, t.cols.map((c) => !!c.num)));
    }
    if (t.note) body.push(para(t.note, 9));
    body.push(para(""));
  }
  if (r.trend) {
    body.push(para(`추이 · 최근 ${r.trend.periods.length}개 기간`, 8));
    r.trend.series.forEach((s, i) => {
      const id = `BIN${String(i + 1).padStart(4, "0")}`;
      images.push({ id, data: barChartPng(s.values) });
      body.push(para(`${s.label} (이번 ${fmtMetric(s.values[s.values.length - 1], s.unit)}) · 진한 막대가 이번 기간`, 0));
      body.push(picture(id, 900, 240));
      body.push(table([{ cells: r.trend!.labels, head: true }, { cells: s.values.map((v) => num(v, s.unit)) }], r.trend!.labels.map(() => true)));
      body.push(para(""));
    });
  }
  for (const n of r.body.notes ?? []) body.push(para(n, 9));
  body.push(para(`출력: ${meta.printedOn} · ${meta.printedBy} · 통계·보고서 ${r.def.no}. ${r.def.title}`, 9));

  const section = `${SECTION_OPEN}${body.join("")}</hs:sec>`;
  const title = esc(`${r.def.title} ${r.p.label}`);
  const hpf = `${HPF_OPEN}<opf:metadata><opf:title>${title}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">${esc(meta.printedBy)}</opf:meta><opf:meta name="subject" content="text">통계·보고서</opf:meta><opf:meta name="description" content="text"/><opf:meta name="lastsaveby" content="text">${esc(meta.printedBy)}</opf:meta><opf:meta name="CreatedDate" content="text">${new Date().toISOString().slice(0, 19)}Z</opf:meta><opf:meta name="ModifiedDate" content="text">${new Date().toISOString().slice(0, 19)}Z</opf:meta><opf:meta name="date" content="text">${meta.printedOn}</opf:meta><opf:meta name="keyword" content="text"/></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>${images.map((im) => `<opf:item id="${im.id}" href="BinData/${im.id}.png" media-type="image/png" isEmbeded="1"/>`).join("")}<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  return zip([
    { name: "mimetype", data: "application/hwp+zip", store: true },
    { name: "version.xml", data: VERSION_XML },
    { name: "Contents/header.xml", data: HEADER_XML },
    { name: "Contents/section0.xml", data: section },
    { name: "Contents/content.hpf", data: hpf },
    ...images.map((im) => ({ name: `BinData/${im.id}.png`, data: im.data })),
    { name: "settings.xml", data: SETTINGS_XML },
    { name: "Preview/PrvText.txt", data: `${r.def.title} ${r.p.label}` },
    { name: "META-INF/container.xml", data: CONTAINER_XML },
    { name: "META-INF/container.rdf", data: CONTAINER_RDF },
    { name: "META-INF/manifest.xml", data: MANIFEST_XML },
  ]);
}
