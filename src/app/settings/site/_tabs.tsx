// 설정 › 홈페이지 위 탭: 기본 정보 · 첫 화면 · 화면 글 · 메뉴·바닥글 · 이력 · 약관·처리방침 · 글·사진(홈페이지 글 화면으로)
// 탭 아래 '공개 전 고침' 줄: 첫 화면·화면 글·메뉴에서 고친 것은 미리 보기로 확인하고 '공개하기'를 눌러야 손님에게 보인다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { draftState } from "@/modules/site/pages";
import { SubmitButton } from "../../_submit";
import { discardAction, previewOnAction, publishAction } from "./actions";

const TABS = [
  { href: "/settings/site", label: "기본 정보" },
  { href: "/settings/site/home", label: "첫 화면" },
  { href: "/settings/site/pages", label: "화면 글" },
  { href: "/settings/site/menu", label: "메뉴·바닥글" },
  { href: "/settings/site/history", label: "공개·이력" },
  { href: "/settings/site/legal", label: "약관·처리방침" },
  { href: "/homepage/faq", label: "질문·공지·사례·기술자료·후기 ↗" },
] as const;

export async function SiteSettingsTabs({ on, back }: { on: (typeof TABS)[number]["href"]; back?: string }) {
  const changed = await draftState(await getDb());
  const here = back ?? on;
  return (
    <>
      <nav aria-label="홈페이지 설정" className="mb-3 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.href === on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {changed && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
          <span className="mr-auto">
            <b>공개 전 고침 {changed.length}곳</b> · 아직 손님에게는 안 보입니다. 미리 보기로 확인하고 공개하세요.
          </span>
          <form action={previewOnAction}>
            <input type="hidden" name="to" value="/site" />
            <SubmitButton variant="secondary">미리 보기</SubmitButton>
          </form>
          <form action={publishAction}>
            <input type="hidden" name="back" value={here} />
            <SubmitButton>공개하기</SubmitButton>
          </form>
          <form action={discardAction}>
            <input type="hidden" name="back" value={here} />
            <SubmitButton variant="danger">고침 버리기</SubmitButton>
          </form>
        </div>
      )}
    </>
  );
}
