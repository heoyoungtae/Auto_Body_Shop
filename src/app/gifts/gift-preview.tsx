"use client";
// 기프티콘 미리보기: 받는 사람 휴대폰에 오는 문자(발신번호·제목·문구)와 쿠폰(배너·카드·상품 그림·유효기간)을 흉내 내 보여 준다.
// 보내기 화면·설정 화면이 같이 쓴다. 문구는 보내기와 같은 giftMessage 로 만든다.
// 같은 양식 안의 칸(상품·문구·목적, 설정의 발신번호·제목·기본 문구)이 바뀌면 바로 따라 바뀐다.
import { useEffect, useRef, useState } from "react";
import { defaultGiftTitle, giftMessage } from "@/modules/messaging/gift";

export type PreviewGoods = {
  code: string;
  name: string;
  brand: string;
  price: number;
  image?: string;
  limitDay?: number;
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

const until = (days: number, now = new Date()) => {
  const t = new Date(now.getTime() + days * 864e5);
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
};

function Placeholder({ text, className }: { text: string; className: string }) {
  return (
    <div className={`flex items-center justify-center border border-dashed border-[var(--line)] bg-[var(--surface-2)] text-center text-[11px] text-[var(--muted)] ${className}`}>
      {text}
    </div>
  );
}

/** 휴대폰 화면 모양의 미리보기 한 장 */
export function GiftPreview({ look, goods, message }: { look: Look; goods?: PreviewGoods; message: string }) {
  const title = look.title.trim() || defaultGiftTitle(look.shop);
  return (
    <figure className="mx-auto w-full max-w-[300px]" aria-label="받는 사람에게 보이는 기프티콘 미리보기">
      <div className="rounded-[28px] border-4 border-neutral-700 bg-[var(--surface)] p-2 shadow-md">
        <div className="mb-2 flex items-center justify-between rounded-t-[20px] bg-[var(--surface-2)] px-3 py-2 text-xs">
          <span className="font-semibold">{fmtSender(look.callback)}</span>
          <span className="text-[var(--muted)]">문자 메시지</span>
        </div>
        <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-2.5 text-[13px] leading-relaxed">
          <p className="font-semibold">{title}</p>
          <p className="whitespace-pre-wrap break-words">{message}</p>
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-white text-[#222]">
            {look.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 설정에 올린 배너 그림
              <img src={look.bannerUrl} alt="배너" className="block max-h-24 w-full object-cover" />
            ) : (
              <Placeholder text="배너(기프티쇼 기본 배너)" className="h-12 border-x-0 border-t-0" />
            )}
            <div className="space-y-2 p-2.5">
              {look.cardUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 설정에 올린 카드 그림
                <img src={look.cardUrl} alt="카드" className="block max-h-40 w-full rounded object-contain" />
              ) : (
                <Placeholder text="카드(기프티쇼 기본 카드)" className="h-16 rounded" />
              )}
              {goods ? (
                <>
                  {goods.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 공급사 상품 그림
                    <img src={goods.image} alt={goods.name} referrerPolicy="no-referrer" className="mx-auto block max-h-40 object-contain" />
                  ) : (
                    <Placeholder text={`🎁 상품 그림${goods.code.startsWith("DEMO") ? "(데모 상품은 그림 없음)" : ""}`} className="h-28 rounded" />
                  )}
                  <div className="text-center">
                    {goods.brand && <p className="text-[11px] text-[#666]">{goods.brand}</p>}
                    <p className="font-semibold">{goods.name}</p>
                  </div>
                  <div
                    aria-hidden
                    className="mx-auto h-10 w-4/5"
                    style={{ background: "repeating-linear-gradient(90deg,#222 0 2px,transparent 2px 4px,#222 4px 5px,transparent 5px 8px)" }}
                  />
                  <p className="text-center text-[11px] text-[#666]">
                    쿠폰 번호는 실제 쿠폰에만 나옵니다
                    <br />
                    유효기간 {until(goods.limitDay || 30)}까지
                  </p>
                </>
              ) : (
                <Placeholder text="상품을 고르면 여기에 나옵니다" className="h-28 rounded" />
              )}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">
        실제 쿠폰 모양은 기프티쇼 비즈가 만들어 조금 다를 수 있습니다.
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
  const message = giftMessage(settings ? "" : (v.message ?? ""), now.template, {
    customer,
    purpose: purposes[v.purpose ?? ""] ?? firstPurpose,
    shop: look.shop,
  });
  return (
    <div ref={ref}>
      <GiftPreview look={now} goods={g} message={message} />
    </div>
  );
}
