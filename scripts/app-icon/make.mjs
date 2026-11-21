// 앱 아이콘 만들기 (2026-11-21 대표 시안: 톱니·스패너·차·빨간 선 심벌)
//   큰 아이콘(홈 화면·설치 앱) = symbol.png(원본 그림에서 오린 심벌, 투명) + 파란 바탕
//   작은 아이콘(48px 이하: 브라우저 탭·머리줄) = icon-small.svg(로고의 빨간 J, 2026-11-21 '가' 시안)
// 실행: node scripts/app-icon/make.mjs  (playwright 크로미움 필요 — 클라우드 작업 환경에 있음)
// 결과: src/app/favicon.ico(16·32·48)·icon.png(48)·apple-icon.png(180), public/icons/icon-small-96.png, public/icons/icon-192·512·maskable-512.png
// original-with-text.png 는 글자 들어간 원본(문구 '제이모터스'), 가로 로고는 public/brand/logo-*.png
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(join(here, file)).toString("base64")}`;
const symbol = dataUrl("symbol.png", "image/png");
const small = dataUrl("icon-small.svg", "image/svg+xml");

// playwright는 저장소 의존성이 아니라 전역 설치본을 쓴다
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();

/** 원본 심벌 아이콘. round=둥근 모서리(투명), scale=심벌 폭(바탕 대비) */
async function big(size, { round = false, scale = 0.93 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const bg = `radial-gradient(circle ${Math.round(size * 0.75)}px at 45% 36%, #0a3e96, #02143e)`;
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;background:${bg};` +
      `border-radius:${round ? "20%" : "0"};display:grid;place-items:center">` +
      `<img src="${symbol}" style="width:${scale * 100}%;margin-top:${size * 0.03}px"></div></body></html>`,
  );
  return page.screenshot({ omitBackground: true, type: "png" });
}
/** 단순 심벌(작은 크기용) */
async function tiny(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0"><img src="${small}" width="${size}" height="${size}" style="display:block"></body></html>`);
  return page.screenshot({ omitBackground: true, type: "png" });
}

const out = (p, buf) => { writeFileSync(join(root, p), buf); console.log("만듦", p, buf.length, "바이트"); };
out("src/app/apple-icon.png", await big(180, { scale: 0.86 })); // 아이폰이 모서리를 알아서 둥글린다
out("public/icons/icon-192.png", await big(192, { round: true }));
out("public/icons/icon-512.png", await big(512, { round: true }));
out("public/icons/maskable-512.png", await big(512, { scale: 0.72 })); // 안드로이드가 원 등으로 잘라도 심벌이 남게(안쪽 80%)

// favicon.ico: PNG를 그대로 담는 ICO(16·32·48)
const sizes = [16, 32, 48];
const imgs = [];
for (const s of sizes) imgs.push(await tiny(s));
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
out("src/app/icon.png", await tiny(48));
out("public/icons/icon-small-96.png", await tiny(96)); // 머리줄 로고 자리(28px, 고해상도 화면 대비 96)
await browser.close();
