// 앱 아이콘 만들기: app-icon.svg(원본) → 파비콘·홈 화면 아이콘 PNG 여러 크기.
// 실행: node scripts/app-icon/make.mjs  (playwright 크로미움 필요 — 개발 PC/클라우드 작업 환경에 있음)
// 결과: src/app/favicon.ico(16·32·48), src/app/icon.svg, src/app/apple-icon.png(180),
//       public/icons/icon-192.png·icon-512.png, maskable-512.png(가장자리 잘림 대비 안쪽 80%)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const svg = readFileSync(join(here, "app-icon.svg"), "utf8");
const svgData = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// playwright는 저장소 의존성이 아니라 전역 설치본을 쓴다(require는 NODE_PATH·전역 경로를 따른다)
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
/** 바탕을 네모로 꽉 채우고 그림만 scale 배로 줄인 SVG(기기가 원·둥근 네모로 잘라 쓰는 아이콘용) */
const fullBleed = (scale) =>
  svg.replace(/ rx="\d+"/, "").replace('<g id="fg">', `<g id="fg" transform="translate(${(256 * (1 - scale)).toFixed(1)} ${(256 * (1 - scale)).toFixed(1)}) scale(${scale})">`);
const dataUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;
/** size×size PNG. bleed가 있으면 모서리 없는 꽉 찬 바탕(마스크용 0.8, 애플 0.9) */
async function png(size, { bleed } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const src = bleed ? dataUrl(fullBleed(bleed)) : svgData;
  await page.setContent(`<html><body style="margin:0"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  return page.screenshot({ omitBackground: !bleed, type: "png" });
}

const out = (p, buf) => { writeFileSync(join(root, p), buf); console.log("만듦", p, buf.length, "바이트"); };
out("src/app/apple-icon.png", await png(180, { bleed: 0.9 }));
out("public/icons/icon-192.png", await png(192));
out("public/icons/icon-512.png", await png(512));
out("public/icons/maskable-512.png", await png(512, { bleed: 0.8 }));

// favicon.ico: PNG를 그대로 담는 ICO(16·32·48)
const sizes = [16, 32, 48];
const imgs = [];
for (const s of sizes) imgs.push(await png(s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
out("src/app/favicon.ico", Buffer.concat([head, ...imgs]));
copyFileSync(join(here, "app-icon.svg"), join(root, "src/app/icon.svg"));
console.log("만듦 src/app/icon.svg");
await browser.close();
