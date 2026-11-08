// 입력 칸 도움말 — 칸마다 이름·한 줄 안내·예시·자세한 설명·형식·넣기 문구를 여기 한곳에 둔다.
// 화면의 입력 부품(src/app/_input.tsx)은 help 키가 필수라서, 여기 없는 칸은 만들 수 없다(타입 검사에서 막힘).
// 새 양식을 만들 때는 칸을 먼저 여기 적고 화면에서 키로 부른다. 문구는 사내 표준서 표준 양식집의 '작성요령'을 따른다.

export type FieldHelp = {
  /** 칸 이름(화면 표시) */
  label: string;
  /** 칸 아래 늘 보이는 한 줄 안내 */
  hint?: string;
  /** 칸 안의 흐린 글씨와 '예:' 안내 */
  example?: string;
  /** '?'를 누르면 펼쳐지는 자세한 설명 */
  detail?: string;
  /** 형식이 틀렸을 때 보여 줄 말(pattern 과 짝) */
  format?: { pattern: string; message: string };
  /** 누르면 칸에 들어가는 자주 쓰는 문구 */
  templates?: string[];
  /** 글자 수 상한(카운터 표시) */
  maxLength?: number;
};

const REVISION_NO: FieldHelp = {
  label: "근거 개정요청 번호",
  hint: "확정된 문서 개정 요청서(F-Q-05) 번호. 목록에서 고를 수 있습니다.",
  example: "R-2611-0001",
  detail:
    "사내 표준서 Q.5에 따라 표준서·정책값·전결 규정을 바꿀 때는 먼저 문서 개정 요청서를 결재로 확정합니다. 확정된 요청서의 번호(R-연월-순번)를 여기에 적으면 무엇을 근거로 바꿨는지 이력에 남습니다. 비워 둘 수는 있지만, 심사 때 근거를 묻게 되므로 적는 것을 권합니다. 칸을 누르면 확정된 요청서 목록이 나옵니다.",
  format: { pattern: "R-\\d{4}-\\d{4}", message: "R-연월(4자리)-순번(4자리) 형식입니다. 예: R-2611-0001" },
};

const EFFECTIVE_FROM: FieldHelp = {
  label: "시행일",
  hint: "이날부터 새 값이 적용됩니다. 오늘이나 그 뒤 날짜만 됩니다.",
  detail:
    "오늘을 고르면 바로 적용되고, 뒷날을 고르면 그날까지는 지금 값이 쓰이고 목록에 '시행 예정'으로 보입니다. 지난 날짜로 거슬러 바꿀 수는 없습니다(이미 처리된 기록이 바뀌지 않게).",
};

const NEW_PASSWORD_DETAIL =
  "8자 이상이고 영문과 숫자가 모두 들어가야 합니다. 생일·전화번호·아이디와 같은 값은 피하세요. 비밀번호는 암호화해 저장하므로 관리자도 볼 수 없고, 잊으면 대표가 새로 정해 줍니다.";

