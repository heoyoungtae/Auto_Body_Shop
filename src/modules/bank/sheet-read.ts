// 엑셀·CSV 파일을 표(줄 × 칸)로 읽기(순수 함수, 외부 라이브러리 없이).
// 은행·카드사·홈택스가 주는 파일은 네 가지다: .xlsx(압축 XML) · .xls(옛 엑셀 이진 BIFF8) · 'xls' 이름의 HTML 표 · CSV(UTF-8 또는 EUC-KR).
import { inflateRawSync } from "node:zlib";

export type Cell = string | number | null;
export type Grid = Cell[][];

export class SheetError extends Error {}

export function readSheet(bytes: Uint8Array, fileName = ""): Grid {
  if (bytes.length < 4) throw new SheetError("빈 파일입니다");
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b[0] === 0x50 && b[1] === 0x4b) return readXlsx(b);
  if (b.readUInt32LE(0) === 0xe011cfd0 && b.readUInt32LE(4) === 0xe11ab1a1) return readXls(b);
  const text = decodeText(b);
  if (/<\s*(table|html|tr)\b/i.test(text.slice(0, 20000))) return readHtmlTable(text);
  if (/\.pdf$/i.test(fileName) || text.startsWith("%PDF")) throw new SheetError("PDF 는 읽지 못합니다. 엑셀(xlsx·xls)이나 CSV 로 내려받아 주세요");
  return readCsv(text);
}

/** UTF-8 이 아니면 EUC-KR(CP949)로 읽는다(한국 은행 CSV 는 대부분 EUC-KR) */
export function decodeText(b: Buffer): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString("utf8");
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(b);
    const head = s.slice(0, 4000);
    const m = /charset\s*=\s*["']?(euc-kr|ks_c_5601-1987|cp949)/i.exec(head);
    if (!m) return s;
  } catch {
    /* EUC-KR 로 */
  }
  return new TextDecoder("euc-kr").decode(b);
}

// ── CSV ──
export function readCsv(text: string): Grid {
  const lines = text.replace(/\r\n?/g, "\n");
  const sample = lines.slice(0, 5000);
  const delim = (sample.match(/\t/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: Grid = [];
  let row: Cell[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    if (q) {
      if (c === '"') {
        if (lines[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => (typeof x === "string" ? x.trim().replace(/^="(.*)"$/, "$1") : x)));
}

// ── HTML 표(은행이 .xls 이름으로 주는 것) ──
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });

export function readHtmlTable(html: string): Grid {
  const rows: Grid = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells: Cell[] = [];
    for (const m of tr.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const txt = decodeEntities(m[3].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      cells.push(txt);
      const span = /colspan\s*=\s*["']?(\d+)/i.exec(m[2]);
      for (let k = 1; k < Math.min(Number(span?.[1] ?? 1), 30); k++) cells.push("");
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) throw new SheetError("파일 안에서 표를 찾지 못했습니다");
  return rows;
}

// ── XLSX(zip) ──
function unzip(b: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new SheetError("엑셀 파일이 깨졌습니다(zip 끝을 찾지 못함)");
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/i.test(name)) continue;
    const lNameLen = b.readUInt16LE(local + 26);
    const lExtra = b.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtra;
    const data = b.subarray(start, start + csize);
    out.set(name.toLowerCase(), method === 0 ? Buffer.from(data) : inflateRawSync(data));
  }
  return out;
}

const xmlText = (s: string) => decodeEntities(s.replace(/<rPh[\s\S]*?<\/rPh>/g, "").replace(/<[^>]+>/g, ""));
const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(b: Buffer): Grid {
  const files = unzip(b);
  const shared = (files.get("xl/sharedstrings.xml")?.toString("utf8") ?? "").match(/<si>[\s\S]*?<\/si>/g)?.map((si) => xmlText((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).join(""))) ?? [];
  // 첫 시트: workbook.xml 의 첫 sheet → rels 의 대상 파일
  let sheetPath = "";
  const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb)?.[1];
  if (rid) {
    const t = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
    if (t) sheetPath = `xl/${t.replace(/^\/?xl\//, "").replace(/^\//, "")}`.toLowerCase();
  }
  if (!files.has(sheetPath)) sheetPath = [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0] ?? "";
  const xml = files.get(sheetPath)?.toString("utf8");
  if (!xml) throw new SheetError("엑셀 파일에서 시트를 찾지 못했습니다");
  const grid: Grid = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? grid.length + 1) - 1;
    const row: Cell[] = [];
    let auto = 0;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const c = ref ? colIndex(ref) : auto;
      auto = c + 1;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val: Cell = null;
      if (t === "s" && v != null) val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = xmlText((inner.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).join(""));
      else if (t === "str" || t === "e") val = v != null ? decodeEntities(v) : null;
      else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
      else if (v != null) val = Number(v);
      row[c] = val;
    }
    grid[r] = Array.from(row, (x) => x ?? null);
  }
  return Array.from(grid, (r) => r ?? []);
}

