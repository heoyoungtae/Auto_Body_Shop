// 수리 이력 확인서 한 장(손님 화면·확인 페이지 같이 씀). A4 세로 인쇄
import type { CertSnap } from "@/modules/carbook/requests";
import { fmtCertCode } from "@/modules/carbook/requests";

export function CertSheet({ snap, docNo, code, qr, url, revoked, maskPlate }: { snap: CertSnap; docNo: string; code: string; qr?: string; url: string; revoked?: boolean; maskPlate?: (p: string) => string }) {
  const plate = maskPlate ? maskPlate(snap.car.plateNo) : snap.car.plateNo;
  return (
    <article className="relative mx-auto max-w-[190mm] overflow-hidden rounded-md border border-[var(--line)] bg-white p-5 text-[13px] leading-relaxed text-black print:rounded-none print:border-0 print:p-0">
      {revoked && <p className="absolute right-4 top-4 rotate-6 rounded border-2 border-red-600 px-2 py-0.5 text-lg font-bold text-red-600">무름</p>}
      <h1 className="text-center text-xl font-bold tracking-[0.2em]">수리 이력 확인서</h1>
      <p className="mt-1 text-center text-xs text-neutral-600">
        {docNo} · 발급일 {snap.issuedOn}
      </p>
      {/* 휴대폰에서는 두 칸, 넓은 화면·인쇄에서는 네 칸 */}
      <dl className="mt-4 grid grid-cols-[6rem_1fr] border-t border-l border-neutral-400 text-sm sm:grid-cols-[6rem_1fr_6rem_1fr] print:grid-cols-[6rem_1fr_6rem_1fr]">
        {(
          [
            ["차량번호", plate],
            ["차종", `${snap.car.name}${snap.car.year ? ` · ${snap.car.year}년식` : ""}`],
            ["최초 등록일", snap.car.registeredOn ?? "—"],
            ["차대번호 끝", snap.car.vinTail ? `…${snap.car.vinTail}` : "—"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-r border-b border-neutral-400 bg-neutral-100 px-2 py-1 font-medium">{k}</dt>
            <dd className="border-r border-b border-neutral-400 px-2 py-1">{v}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mt-4 font-semibold">우리 공업사 수리 {snap.repairs.length}건</h2>
      <ol className="mt-1 space-y-2">
        {snap.repairs.map((r, i) => (
          <li key={r.docNo} className="rounded border border-neutral-300 p-2">
            <p className="font-medium">
              {i + 1}. {r.inOn} 입고{r.outOn ? ` · ${r.outOn} 출고` : ""} <span className="text-xs font-normal text-neutral-600">명세서 {r.docNo}</span>
              {r.total != null && <span className="float-right tabular-nums">{r.total.toLocaleString("ko-KR")}원</span>}
            </p>
            <p className="text-neutral-800">{r.items.join(", ") || "—"}</p>
            {r.warranty.length > 0 && <p className="text-xs text-neutral-600">보증: {r.warranty.map((w) => `${w.kind} ${w.until}까지${w.live ? "" : "(끝남)"}`).join(", ")}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-neutral-600">이 확인서는 위 공업사에서 고친 내역만 담습니다. 다른 곳의 수리·사고 이력은 들어 있지 않습니다. 보증은 정비명세서에 적힌 기간이며, 차 주인이 바뀌어도 보증 처리는 공업사에 문의해 주세요.</p>
      <div className="mt-4 flex items-end justify-between gap-4 border-t border-neutral-300 pt-3">
        <div className="text-sm">
          <p className="font-semibold">{snap.shop.name}</p>
          {snap.shop.address && <p>{snap.shop.address}</p>}
          <p>
            {snap.shop.phone && `전화 ${snap.shop.phone}`}
            {snap.shop.bizNo && ` · 사업자 ${snap.shop.bizNo}`}
          </p>
        </div>
        <div className="text-center text-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="확인 QR" className="mx-auto size-24" />}
          <p className="mt-1">
            확인 번호 <b className="font-mono">{fmtCertCode(code)}</b>
          </p>
          <p className="break-all text-neutral-600">{url.replace(/\/verify\/.*/, "/verify")}</p>
        </div>
      </div>
    </article>
  );
}
