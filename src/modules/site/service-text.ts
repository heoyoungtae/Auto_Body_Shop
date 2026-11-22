// 홈페이지 › 수리 안내 글(처음 문구 = service-pages.ts). 설정 › 홈페이지 › 화면 글 › 수리 안내에서 분야마다 고친다.
// 주소 이름(slug)·그림·같이 읽을 기술자료는 고치지 않는다(주소가 바뀌면 검색·링크가 끊긴다).
import type { ItemDef } from "./page-text";
import { SERVICE_PAGES } from "./service-pages";

export const METHOD_FIELDS = [
  { k: "name", label: "방법", max: 40 },
  { k: "when", label: "이럴 때", max: 120 },
  { k: "how", label: "이렇게", max: 300 },
  { k: "time", label: "걸리는 기간", max: 40 },
] as const;

export const SERVICE_TEXT: Record<string, ItemDef> = {
  "services.sub": { kind: "text", label: "수리 안내 화면 설명", def: "차체 외관 수리만 합니다. 분야를 누르면 고치는 방법, 걸리는 기간, 비용이 정해지는 기준을 자세히 볼 수 있습니다.", multi: true, max: 200 },
  "services.price.title": { kind: "text", label: "수리비 제목(줄 바꿈 가능)", def: "수리비는\n이렇게 정해집니다", multi: true, max: 60 },
  "services.price.lead": {
    kind: "text",
    label: "수리비 설명",
    def: "정해진 가격표 대신 차를 보고 부위마다 정합니다. 법정 견적서에 부품·공임·도장을 나눠 적고, 승인하신 작업만 합니다. 뜯어 보니 더 다친 곳이 있으면 사진과 함께 먼저 여쭙니다.",
    multi: true,
    max: 300,
  },
  "services.price.items": {
    kind: "pairs",
    label: "수리비가 정해지는 것",
    def: [
      { t: "손상 크기·깊이", d: "같은 문콕이라도 깊이와 꺾임에 따라 덴트로 끝나기도, 판금이 필요하기도 합니다." },
      { t: "고치는 방법", d: "덴트·광택처럼 도장을 살리는 방법이 가장 빠르고 쌉니다. 도장이 깨지면 칠하는 공정이 더해집니다." },
      { t: "칠하는 판과 색", d: "판 수, 메탈릭·펄 같은 색 종류, 옆 판까지 번지게 칠해야 하는지에 따라 달라집니다." },
      { t: "부품", d: "고쳐 쓸 수 없으면 바꿉니다. 신품·재제조·인증 대체 부품 가운데 고르실 수 있습니다." },
    ],
    max: 6,
    min: 1,
  },
  "services.cta": { kind: "text", label: "아래 견적 띠 설명(모아 보기)", def: "어느 분야인지 모르셔도 괜찮습니다. 사진을 보내 주시면 방법과 대략 금액을 알려 드립니다.", multi: true, max: 200 },
  "services.ctaOne": { kind: "text", label: "아래 견적 띠 설명(분야 화면)", def: "영업일 {회신일}일 안에 방법과 대략 금액, 기간을 알려 드립니다.", multi: true, max: 200 },
  ...Object.fromEntries(
    SERVICE_PAGES.flatMap((s): [string, ItemDef][] => [
      [`services.${s.slug}.title`, { kind: "text", label: "분야 이름", def: s.title, max: 20 }],
      [`services.${s.slug}.lead`, { kind: "text", label: "한 줄 소개", def: s.lead, multi: true, max: 200 }],
      [`services.${s.slug}.warranty`, { kind: "text", label: "보증 한 줄", def: s.warranty, max: 80 }],
      [`services.${s.slug}.signs`, { kind: "lines", label: "이런 손상이면", def: s.signs, max: 8, min: 1 }],
      [`services.${s.slug}.methods`, { kind: "rows", label: "고치는 방법", fields: METHOD_FIELDS, def: s.methods, max: 5, min: 1 }],
      [`services.${s.slug}.steps`, { kind: "pairs", label: "진행 순서", def: s.steps, max: 8, min: 2 }],
      [`services.${s.slug}.costs`, { kind: "lines", label: "비용이 정해지는 기준", def: s.costs, max: 8, min: 1 }],
      [`services.${s.slug}.tips`, { kind: "lines", label: "알아 두세요", def: s.tips, max: 6, min: 1 }],
    ]),
  ),
};

type View = { t: (k: string) => string; lines: (k: string) => string[]; pairs: (k: string) => { t: string; d: string }[]; rows: (k: string) => Record<string, string>[] };

/** 수리 안내 분야 목록(고친 글 + 정책값). 홈·수리 안내·분야 화면이 함께 쓴다 */
export function servicePagesView(v: View) {
  return SERVICE_PAGES.map((s) => {
    const k = (x: string) => `services.${s.slug}.${x}`;
    return {
      ...s,
      title: v.t(k("title")),
      lead: v.t(k("lead")),
      warranty: v.t(k("warranty")),
      signs: v.lines(k("signs")),
      methods: v.rows(k("methods")).map((m) => ({ name: m.name ?? "", when: m.when ?? "", how: m.how ?? "", time: m.time ?? "" })),
      steps: v.pairs(k("steps")),
      costs: v.lines(k("costs")),
      tips: v.lines(k("tips")),
    };
  });
}
