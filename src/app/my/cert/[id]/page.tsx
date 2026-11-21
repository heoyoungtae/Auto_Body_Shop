// 수리 이력 확인서 보기·인쇄·PDF. 아래 QR·확인 번호로 누구나 /verify 에서 같은 내용을 본다
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { appUrl } from "@/modules/customer/service";
import { fmtCertCode, myCert } from "@/modules/carbook/requests";
import { UserError } from "@/modules/platform/errors";
import { SubmitButton } from "../../../_submit";
import { Notice, PageTitle } from "../../../_ui";
import { revokeCertAction } from "../../actions";
import { requireMy } from "../../_session";
import { PrintBar } from "../../print-bar";
import { CertSheet } from "./cert-sheet";

export default async function MyCertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireMy(true);
  let c: Awaited<ReturnType<typeof myCert>>;
  try {
    c = await myCert(await getDb(), s, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const url = `${appUrl()}/verify/${c.code}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 200 });
  return (
    <div className="pt-2">
      <div className="no-print">
        <PageTitle help="my.certView" sub={`${c.docNo} · 확인 번호 ${fmtCertCode(c.code)}`}>
          수리 이력 확인서
        </PageTitle>
        {c.revokedAt && <Notice>무효로 한 확인서입니다. 확인 페이지에도 &lsquo;무효&rsquo;로 나옵니다.</Notice>}
      </div>
      <PrintBar back="/my/cert" />
      <CertSheet snap={c.snap} docNo={c.docNo} code={c.code} qr={qr} url={url} revoked={!!c.revokedAt} />
      {!c.revokedAt && (
        <form action={revokeCertAction} className="no-print mt-4">
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton variant="secondary" full>
            이 확인서 무효로 하기(더 쓰지 않음)
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
