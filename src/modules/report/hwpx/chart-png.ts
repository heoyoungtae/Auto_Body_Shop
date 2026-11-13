// 추이 막대 그래프를 PNG 그림으로(한글 문서에 넣을 것). 글자는 그림에 넣지 않고 그림 아래 표로 붙인다. 외부 라이브러리 없음.
import { crc32, deflateSync } from "node:zlib";

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};

/** 막대 그래프 PNG(가로 W×세로 H 픽셀). 마지막 막대는 진하게 */
export function barChartPng(values: number[], W = 900, H = 240): Buffer {
  const px = Buffer.alloc(W * H * 3, 255);
  const set = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) set(x, y, c);
  };
  const pad = 10;
  const base = H - pad;
  const top = pad;
  // 눈금선(25% 간격)
  for (let k = 0; k <= 4; k++) rect(pad, Math.round(top + ((base - top) * k) / 4), W - pad, Math.round(top + ((base - top) * k) / 4) + 1, [225, 225, 225]);
  const n = Math.max(1, values.length);
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const slot = (W - pad * 2) / n;
  values.forEach((v, i) => {
    const h = v ? Math.max(2, Math.round((Math.abs(v) / max) * (base - top))) : 0;
    const x0 = Math.round(pad + i * slot + slot * 0.15);
    const x1 = Math.round(pad + (i + 1) * slot - slot * 0.15);
    rect(x0, base - h, x1, base, i === n - 1 ? [37, 99, 235] : [147, 177, 245]);
  });
  rect(pad, base, W - pad, base + 1, [120, 120, 120]);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
