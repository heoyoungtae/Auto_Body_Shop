// 사내 표준서(Claude 문서 3탭: 총람·상세 절차서·표준 양식집)를 내보낸 마크다운을 절 단위로 쪼개 앱 첫 데이터로 만든다.
// 한 번만 쓰는 도구(2026-11-19 옮김). 이후 원본은 앱(std_section)이고, 고칠 때는 문서 개정 요청서(F-Q-05)를 쓴다.
// 쓰는 법: node scripts/std-import.mjs <md 폴더(총람.md·절차서.md·양식집.md)>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("md 폴더를 주세요");
const read = (n) =>
  readFileSync(join(dir, n), "utf8")
    .replace(/&#91;/g, "[")
    .replace(/\\([[\]~])/g, "$1")
    .replace(/\r/g, "");

const out = [];
let sort = 0;
const pad = (s) => (s === "Q" ? "Q" : s.padStart(2, "0"));
const push = (s) => out.push({ ...s, body: s.body.trim(), sort: sort++ });

/** '## ' / '### ' 머리말로 나눈다 */
function split(md) {
  const lines = md.split("\n");
  const blocks = [];
  let cur = { level: 0, head: "", lines: [] };
  for (const l of lines) {
    const m = /^(#{1,3}) (.*)$/.exec(l);
    if (m) {
      blocks.push(cur);
      cur = { level: m[1].length, head: m[2].trim(), lines: [] };
    } else cur.lines.push(l);
  }
  blocks.push(cur);
  return blocks.map((b) => ({ ...b, body: b.lines.join("\n").trim() }));
}

// ── 총람
{
  let ch = "00";
  let docNo = "STD-00";
  let part = "overview";
  for (const b of split(read("총람.md"))) {
    if (b.level <= 1) continue; // 제목·날짜 줄
    if (b.level === 2) {
      let m;
      if (b.head === "문서 정보") {
        push({ key: "o:info", part, ch: "00", docNo: "STD-00", no: "", title: "문서 정보", body: b.body });
        continue;
      }
      if ((m = /^(\d+|Q)장 (.*)$/.exec(b.head))) {
        part = "overview";
        ch = pad(m[1]);
        docNo = `STD-${ch}`;
        push({ key: `o:${m[1]}`, part, ch, docNo, no: `${m[1]}장`, title: m[2], body: b.body, chapter: true });
        continue;
      }
      if ((m = /^부록 ([A-Z]) (.*)$/.exec(b.head))) {
        part = "appendix";
        ch = m[1];
        docNo = "STD-00";
        push({ key: `a:${m[1]}`, part, ch, docNo, no: `부록 ${m[1]}`, title: m[2], body: b.body });
        continue;
      }
      throw new Error(`총람 장 머리말을 모름: ${b.head}`);
    }
    const m = /^((?:\d+|Q)\.\d+) (.*)$/.exec(b.head);
    if (!m) throw new Error(`총람 절 머리말을 모름: ${b.head}`);
    push({ key: `o:${m[1]}`, part, ch, docNo, no: m[1], title: m[2], body: b.body });
  }
}

// ── 상세 절차서
{
  let ch = "";
  let docNo = "";
  for (const b of split(read("절차서.md"))) {
    if (b.level === 0) continue;
    if (b.level === 1) {
      push({ key: "p:intro", part: "procedure", ch: "00", docNo: "STD-00", no: "", title: "상세 절차서 머리말", body: b.body });
      continue;
    }
    if (b.level === 2) {
      const m = /^(STD-(\d+|Q)) (.*)$/.exec(b.head);
      if (!m) throw new Error(`절차서 머리말을 모름: ${b.head}`);
      docNo = m[1];
      ch = pad(m[2]);
      push({ key: `p:${docNo}`, part: "procedure", ch, docNo, no: docNo, title: m[3], body: b.body, chapter: true });
      continue;
    }
    const m = /^(\d+)\. (.*)$/.exec(b.head);
    if (!m) throw new Error(`절차서 절 머리말을 모름: ${b.head}`);
    push({ key: `p:${docNo}:${m[1]}`, part: "procedure", ch, docNo, no: `${m[1]}절`, title: m[2], body: b.body });
  }
}

// ── 표준 양식집
{
  let grp = "";
  for (const b of split(read("양식집.md"))) {
    if (b.level === 0) continue;
    if (b.level === 1) {
      push({ key: "f:intro", part: "form", ch: "00", docNo: "STD-00", no: "", title: "표준 양식집 머리말", body: b.body });
      continue;
    }
    if (b.level === 2) {
      grp = b.head.replace(/\s*\(.*\)$/, "");
      continue;
    }
    const m = /^(F-(Q|\d+)-\d+) (.*)$/.exec(b.head);
    if (!m) throw new Error(`양식 머리말을 모름: ${b.head}`);
    push({ key: `f:${m[1]}`, part: "form", ch: pad(m[2]), docNo: m[1], no: m[1], title: m[3], body: b.body, grp });
  }
}

// 원본 문서에는 없고 앱에서 먼저 만든 양식(2026-11-14 PR #25). 앱 화면이 곧 양식이라 모양 대신 근거·요령만 둔다
const EXTRA = [
  {
    after: "f:F-11-07",
    key: "f:F-11-08",
    no: "F-11-08",
    title: "직무기술서",
    body: `| 양식 번호 | 판 | 근거 | 앱 화면 |
| --- | --- | --- | --- |
| F-11-08 | v0.2 | STD-11 (총람 11.1) | 인사 › 직무기술서 |

**작성 요령**: 앱 역할(대표·공장장·상담원·기술자·품질 담당·안전환경 담당·회계 담당)마다 목적, 주요 업무, 자격, 역량, 견제 장치를 적는다. 권한 칸은 권한표에서 저절로 채운다. 근로자 명부(F-11-01)의 종사 업무는 직무기술서에서 고른다. 직무기술서를 고치면 판이 오르고, 해당 직원이 다시 읽고 확인 서명한다.`,
  },
  {
    after: "f:F-11-08",
    key: "f:F-11-09",
    no: "F-11-09",
    title: "신입 오리엔테이션 점검표",
    body: `| 양식 번호 | 판 | 근거 | 앱 화면 |
| --- | --- | --- | --- |
| F-11-09 | v0.2 | STD-11 (총람 11.1, 11.2) | 인사 › 신입 오리엔테이션 |

**작성 요령**: 입사 전 직무를 고르고, 첫날 직무기술서(F-11-08)를 읽고 서명한다. 첫 주에 앱 개별 학습을 마치고, 입사일+14일 안에 채용 시 교육을 한다. OJT 지도자를 정하고, 1개월 뒤 교육 효과를, 3개월 안에 역량 2단계 평가(F-11-02)를 확인한다.`,
  },
];
for (const x of EXTRA) {
  if (out.some((r) => r.key === x.key)) continue;
  const i = out.findIndex((r) => r.key === x.after);
  out.splice(i + 1, 0, { key: x.key, part: "form", ch: "11", docNo: x.no, no: x.no, title: x.title, body: x.body, grp: out[i].grp, sort: 0 });
}
out.forEach((r, i) => (r.sort = i));

const target = new URL("../src/modules/quality/std-seed.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 0).replace(/},{/g, "},\n{") + "\n");
console.log(`${out.length}개 절`, Object.entries(Object.groupBy(out, (s) => s.part)).map(([k, v]) => `${k} ${v.length}`).join(", "));
