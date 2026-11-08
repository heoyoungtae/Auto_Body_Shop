# 외관수리 정비소 관리 앱

사내 표준서(ISO 기반 업무 표준)에 따라 상담·입고·견적·작업·검사·출고와 설비(TPM·3정5S)·품질·안전환경·인사·회계를 한 앱에서 처리합니다. 사내용·거래처용·고객용 화면을 둡니다.

- 사내 표준서: https://claude.ai/artifact/5mdxxMceQufgWm39QpnKCF
- 앱 설계서: https://claude.ai/artifact/83FaWcQJi3NdfbB2DKPhpb (요약: [docs/design/README.md](docs/design/README.md))

설계 원칙: **양식 = 화면, 서명란 = 전자결재, 숫자 규칙 = 정책값(부록 D), 전결 = 부록 B**.

## 지금 단계: 0단계(기반)

| 기능 | 위치 |
|---|---|
| 직원 로그인, 역할 7종(대표·공장장·상담원·기술자·품질·안전환경·회계), 실패 잠금 | `src/modules/auth` |
| 정책값(부록 D 38종, 제안값 기본, 대표가 시행일·근거 번호와 함께 변경) | `src/modules/platform/policy.ts` |
| 전결 규정(부록 B, 업무·금액별 최종 승인자, 본인 건은 위로) | `src/modules/platform/delegation.ts` |
| 전자결재 엔진(기안·검토·승인·확인, 반려·재상신, 대리 승인, 확정 해시, 취소 문서) | `src/modules/approval` |
| 문서 번호(접두어-연월-일련번호), 감사 로그, 알림, 주기 작업 | `src/modules/platform` |
| 첫 결재 양식: 문서 개정 요청서(F-Q-05) | `/approvals/new` |
| 배포·백업·복구 | `deploy/` |

다음은 1차: 수리 흐름(F-01-01~F-05-02), 고객 화면, 개인정보 동의, 직원 명부·역량표, 설비대장·일상점검·윤활·3정5S, 부적합(F-Q-10).

## 로컬 실행

```sh
npm install
npm run dev        # http://localhost:3000, DB 없이 .data/ 의 PGlite 를 씀
npm test           # 규칙·결재·로그인 테스트
```

로컬과 테스트 서버의 시연 계정: owner(대표), manager(공장장), advisor(상담원), tech1·tech2(기술자), quality(품질), safety(안전환경), account(회계). 비밀번호는 모두 `demo1234`.

DB 구조를 바꾸면 `npm run db:generate` 로 마이그레이션을 만듭니다. 서버 배포는 [deploy/README.md](deploy/README.md).
