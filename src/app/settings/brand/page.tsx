import { getDb } from "@/db/runtime";
import { BRAND_KINDS, BRAND_RULES, brandSize, brandUrl, loadBrand, type BrandKind } from "@/modules/platform/brand-assets";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, Notice, PageTitle, buttonClass, fmtTime } from "../../_ui";
import { brandAction } from "./actions";
import { BrandUpload } from "./brand-upload";

/** 투명 바탕이 보이게 체크 무늬 위에, 어두운 화면용은 남색 위에 보여 준다 */
const CHECKER = "bg-[repeating-conic-gradient(#e6e9ee_0_25%,#ffffff_0_50%)] bg-[length:20px_20px]";

/** 로고·앱 아이콘(대표 결정 2026-11-21): PNG를 등록하면 로그인 화면·파비콘·홈 화면 아이콘 등에 바로 쓰인다 */
export default async function BrandSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const cfg = await loadBrand(await getDb());
  const preview = (k: BrandKind) => {
    const [w, h] = brandSize(cfg, k);
    const dark = k === "logo-dark";
    const wide = BRAND_RULES[k].shape === "wide";
    return (
      <div className={`flex items-center justify-center rounded-md border border-[var(--line)] p-3 ${dark ? "bg-[#0b1d4a]" : CHECKER}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 등록한 그림 미리 보기 */}
        <img src={brandUrl(cfg, k)} alt={BRAND_RULES[k].label} width={w} height={h} className={wide ? "h-auto w-full max-w-md" : k === "small-icon" ? "size-16" : "size-40"} />
      </div>
    );
  };
  return (
    <>
      <PageTitle help="settings.brand" sub="공업사 로고와 앱 아이콘 PNG 파일을 등록합니다. 등록하지 않은 칸은 앱에 들어 있는 기본 그림을 씁니다.">
        로고·앱 아이콘
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {BRAND_KINDS.map((k) => {
          const r = BRAND_RULES[k];
          const e = cfg[k];
          const [w, h] = brandSize(cfg, k);
          return (
            <div key={k} id={k} className="scroll-mt-20">
              <Card title={r.label} help={{ kind: "panel", id: `brand.${k}` }}>
                <div className="space-y-3 text-sm">
                  {preview(k)}
                  <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                    <dt className="text-[var(--muted)]">쓰는 곳</dt>
                    <dd>{r.usedIn}</dd>
                    <dt className="text-[var(--muted)]">지금 그림</dt>
                    <dd>
                      {e ? `${e.fileName} · ${w}×${h} · ${fmtTime(e.updatedAt)} 등록` : `앱 기본 그림(${w}×${h})`}{" "}
                      <a href={brandUrl(cfg, k)} download={`jmotors-${k}.png`} className="text-[var(--accent)] hover:underline">
                        내려받기
                      </a>
                    </dd>
                    <dt className="text-[var(--muted)]">맞는 파일</dt>
                    <dd>PNG, {r.advice}. 5MB까지</dd>
                  </dl>
                  {owner ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <form action={brandAction}>
                        <input type="hidden" name="kind" value={k} />
                        <BrandUpload kind={k} rule={r} dark={k === "logo-dark"} />
                      </form>
                      {e && (
                        <form action={brandAction}>
                          <input type="hidden" name="kind" value={k} />
                          <input type="hidden" name="intent" value="reset" />
                          <button className={buttonClass("secondary")}>기본 그림으로 되돌리기</button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <p className="text-[var(--muted)]">바꾸기는 대표만 할 수 있습니다.</p>
                  )}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </>
  );
}
