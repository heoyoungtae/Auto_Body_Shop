import Link from "next/link";
import type { PageHelpKey } from "@/modules/help/pages";
import { requireUser } from "../_lib/session";
import { Card, PageTitle } from "../_ui";

const ITEMS: { href: string; title: string; body: string; help: PageHelpKey }[] = [
  { help: "settings.shop", href: "/settings/shop", title: "사업장 정보", body: "업체명·대표자·사업자등록번호·정비업 등록번호·주소. 법정 견적서·정비명세서에 찍힙니다." },
  { help: "settings.labor", href: "/settings/labor", title: "공임 기준표(F-03-01)", body: "시간당 공임, 작업별 표준 시간, 패널당 도장 단가와 도장 등급 계수. 견적이 이 표로 계산됩니다." },
  { help: "settings.policies", href: "/settings/policies", title: "정책값(부록 D)", body: "기한·주기·기준 점수 같은 숫자 규칙. 대표가 바꾸고, 바꾼 이력이 남습니다." },
  { help: "settings.delegation", href: "/settings/delegation", title: "전결 규정(부록 B)", body: "업무와 금액별 최종 승인자. 대표가 구간을 바꿉니다." },
  { help: "settings.users", href: "/settings/users", title: "로그인 계정·대리 승인", body: "계정의 상태·역할·접속 기기, 임시 비밀번호·잠금·로그아웃, 대표 부재 시 대리 승인자. 새 직원은 직원 명부에서 등록합니다." },
  { help: "settings.permissions", href: "/settings/permissions", title: "권한표", body: "업무마다 어느 역할이 할 수 있는지. 앱의 권한 검사가 이 표를 따릅니다." },
  { help: "settings.messaging", href: "/settings/messaging", title: "문자 발송 서비스", body: "문자 대행사, 발신번호, 080 수신거부 번호, 준비 순서와 연결 시험." },
  { help: "settings.kakao", href: "/settings/kakao", title: "카카오 알림톡", body: "예약·견적·출고·설문 안내 템플릿과 카카오 승인 코드." },
  { help: "settings.calendar", href: "/settings/calendar", title: "영업일·휴무일", body: "문 여는 요일, 공휴일에 쉬는지, 가게 휴무·특별 영업일. 영업일 기한과 예약 달력이 따릅니다." },
  { help: "settings.gift", href: "/settings/gift", title: "기프티콘 공급사", body: "기프티쇼 비즈 연결, 월 예산·건당 상한·중복 방지 기간." },
];

export default async function SettingsPage() {
  await requireUser();
  return (
    <>
      <PageTitle help="settings" sub="모든 직원이 볼 수 있고, 바꾸는 것은 대표만 할 수 있습니다.">설정</PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        {ITEMS.map((i) => (
          <Card key={i.href} help={{ kind: "page", id: i.help }} title={<Link href={i.href} className="text-[var(--accent)] hover:underline">{i.title}</Link>}>
            <p className="text-sm text-[var(--muted)]">{i.body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