// ── XLS(BIFF8, 복합 문서) ──
export function readXls(b: Buffer): Grid {
  const ss = 1 << b.readUInt16LE(30);
  const mss = 1 << b.readUInt16LE(32);
  const nFat = b.readUInt32LE(44);
  const dirStart = b.readUInt32LE(48);
  const cutoff = b.readUInt32LE(56);
  const miniFatStart = b.readUInt32LE(60);
  let difatNext = b.readUInt32LE(68);
  const sec = (n: number) => b.subarray((n + 1) * ss, (n + 2) * ss);
  const END = 0xfffffffe;
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < nFat; i++) fatSectors.push(b.readUInt32LE(76 + i * 4));
  for (let guard = 0; difatNext !== END && difatNext < 0xfffffff0 && fatSectors.length < nFat && guard < 1000; guard++) {
    const d = sec(difatNext);
    for (let i = 0; i < ss / 4 - 1 && fatSectors.length < nFat; i++) fatSectors.push(d.readUInt32LE(i * 4));
    difatNext = d.readUInt32LE(ss - 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const d = sec(s);
    for (let i = 0; i < ss / 4; i++) fat.push(d.readUInt32LE(i * 4));
  }
  const chain = (start: number, next: number[], max: number) => {
    const out: number[] = [];
    for (let s = start; s !== END && s < 0xfffffff0 && out.length < max; s = next[s] ?? END) out.push(s);
    return out;
  };
  const readChain = (start: number) => Buffer.concat(chain(start, fat, fat.length).map(sec));
  const dir = readChain(dirStart);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dir.readUInt16LE(o + 64);
    entries.push({ name: dir.subarray(o, o + Math.max(0, len - 2)).toString("utf16le"), type: dir[o + 66], start: dir.readUInt32LE(o + 116), size: dir.readUInt32LE(o + 120) });
  }
  const wbE = entries.find((e) => e.type === 2 && /^(workbook|book)$/i.test(e.name));
  if (!wbE) throw new SheetError("옛 엑셀(xls) 안에서 통합 문서를 찾지 못했습니다. 엑셀에서 열어 '다른 이름으로 저장 → Excel 통합 문서(xlsx)'로 바꿔 올려 주세요");
  let stream: Buffer;
  if (wbE.size < cutoff) {
    const root = entries.find((e) => e.type === 5)!;
    const ministream = readChain(root.start);
    const mfat: number[] = [];
    const mf = readChain(miniFatStart);
    for (let i = 0; i + 4 <= mf.length; i += 4) mfat.push(mf.readUInt32LE(i));
    stream = Buffer.concat(chain(wbE.start, mfat, mfat.length).map((s) => ministream.subarray(s * mss, (s + 1) * mss)));
  } else stream = readChain(wbE.start);
  return parseBiff(stream.subarray(0, wbE.size));
}

