// 미니 PC 서버 설치·이전·원격 관리 설명서(deploy/minipc/README.md)를 앱 도움말 센터에서 본다(대표 요청 2026-11-20).
// 설명서 원본은 저장소의 README 하나뿐이다. 서버 이미지에 저장소가 통째로 들어가므로 돌고 있는 버전의 설명서를 그대로 읽는다.
import { readFile } from "node:fs/promises";
import path from "node:path";

export type GuidePart = { id: string; title: string; body: string };

/** GitHub 과 같은 방식의 제목 고리(#10단계-원격-관리-켜기서버가-자택에-있을-때) */
export function slug(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** 첫 '# 제목'과 머리말, 그리고 '## ' 마다 한 묶음 */
export function splitGuide(md: string): { title: string; intro: string; parts: GuidePart[] } {
  const lines = md.replace(/\r/g, "").split("\n");
  let title = "";
  const intro: string[] = [];
  const parts: GuidePart[] = [];
  let cur: GuidePart | null = null;
  let inCode = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) inCode = !inCode;
    if (!inCode && /^# /.test(l) && !title) {
      title = l.slice(2).trim();
      continue;
    }
    if (!inCode && /^## /.test(l)) {
      const t = l.slice(3).trim();
      cur = { id: slug(t), title: t, body: "" };
      parts.push(cur);
      continue;
    }
    if (cur) cur.body += `${l}\n`;
    else intro.push(l);
  }
  const clean = (s: string) => s.replace(/^\s*---\s*$/gm, "").trim();
  return { title, intro: clean(intro.join("\n")), parts: parts.map((p) => ({ ...p, body: clean(p.body) })) };
}

let cache: { at: number; text: string } | null = null;
/** 설명서 원문. 못 읽으면 빈 글 */
export async function serverGuideText() {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.text;
  const text = await readFile(path.join(process.cwd(), "deploy/minipc/README.md"), "utf8").catch(() => "");
  cache = { at: Date.now(), text };
  return text;
}

/** 도움말 센터 찾기 칸에 넣을 묶음(대표만) */
export async function serverGuideSearchItems() {
  const { parts } = splitGuide(await serverGuideText());
  return parts.map((p) => ({ kind: "설명서", title: `서버 설명서: ${p.title}`, body: p.body.replace(/[`*#>|]/g, " ").slice(0, 4000), href: `/help/server-guide#${p.id}` }));
}
