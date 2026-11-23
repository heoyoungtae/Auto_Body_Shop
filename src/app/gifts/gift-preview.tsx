"use client";
// 기프티콘 미리보기: 받는 사람 휴대폰에 오는 문자(발신번호·제목·문구)와 쿠폰(배너·카드·상품 그림·유효기간)을 흉내 내 보여 준다.
// 보내기 화면·설정 화면이 같이 쓴다. 문구는 보내기와 같은 giftMessage 로 만든다.
// 같은 양식 안의 칸(상품·문구·목적, 설정의 발신번호·제목·기본 문구)이 바뀌면 바로 따라 바뀐다.
import { useEffect, useRef, useState } from "react";
import { defaultGiftTitle, GIFT_MSG_MAX, giftMessage, giftMessageFull } from "@/modules/messaging/gift";

export type PreviewGoods = {
  code: string;
  name: string;
  brand: string;
  price: number;
  image?: string;
  limitDay?: number;
  affiliate?: string;
};

type Look = {
  shop: string;
  callback: string;
  title: string;
  template: string;
  bannerUrl?: string;
  cardUrl?: string;
};

/** 번호를 읽기 쉽게(15886474 → 1588-6474, 01012345678 → 010-1234-5678) */
export function fmtSender(n: string) {
  const d = n.replace(/\D/g, "");
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (/^02\d{7,8}$/.test(d)) return `02-${d.slice(2, -4)}-${d.slice(-4)}`;
  if (/^0\d{9,10}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, -4)}-${d.slice(-4)}`;
  return d || "발신번호 없음";
}

const until = (days: number, now = new Date()) =>
  new Date(now.getTime() + days * 864e5 + 9 * 3600e3).toISOString().slice(0, 10);

const ph = "grid place-items-center bg-[#eef0f3] p-1.5 text-center text-[11px] text-[#8a8f98]";

/**
 * 휴대폰 문자 모양의 미리보기(미래모터스 앱의 '받는 메시지 미리보기'와 같은 차례).
 * 배너 → 상품 그림·카드(나란히) → 바코드 샘플 → 상품명·교환처·유효기간 → 문구
 */
export function GiftPreview({ look, goods, message, full, customer, picked }: { look: Look; goods?: PreviewGoods; message: string; full?: number; customer?: string; picked?: boolean }) {
  const title = look.title.trim() || defaultGiftTitle(look.shop);
  const len = full ?? message.length;
  const cut = len > GIFT_MSG_MAX;
  return (
    <figure className="mx-auto w-full max-w-[340px]" aria-label="받는 사람에게 보이는 기프티콘 미리보기">
      <div className="rounded-[22px] bg-[#e9edf5] p-3.5 text-[#222]">
        <div className="mb-2 flex justify-between gap-2 text-xs text-[#5b6372]">
          <b className="text-[#222]">{look.shop}</b>
          <span>{fmtSender(look.callback)}</span>
        </div>
        <div className="overflow-hidden rounded-xl bg-white text-[13px] shadow-sm">
          {look.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 설정에 올린 배너 그림
            <img src={look.bannerUrl} alt="배너" className="block h-auto w-full" />
          ) : (
            <div className={`${ph} aspect-[700/280]`}>배너 그림 없음(기프티쇼 기본 배너)</div>
          )}
          <div className="grid grid-cols-2 border-b border-[#e3e6eb]">
            <div className="flex aspect-square min-w-0 flex-col bg-white">
              {goods?.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 공급사 상품 그림
                <img src={goods.image} alt="" referrerPolicy="no-referrer" className="min-h-0 w-full flex-[0_0_70%] object-contain p-[8%]" />
              ) : (
                <div className={`${ph} min-h-0 flex-[0_0_70%]`}>{goods ? "상품 사진" : "상품을 고르세요"}</div>
              )}
              <div className="grid flex-[0_0_30%] place-items-center overflow-hidden bg-[#e9e9e9] px-1 text-center text-[11px] font-bold leading-tight text-[#9a9a9a] [word-break:keep-all]">
                {goods?.brand || "BRAND"}
              </div>
            </div>
            {look.cardUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 설정에 올린 카드 그림
              <img src={look.cardUrl} alt="카드" className="block aspect-square h-full w-full object-cover" />
            ) : (
              <div className={`${ph} aspect-square`}>카드 그림 없음(기프티쇼 기본 카드)</div>
            )}
          </div>
          <div className="px-3.5 pt-2.5 pb-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- 바코드 샘플 그림 */}
            <img src="/gift/barcode-sample.png" alt="바코드 샘플" width={544} height={203} className="mx-auto block h-auto w-[82%]" />
          </div>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3.5 pt-1.5 pb-2.5">
            <dt className="text-[#7a808a]">상품명</dt>
            <dd className="m-0 font-semibold [word-break:keep-all]">{goods ? goods.name : "-"}</dd>
            <dt className="text-[#7a808a]">교환처</dt>
            <dd className="m-0 font-semibold [word-break:keep-all]">{goods ? goods.affiliate || goods.brand || "-" : "-"}</dd>
            <dt className="text-[#7a808a]">유효기간</dt>
            <dd className="m-0 font-semibold">{goods ? `~ ${until(goods.limitDay || 30)}` : "-"}</dd>
          </dl>
          <div className="border-t border-[#e3e6eb] px-3.5 pt-2.5 pb-3.5 leading-normal">
            <p className="mb-1 font-semibold">{title}</p>
            <p className="whitespace-pre-wrap break-words">{message || <span className="text-[#8a8f98]">문구를 입력하세요.</span>}</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 space-y-1 text-xs">
        <p className={cut ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
          {len}/{GIFT_MSG_MAX}자{cut ? " — 넘는 뒷부분은 잘려서 갑니다" : ""}
          {customer ? ` · 받는 분 예시: ${customer}` : ""}
        </p>
        <p className="text-[var(--muted)]">
          바코드·번호는 샘플입니다. 실제 바코드는 보낼 때 기프티쇼가 만들어 붙입니다.
          {picked === false ? " 배너·카드 그림은 설정 › 기프티콘 공급사에서 올리면 여기에 나옵니다." : ""}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * 같은 양식의 칸을 읽어 미리보기를 바로 고친다.
 * send: goodsCode·message·purpose 칸 / settings: callback·title·defaultMessage 칸
 */
export function LiveGiftPreview({
  mode,
  look,
  goods,
  customer,
  purposes,
}: {
  mode: "send" | "settings";
  look: Look;
  goods: PreviewGoods[];
  customer: string;
  purposes: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const fd = new FormData(form);
      const get = (k: string) => String(fd.get(k) ?? "");
      setV({
        goodsCode: get("goodsCode"),
        message: get("message"),
        purpose: get("purpose"),
        callback: get("callback"),
        title: get("title"),
        defaultMessage: get("defaultMessage"),
      });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, []);
  const settings = mode === "settings";
  const now: Look = settings ? { ...look, callback: v.callback ?? look.callback, title: v.title ?? look.title, template: v.defaultMessage ?? look.template } : look;
  const g = settings ? goods[0] : goods.find((x) => x.code === v.goodsCode);
  const firstPurpose = Object.values(purposes)[0] ?? "감사";
  const vars = { customer, purpose: purposes[v.purpose ?? ""] ?? firstPurpose, shop: look.shop };
  const typed = settings ? "" : (v.message ?? "");
  const message = giftMessage(typed, now.template, vars);
  const full = giftMessageFull(typed, now.template, vars).length;
  return (
    <div ref={ref}>
      <GiftPreview look={now} goods={g} message={message} full={full} customer={customer} picked={!!(look.bannerUrl && look.cardUrl)} />
    </div>
  );
}
