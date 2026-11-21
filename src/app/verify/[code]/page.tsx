// 누구나(차를 사는 분·중고차 딜러): 확인 번호로 수리 이력 확인서의 진위와 내용 보기. 차량번호 가운데는 가린다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { appUrl } from "@/modules/customer/service";
import { cleanCertCode, maskPlate, verifyCert } from "@/modules/carbook/requests";
import { Notice, PageTitle } from "../../_ui";
import { CertSheet } from "../../my/cert/[id]/cert-sheet";

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await verifyCert(await getDb(), decodeURIComponent(code));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle help="public.verify">수리 이력 확인서 확인</PageTitle>
      {!c ? (
        <Notice>
          이 확인 번호의 확인서가 없습니다. 번호를 다시 확인해 주세요.{" "}
          <Link href="/verify" className="underline">
            다시 넣기
          </Link>
        </Notice>
      ) : (
        <>
          <Notice>{c.revokedAt ? "이 확인서는 차 주인이 무효로 했습니다(더 쓰지 않음). 아래 내용은 발급 때 그대로입니다." : `정비소가 발급한 진짜 확인서입니다. 아래는 ${c.snap.issuedOn} 발급 때 내용 그대로입니다.`}</Notice>
          <CertSheet snap={c.snap} docNo={c.docNo} code={cleanCertCode(decodeURIComponent(code))} url={`${appUrl()}/verify`} revoked={!!c.revokedAt} maskPlate={maskPlate} />
        </>
      )}
    </div>
  );
}
