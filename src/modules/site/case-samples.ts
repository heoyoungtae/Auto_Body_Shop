// 작업 사례 예시(대표 2026-11-22 "작업 사례 사진은 샘플로 만들어 넣어줘").
// 실제 사례(손님 동의·번호판 가림)가 하나도 공개되지 않았을 때만 홈페이지에 보인다. 그림은 차체 판을 그린 '예시 그림'이고
// 그림 안과 화면에 "예시(실제 작업사진 준비중)"이라고 적어(대표 지시 문구) 실제 수리 사진으로 오해하지 않게 한다(표시광고법). 첫 실제 사례를 공개하면 저절로 모두 빠진다.
// 그림 다시 그리기: python3 scripts/site-case-samples.py → public/site-art/cases/{key}-{before|after}.svg
export type CaseSample = { key: string; category: "찌그러짐" | "긁힘" | "도색"; service: string; title: string; body: string };

export const CASE_SAMPLES: CaseSample[] = [
  { key: "door-dent", category: "찌그러짐", service: "dent", title: "앞문 문콕 · 덴트 복원", body: "도장이 깨지지 않은 둥근 찌그러짐은 안쪽에서 밀어 펴 공장 도장을 그대로 살립니다." },
  { key: "fender-dent", category: "찌그러짐", service: "dent", title: "뒤 펜더 주차 사고 · 판금", body: "꺾인 선이 날카로운 찌그러짐은 판금으로 면을 되살린 뒤 칠합니다." },
  { key: "door-scratch", category: "긁힘", service: "scratch", title: "옆문 긁힘 · 부분 도색", body: "손톱이 걸리는 긁힘은 갈아내고 부분 도색한 뒤 경계를 번지게 칠합니다." },
  { key: "bumper-scuff", category: "긁힘", service: "scratch", title: "앞 범퍼 모서리 쓸림 · 복원", body: "쓸려 일어난 범퍼 플라스틱을 다듬고 메운 뒤 칠합니다." },
  { key: "rust-arch", category: "도색", service: "rust", title: "바퀴 둘레 녹 · 녹 제거 도색", body: "녹을 끝까지 갈아내고 녹 방지 바탕칠을 한 뒤 다시 칠합니다." },
  { key: "hood-fade", category: "도색", service: "paint", title: "햇볕에 바랜 도장 · 판 도색", body: "바래고 얼룩진 투명층을 벗겨 내고 판 하나를 새로 칠합니다." },
];

export const sampleImg = (key: string, side: "before" | "after") => `/site-art/cases/${key}-${side}.svg`;

/** 실제 공개 사례가 없을 때만 예시(분야를 고르면 그 분야만) */
export const caseSamples = (realCount: number, category = "") => (realCount > 0 ? [] : CASE_SAMPLES.filter((s) => !category || s.category === category));

/** 예시 표시 문구(대표 지시 그대로) */
export const SAMPLE_LABEL = "예시(실제 작업사진 준비중)";
