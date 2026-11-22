// 개인정보 처리방침(개인정보 보호법 제30조, 누구나 볼 수 있게 공개). 공업사 이름·대표·문자 대행사·보호책임자는 설정에서 불러온다.
// 동의서(F-13-01) 문구와 같은 항목·보관 기간을 쓴다. 문구를 바꾸면 시행일(설정 › 홈페이지)을 고친다.
import type { Metadata } from "next";
import { getDb } from "@/db/runtime";
import { CONSENT_TEXT } from "@/modules/customer/rules";
import { isProviderId, PROVIDERS } from "@/modules/messaging/providers";
import { smsSenderInfo } from "@/modules/messaging/service";
import { siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "개인정보 처리방침" };

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 text-lg font-bold">
      제{n}조 {children}
    </h2>
  );
}

export default async function PrivacyPage() {
  const { shop, ceo, cfg } = await siteData();
  const sms = await smsSenderInfo(await getDb());
  const smsName = sms.provider && isProviderId(sms.provider) && sms.provider !== "demo" ? PROVIDERS[sms.provider].label : "문자·알림톡 발송 대행사(계약 후 이름을 적음)";
  const name = shop.name;
  return (
    <article className="mx-auto max-w-3xl leading-relaxed">
      <SiteTitle eyebrow="PRIVACY POLICY" help="site.privacy" sub={`${name}은(는) 고객의 개인정보를 소중히 다루며 개인정보 보호법에 따라 아래와 같이 처리합니다.`}>
        개인정보 처리방침
      </SiteTitle>

      <H n={1}>처리 목적</H>
      <p>수리 상담·견적 요청 답변, 입고 예약, 견적·수리·검사·출고, 보험 수리 청구, 보증·사후 관리 안내, 내 차 수첩 서비스 제공, 법령에 따른 기록 보관. 광고 문자는 따로 동의하신 분께만 보냅니다.</p>

      <H n={2}>처리하는 항목</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>필수: 이름, 휴대폰 번호, 차량번호, 차종·연식·색상, 손상 사진·부위</li>
        <li>보험 수리 때: 보험사, 사고 접수번호</li>
        <li>선택: 광고 문자 수신 여부, 수리 전후 사진 홍보 사용 여부</li>
        <li>내 차 수첩을 쓰실 때: 직접 적으신 주유·정비·비용 기록, 알림 설정</li>
        <li>자동으로 생기는 정보: 접속 주소(IP), 접속 시각, 로그인 유지용 쿠키(인증 정보만 담고 광고·추적에 쓰지 않음)</li>
      </ul>
      <p className="mt-2 text-sm text-[var(--muted)]">주민등록번호·운전면허번호·위치 정보는 받지 않습니다. 휴대폰 번호는 암호화해 보관합니다.</p>

      <H n={3}>보관 기간과 파기</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>상담·견적 요청만 하고 수리하지 않은 경우: 1년 뒤 파기</li>
        <li>수리한 경우: 세법·자동차관리법에 따라 5년 뒤 파기</li>
        <li>내 차 수첩에 직접 적은 기록: 그만 쓰기를 누르면 바로, 3년 동안 들어오지 않으면 자동으로 지움</li>
        <li>필수 동의를 철회하시면 연락처를 바로 지우고 더 연락하지 않습니다(법정 보관 기록은 기간까지 남음).</li>
      </ul>
      <p className="mt-2">기간이 지난 정보는 앱의 보존·파기 절차에 따라 되살릴 수 없게 지우고, 종이 서류는 분쇄합니다.</p>

      <H n={4}>제3자 제공</H>
      <p>고객 동의 없이 다른 곳에 주지 않습니다. 다만 보험 수리를 맡기신 경우 수리비 청구에 필요한 견적·수리 내역과 사진을 해당 보험사에 제공하며, 법령에 따른 요청이 있으면 그에 따릅니다.</p>

      <H n={5}>처리 위탁</H>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line-strong)] text-left">
            <th className="py-2 pr-2">받는 곳</th>
            <th className="py-2">맡기는 일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          <tr>
            <td className="py-2 pr-2">{smsName}</td>
            <td className="py-2">인증번호·예약·견적·출고 안내 문자와 카카오 알림톡 발송</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm text-[var(--muted)]">고객 정보는 제이모터스가 직접 관리하는 국내 서버에 보관하며, 국외로 옮기지 않습니다.</p>

      <H n={6}>고객의 권리</H>
      <p>
        언제든 내 정보를 보거나 고치거나 지우거나 처리를 멈추도록 요청하실 수 있습니다. 내 차 수첩 › 더보기에서 직접 하시거나, 아래 보호책임자에게 전화·방문으로 요청하시면 10일 안에 처리합니다. 광고
        문자는 받은 문자의 무료 수신거부 번호로도 끊을 수 있습니다.
      </p>

      <H n={7}>안전하게 지키는 방법</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>휴대폰 번호·계좌 같은 정보는 암호화해 보관하고, 직원마다 필요한 만큼만 볼 수 있게 권한을 나눕니다.</li>
        <li>누가 언제 어떤 기록을 보고 고쳤는지 남기고, 직원은 개인정보 교육을 받습니다.</li>
        <li>접속은 모두 암호화(https)하고, 비정상 접속은 자동으로 막습니다. 매일 백업합니다.</li>
      </ul>

      <H n={8}>개인정보 보호책임자</H>
      <p>
        {cfg.privacyOfficer || ceo || "대표"} {cfg.privacyContact ? `· ${cfg.privacyContact}` : shop.phone ? `· 전화 ${shop.phone}` : ""}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">개인정보 침해 상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)</p>

      <H n={9}>바뀌는 경우</H>
      <p>이 방침을 바꾸면 시행 7일 전에 홈페이지에 알립니다.</p>
      <p className="mt-6 text-sm text-[var(--muted)]">
        시행일: {cfg.privacyFrom || "개업일"} · {name}
        {ceo ? ` 대표 ${ceo}` : ""}
      </p>
      <details className="mt-6 rounded-lg border border-[var(--line)] p-4 text-sm">
        <summary className="cursor-pointer font-medium">견적 요청 때 받는 동의 문구 보기</summary>
        <p className="mt-2 font-medium">{CONSENT_TEXT.required.title}</p>
        <p className="text-[var(--muted)]">{CONSENT_TEXT.required.body}</p>
        <p className="mt-2 font-medium">{CONSENT_TEXT.marketing.title}</p>
        <p className="text-[var(--muted)]">{CONSENT_TEXT.marketing.body}</p>
      </details>
    </article>
  );
}
