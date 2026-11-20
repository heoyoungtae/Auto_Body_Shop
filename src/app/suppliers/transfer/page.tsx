import Link from "next/link";
import { can } from "@/modules/auth/permissions";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { TransferFile } from "./transfer-file";

/** 협력업체 옮기기(대표 요청 2026-11-20): 테스트 서버에서 내보내고 미니 PC 앱에서 가져온다 */
export default async function SupplierTransferPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; skipped?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const ok = can(user, "supplier.manage");
  const added = q.added ? q.added.split("|").filter(Boolean) : [];
  const skipped = q.skipped ? q.skipped.split("|").filter(Boolean) : [];
  return (
    <>
      <PageTitle
        help="suppliers.transfer"
        sub="테스트 서버에 넣어 둔 협력업체를 서류·입금 계좌·통장 사본과 함께 미니 PC 앱으로 한 번 옮깁니다. 옮긴 뒤 이 화면은 없앱니다."
        actions={
          <Link href="/suppliers?f=candidate" className={buttonClass("secondary")}>
            협력업체 대장
          </Link>
        }
      >
        협력업체 옮기기
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={q.error} />
        {(added.length > 0 || skipped.length > 0) && (
          <Notice>
            가져왔습니다: 새로 {added.length}곳{skipped.length ? `, 건너뜀 ${skipped.length}곳` : ""}.
            {added.length > 0 && <span className="mt-1 block text-xs">{added.join(", ")}</span>}
            {skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>
      {!ok ? (
        <Notice>협력업체 옮기기는 공장장·대표가 합니다.</Notice>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <Card title="1. 보내는 쪽에서 내보내기" help={{ kind: "panel", id: "sup.export" }}>
            <div className="space-y-3 text-sm">
              <p>옮길 업체가 있는 앱(예: 테스트 서버)에서 이 화면을 열고 누릅니다. 파일 하나(.json)가 내려받아집니다.</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/suppliers/export" className={buttonClass()}>
                  후보·승인 대기 업체 내보내기
                </a>
                <a href="/api/suppliers/export?all=1" className={buttonClass("secondary")}>
                  전체 내보내기
                </a>
              </div>
              <p className="text-xs text-[var(--muted)]">
                입금 계좌·통장 사본은 계좌 권한자(대표·회계)가 내보낼 때만 들어갑니다. 파일에 <b>계좌번호가 그대로</b> 들어 있으니 옮긴 즉시 지우고, 메신저·메일로 보내지 마세요.
              </p>
            </div>
          </Card>
          <Card title="2. 받는 쪽에서 가져오기" help={{ kind: "panel", id: "sup.import" }}>
            <form action="/api/suppliers/import" method="post" encType="multipart/form-data" className="space-y-3">
              <TransferFile />
              <p className="text-xs text-[var(--muted)]">
                모두 <b>후보</b>로 들어갑니다. 등록 평가와 대표 승인은 여기서 새로 합니다. 입금 계좌는 &lsquo;확인 전&rsquo;으로 들어가, 업체에 전화로 확인하고 &lsquo;확인&rsquo;을 눌러야 지급에 씁니다(대표는 직접 가져온 계좌도 확인할 수 있습니다). 같은 사업자등록번호(번호가 없으면 같은 이름)의 업체는 건너뜁니다.
              </p>
              <SubmitButton>가져오기</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
