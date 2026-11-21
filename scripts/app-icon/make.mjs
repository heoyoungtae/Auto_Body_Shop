// 앱 아이콘 만들기 (2026-11-21 대표 확정 원본 '1-문구수정-원본')
//   큰 아이콘(홈 화면·설치 앱) = 원본 로고 그대로(2026-11-21 대표 결정). original-rounded.png = 원본에서 바깥 흰 모서리만 투명하게 한 것
//   작은 아이콘(48px 이하: 브라우저 탭·머리줄) = icon-small.svg(로고의 빨간 J, 2026-11-21 대표 결정)
// 실행: node scripts/app-icon/make.mjs  (playwright 크로미움 필요 — 클라우드 작업 환경에 있음)
// 결과(앱에 들어 있는 기본 그림): public/favicon.ico(16·32·48), public/brand-default/app-icon.png(512)·small-icon.png(96),
//   public/icons/apple-180.png·icon-192.png·maskable-512.png. 원본·가로 로고 기본은 public/brand-default/original·logo-*.png
// 대표가 설정 › 로고·앱 아이콘에 PNG를 올리면 그것이 기본 그림보다 먼저 쓰인다(modules/platform/brand-assets.ts)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(join(here, file)).toString("base64")}`;
const original = dataUrl("original-rounded.png", "image/png");
const small = dataUrl("icon-small.svg", "image/svg+xml");

// playwright는 저장소 의존성이 아니라 전역 설치본을 쓴다
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();

/** 원본 로고 아이콘. bg=모서리 바깥을 남색으로 채움(아이폰·안드로이드가 알아서 잘라 냄), scale=로고 폭(전체 대비) */
async function big(size, { bg = false, scale = 1 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;` +
      `background:${bg ? "#012e7d" : "transparent"};display:grid;place-items:center">` +
      `<img src="${original}" style="width:${scale * 100}%;display:block"></div></body></html>`,
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
out("public/icons/apple-180.png", await big(180, { bg: true })); // 아이폰은 투명을 검게 칠하므로 모서리를 남색으로 채움(모서리는 아이폰이 둥글림)
out("public/icons/icon-192.png", await big(192));
out("public/brand-default/app-icon.png", await big(512));
out("public/icons/maskable-512.png", await big(512, { bg: true, scale: 0.8 })); // 안드로이드가 원 등으로 잘라도 글자까지 남게(안쪽 80%)

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
out("public/favicon.ico", Buffer.concat([head, ...imgs]));
out("public/brand-default/small-icon.png", await tiny(96));
await browser.close();
