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
        sub="다른 서버(예: 테스트 서버)에 넣어 둔 협력업체를 서류 파일과 함께 파일 하나로 옮깁니다. 입금 계좌·통장 사본은 옮기지 않습니다."
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
              <p className="text-xs text-[var(--muted)]">파일에는 업체 연락처와 서류 사진이 들어 있습니다. 옮긴 뒤에는 지워 주세요.</p>
            </div>
          </Card>
          <Card title="2. 받는 쪽에서 가져오기" help={{ kind: "panel", id: "sup.import" }}>
            <form action="/api/suppliers/import" method="post" encType="multipart/form-data" className="space-y-3">
              <TransferFile />
              <p className="text-xs text-[var(--muted)]">
                모두 <b>후보</b>로 들어갑니다. 등록 평가와 대표 승인은 여기서 새로 합니다. 같은 사업자등록번호(번호가 없으면 같은 이름)의 업체는 건너뜁니다.
              </p>
              <SubmitButton>가져오기</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