export const FIELD_HELP = {
  // ── 로그인·내 계정
  "login.loginId": {
    label: "아이디",
    hint: "대표가 만들어 준 영문 아이디",
    example: "advisor",
    detail: "대문자로 적어도 소문자로 바꿔 확인합니다. 아이디를 모르면 대표에게 물어보세요.",
  },
  "login.password": {
    label: "비밀번호",
    detail:
      "비밀번호를 정해진 횟수 넘게 틀리면 계정이 잠시 잠깁니다(설정 → 정책값 '로그인 실패 잠금'·'잠금 시간'). 잊었을 때는 대표에게 재설정을 요청하세요.",
  },
  "account.current": { label: "현재 비밀번호", detail: "본인 확인을 위해 지금 쓰는 비밀번호를 한 번 더 적습니다." },
  "account.next": { label: "새 비밀번호", hint: "8자 이상, 영문과 숫자 함께", detail: NEW_PASSWORD_DETAIL },
  "account.next2": { label: "새 비밀번호 확인", hint: "위와 똑같이 한 번 더", detail: "잘못 친 비밀번호로 바뀌지 않도록 같은 값을 두 번 적습니다." },

  // ── 문서 개정 요청서 F-Q-05
  "revision.title": {
    label: "제목",
    hint: "무엇을 어떻게 바꾸는지 한 줄로",
    example: "견적 유효기간 14일 → 10일",
    detail: "결재함과 알림에 이 제목이 보입니다. '무엇을 → 어떻게' 꼴로 적으면 결재자가 열지 않고도 내용을 압니다.",
    maxLength: 80,
  },
  "revision.target": {
    label: "대상 문서·조항·정책값",
    hint: "바꿀 곳을 문서 번호·조항까지",
    example: "부록 D 견적 유효기간(3.2)",
    detail:
      "표준서 장·절(예: STD-03 3.2), 양식 번호(예: F-03-01), 정책값 이름(설정 → 정책값의 이름 그대로), 전결 업무(예: 부록 B 발주·외주) 가운데 하나를 적습니다. 여러 곳이면 쉼표로 나눕니다.",
    maxLength: 120,
  },
  "revision.current": {
    label: "현재 내용",
    hint: "지금 적혀 있는 내용(새로 만드는 것이면 비워 둠)",
    detail: "고치기 전 문장이나 값을 그대로 옮겨 적습니다. 검토자가 무엇이 바뀌는지 비교하는 데 씁니다.",
    maxLength: 2000,
  },
  "revision.proposed": {
    label: "바꿀 내용",
    hint: "바뀐 뒤의 문장이나 값을 그대로",
    detail: "확정되면 이 내용대로 표준서나 설정을 바꿉니다. 고칠 문장 전체를 적어 두면 나중에 다툼이 없습니다.",
    maxLength: 2000,
  },
  "revision.proposedValue": {
    label: "바꿀 값",
    hint: "숫자만. 지금 값과 표준서 제안값을 옆에 보여 줍니다.",
    detail: "정책값 화면에서 '개정 요청'으로 들어오면 이 칸이 나옵니다. 확정되면 대표가 정책값 화면에서 이 요청서를 고르기만 하면 값·근거 번호·사유가 모두 채워집니다(다시 칠 필요 없음).",
  },
  "revision.reason": {
    label: "사유",
    hint: "왜 바꾸는지: 계기, 근거, 기대 효과",
    detail:
      "계기(고객 불만, 부적합, 내부 심사 지적, 법령 개정, 개선 제안 등)와 그 번호를 적고, 바꾸면 무엇이 나아지는지 적습니다. 문구 넣기 단추로 뼈대를 넣은 뒤 채우면 편합니다.",
    templates: [
      "계기: \n근거(관련 기록 번호): \n기대 효과: ",
      "법령 개정 반영: (법령명·조항·시행일)",
      "내부 심사 지적 사항 반영: (심사 번호)",
      "부적합 재발 방지: (부적합 번호)",
      "현장 개선 제안 반영: (제안 번호·제안자)",
    ],
    maxLength: 2000,
  },

  // ── 결재 처리
  "approval.comment": {
    label: "의견",
    hint: "승인은 선택, 반려는 사유 필수",
    detail: "반려할 때는 무엇을 고치면 승인할지 구체적으로 적어 주세요. 기안자는 그 내용을 보고 고쳐 다시 올립니다.",
    templates: ["내용 확인했습니다.", "근거 기록 번호를 덧붙여 주세요.", "바꿀 내용을 문장 그대로 적어 주세요.", "시행일을 정해 다시 올려 주세요."],
    maxLength: 1000,
  },
  "approval.cancelReason": {
    label: "취소 사유",
    hint: "확정 문서를 왜 무르는지",
    detail: "확정 문서는 고칠 수 없어서, 취소 문서를 같은 결재선으로 올려 확정되면 원래 문서가 '취소됨'으로 바뀝니다. 사유는 이력에 영구히 남습니다.",
    templates: ["입력 오류: ", "고객 요청 철회: ", "중복 작성: "],
    maxLength: 500,
  },

  // ── 정책값
  "policy.value": {
    label: "새 값",
    hint: "정수만. 단위와 범위는 칸 옆을 보세요.",
    detail: "칸에 숫자를 넣으면 지금 값·제안값과 비교해 보여 줍니다. 범위를 벗어나면 저장되지 않습니다.",
  },
  "policy.effectiveFrom": EFFECTIVE_FROM,
  "policy.revisionRequestNo": REVISION_NO,
  "policy.reason": {
    label: "변경 사유",
    hint: "왜 바꾸는지 한 줄로",
    example: "현장 처리 시간 반영(R-2611-0001)",
    templates: ["문서 개정 요청서 확정에 따름", "개업 전 시범 운영 결과 반영", "법령 개정 반영"],
    maxLength: 200,
  },

  // ── 전결 규정
  "delegation.upTo": {
    label: "구간 상한",
    hint: "이 금액(비율) 이하는 오른쪽 역할이 최종 승인",
    detail: "낮은 구간부터 적고, 위로 갈수록 커져야 합니다. 마지막 구간은 상한을 비워 '그 이상'으로 둡니다. 금액은 부가세 포함입니다.",
  },
  "delegation.role": {
    label: "최종 승인",
    hint: "위 구간일수록 높은 역할",
    detail: "역할 순서는 상담원 < 기술자 < 품질 < 안전환경 < 회계 < 공장장 < 대표입니다. 기안자 본인이 그 역할이면 자동으로 한 단계 위가 승인합니다.",
  },
  "delegation.effectiveFrom": EFFECTIVE_FROM,
  "delegation.revisionRequestNo": REVISION_NO,
  "delegation.testAmount": {
    label: "미리 보기 금액",
    hint: "금액을 넣으면 누가 최종 승인하는지 바로 보여 줍니다",
    example: "1500000",
  },

  // ── 직원·역할
  "user.name": { label: "이름", example: "홍길동", hint: "결재란과 기록에 이 이름이 찍힙니다", maxLength: 30 },
  "user.loginId": {
    label: "아이디",
    hint: "영문 소문자·숫자·점·밑줄·빼기 3~30자",
    example: "hong.gd",
    detail: "한 번 정하면 바꾸지 않습니다(기록에 남음). 퇴사자 아이디도 다시 쓰지 않습니다. 대문자를 치면 소문자로 바뀝니다.",
    format: { pattern: "[a-z0-9._\\-]{3,30}", message: "영문 소문자·숫자·점(.)·밑줄(_)·빼기(-)만, 3~30자로 적어 주세요" },
  },
  "user.password": {
    label: "처음 비밀번호",
    hint: "8자 이상, 영문과 숫자 함께",
    detail: `${NEW_PASSWORD_DETAIL} 처음 로그인한 직원에게 내 계정에서 바로 바꾸도록 안내하세요.`,
  },
  "user.resetPassword": { label: "새 비밀번호", hint: "8자 이상, 영문과 숫자 함께", detail: "바꾸면 그 직원의 잠금도 함께 풀립니다. 새 비밀번호는 직접 전해 주세요." },
  "user.roles": {
    label: "역할",
    hint: "여러 개 고를 수 있습니다",
    detail:
      "역할에 따라 결재 차례와 볼 수 있는 화면이 정해집니다. 대표는 적어도 한 명 있어야 합니다. 작은 정비소에서는 한 사람이 상담원·품질 담당을 함께 맡는 식으로 겸할 수 있지만, 자기 문서를 자기가 검토하지는 못합니다(자동으로 다른 사람 또는 대표에게 넘어감).",
  },
  "proxy.proxyId": { label: "대리인", hint: "기본은 공장장(설계서 10.3)", detail: "대리 기간 동안 대표 차례의 결재를 이 사람이 대신 처리합니다. 대리로 처리한 문서에는 '대리 승인' 표시가 남습니다." },
  "proxy.fromDate": { label: "시작일", hint: "대리를 시작하는 날" },
  "proxy.toDate": { label: "종료일", hint: "이날까지 포함", detail: "시작일과 같거나 뒤여야 합니다." },
} satisfies Record<string, FieldHelp>;

export type FieldHelpKey = keyof typeof FIELD_HELP;
export const fieldHelp = (k: FieldHelpKey): FieldHelp => FIELD_HELP[k];