function parseBiff(s: Buffer): Grid {
  const grid: Grid = [];
  const put = (r: number, c: number, v: Cell) => {
    (grid[r] ??= [])[c] = v;
  };
  let sst: string[] = [];
  let bofs = 0;
  let inSheet = false;
  let pendingFormula: [number, number] | null = null;
  const rk = (v: number) => {
    let n: number;
    if (v & 2) n = v >> 2;
    else {
      const buf = Buffer.alloc(8);
      buf.writeUInt32LE(0, 0);
      buf.writeUInt32LE(v & 0xfffffffc, 4);
      n = buf.readDoubleLE(0);
    }
    return v & 1 ? n / 100 : n;
  };
  const uniStr = (d: Buffer, o: number, cchBytes: 1 | 2) => {
    const cch = cchBytes === 2 ? d.readUInt16LE(o) : d[o];
    const flags = d[o + cchBytes];
    const p = o + cchBytes + 1;
    return flags & 1 ? d.subarray(p, p + cch * 2).toString("utf16le") : d.subarray(p, p + cch).toString("latin1");
  };
  let o = 0;
  while (o + 4 <= s.length) {
    const type = s.readUInt16LE(o);
    const len = s.readUInt16LE(o + 2);
    const d = s.subarray(o + 4, o + 4 + len);
    o += 4 + len;
    if (type === 0x0809) {
      bofs++;
      if (bofs === 2) inSheet = true;
      continue;
    }
    if (type === 0x000a && inSheet) break;
    if (type === 0x00fc) {
      // SST + 뒤따르는 CONTINUE 를 이어 붙이고, 이어진 자리를 기억한다(글자 중간에 끊기면 새 flags 바이트가 온다)
      const parts = [d];
      let q = o;
      while (q + 4 <= s.length && s.readUInt16LE(q) === 0x003c) {
        const l = s.readUInt16LE(q + 2);
        parts.push(s.subarray(q + 4, q + 4 + l));
        q += 4 + l;
      }
      o = q;
      sst = readSst(parts);
      continue;
    }
    if (!inSheet) continue;
    if (type === 0x00fd && len >= 10) put(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? "");
    else if (type === 0x0203 && len >= 14) put(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
    else if (type === 0x027e && len >= 10) put(d.readUInt16LE(0), d.readUInt16LE(2), rk(d.readInt32LE(6)));
    else if (type === 0x00bd && len >= 6) {
      const r = d.readUInt16LE(0);
      const c0 = d.readUInt16LE(2);
      const n = (len - 6) / 6;
      for (let i = 0; i < n; i++) put(r, c0 + i, rk(d.readInt32LE(4 + i * 6 + 2)));
    } else if (type === 0x0204 && len >= 8) put(d.readUInt16LE(0), d.readUInt16LE(2), uniStr(d, 6, 2));
    else if (type === 0x0006 && len >= 14) {
      const r = d.readUInt16LE(0);
      const c = d.readUInt16LE(2);
      if (d.readUInt16LE(12) === 0xffff) {
        if (d[6] === 0) pendingFormula = [r, c];
        else if (d[6] === 1) put(r, c, d[8] ? "TRUE" : "FALSE");
      } else put(r, c, d.readDoubleLE(6));
    } else if (type === 0x0207 && pendingFormula) {
      put(pendingFormula[0], pendingFormula[1], uniStr(d, 0, 2));
      pendingFormula = null;
    }
  }
  return Array.from(grid, (r) => Array.from(r ?? [], (x) => x ?? null));
}

function readSst(parts: Buffer[]): string[] {
  let pi = 0;
  let p = 8;
  const cur = () => parts[pi];
  const ensure = () => {
    while (pi < parts.length && p >= cur().length) {
      pi++;
      p = 0;
    }
    return pi < parts.length;
  };
  const u8 = () => {
    ensure();
    return cur()[p++];
  };
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n: number) => {
    for (let i = 0; i < n; i++) u8();
  };
  const unique = parts[0].readUInt32LE(4);
  const out: string[] = [];
  for (let k = 0; k < unique && ensure(); k++) {
    const cch = u16();
    let flags = u8();
    const runs = flags & 8 ? u16() : 0;
    const ext = flags & 4 ? u32() : 0;
    let str = "";
    let left = cch;
    while (left > 0) {
      if (!ensure()) break;
      const high = flags & 1;
      const avail = Math.floor((cur().length - p) / (high ? 2 : 1));
      const take = Math.min(left, avail);
      if (take <= 0) {
        // 글자 경계에서 다음 CONTINUE: 새 flags 바이트
        pi++;
        p = 0;
        if (pi >= parts.length) break;
        flags = u8();
        continue;
      }
      const seg = cur().subarray(p, p + take * (high ? 2 : 1));
      str += high ? seg.toString("utf16le") : seg.toString("latin1");
      p += take * (high ? 2 : 1);
      left -= take;
      if (left > 0 && p >= cur().length) {
        pi++;
        p = 0;
        if (pi >= parts.length) break;
        flags = u8();
      }
    }
    skip(runs * 4 + ext);
    out.push(str);
  }
  return out;
}
