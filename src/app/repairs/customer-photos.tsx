// 수리 건 화면: 내 차 수첩에서 고객에게 보일 사진 고르기(체크 = 보임). 계기판·차대번호·기타 칸은 원래 안 보인다
import { hidePhotosAction } from "../settings/carbook/actions";
import { SubmitButton } from "../_submit";

export function CustomerPhotos({ roId, photos, editable }: { roId: string; photos: { path: string; label: string; hidden: boolean }[]; editable: boolean }) {
  if (!photos.length) return <p className="text-sm text-[var(--muted)]">고객에게 보일 사진이 아직 없습니다(입고 사진·합격한 검사 사진).</p>;
  return (
    <form action={hidePhotosAction} className="space-y-2">
      <input type="hidden" name="roId" value={roId} />
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <li key={p.path}>
            <input type="hidden" name="all" value={p.path} />
            <label className="block cursor-pointer rounded-md border border-[var(--line)] p-1 text-xs has-[:checked]:border-[var(--accent)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.path}`} alt={p.label} loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
              <span className="mt-1 flex items-center gap-1">
                <input type="checkbox" name="show" value={p.path} defaultChecked={!p.hidden} disabled={!editable} data-assist="group" className="size-4" />
                {p.label} · {p.hidden ? "숨김" : "보임"}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {editable && <SubmitButton variant="secondary">고객에게 보일 사진 저장</SubmitButton>}
    </form>
  );
}
