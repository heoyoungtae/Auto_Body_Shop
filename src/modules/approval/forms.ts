// 결재를 쓰는 양식의 결재선 — 양식의 결재란이 곧 결재 단계다(사내 표준서 표준 양식집).
// 0단계에는 엔진 시험과 정책값 근거용으로 문서 개정 요청서(F-Q-05)만 연결한다. 나머지 양식은 모듈을 만들 때 여기에 더한다.
import type { DocPrefix } from "../platform/docno";
import type { StepTemplate } from "./types";

export type FormDef = { code: string; name: string; prefix: DocPrefix; steps: StepTemplate[] };

export const FORMS = {
  "F-Q-05": {
    code: "F-Q-05",
    name: "문서 개정 요청서",
    prefix: "R",
    steps: [
      { kind: "draft", label: "요청", assignees: ["drafter"] },
      { kind: "review", label: "검토", assignees: ["quality"] },
      { kind: "approve", label: "승인", delegation: { task: "revision" } },
    ],
  },
  // 근태 신청서(STD-11 4절): 공장장 승인(전결 '연장·휴일 근로·휴가'), 공장장 본인 건은 대표에게 올라간다
  "F-11-04": {
    code: "F-11-04",
    name: "근태·휴가·연장근로 신청서",
    prefix: "LV",
    steps: [
      { kind: "draft", label: "신청", assignees: ["drafter"] },
      { kind: "approve", label: "승인", delegation: { task: "overtime" } },
    ],
  },
  // 재직증명서 발급 신청: 표준서 양식 목록에는 없어 앱에서 더한 양식(F-11-01 명부 값을 쓴다). 직인을 쓰므로 대표 승인
  "HR-CERT": {
    code: "HR-CERT",
    name: "재직증명서 발급 신청",
    prefix: "EC",
    steps: [
      { kind: "draft", label: "신청", assignees: ["drafter"] },
      { kind: "approve", label: "승인", assignees: ["owner"] },
    ],
  },
} satisfies Record<string, FormDef>;

export type FormCode = keyof typeof FORMS;
export const isFormCode = (c: string): c is FormCode => c in FORMS;
export const formDef = (c: FormCode): FormDef => FORMS[c];
