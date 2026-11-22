// 홈페이지 › 후기·사진·인증: 바깥 후기 바로 가기·별점 요약, 손님 후기, 공업사 실제 사진(외관·작업장·장비·사람들), 자격·인증.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { heroImage, PHOTO_KINDS, REVIEW_SOURCES, siteTrust, TRUST_LIMIT } from "@/modules/site/trust";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { HomepageTabs } from "../_tabs";
import { addCertAction, addReviewAction, removeCertAction, removeReviewAction, removeShopPhotoAction, saveTrustLinksAction, setHeroAction } from "../actions";
import { ShopPhotoUpload } from "./shop-photo-upload";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default async function TrustAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser([...rolesFor("consult.write")]);
  const t = await siteTrust(await getDb());
  const hero = heroImage(t);
  const site = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="homepage.trust"
        sub="손님이 믿고 맡길 수 있게 하는 자료입니다. 바깥 후기, 공업사 실제 사진, 자격·인증을 홈페이지 첫 화면과 소개에 보입니다."
        actions={
          <Link href={site} target="_blank" className={buttonClass("secondary")}>
            홈페이지에서 보기
          </Link>
        }
      >
        후기·사진·인증
      </PageTitle>
      <HomepageTabs on="/homepage/trust" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="바깥 후기 바로 가기·별점" help={{ kind: "panel", id: "homepage.trustLinks" }}>
          <AssistForm id="trust-links" action={saveTrustLinksAction} className="space-y-4">
            <TextField help="homepage.linkNaver" name="naver" defaultValue={t.links.naver} placeholder="https://naver.me/..." />
            <TextField help="homepage.linkKakao" name="kakao" defaultValue={t.links.kakao} placeholder="https://place.map.kakao.com/..." />
            <TextField help="homepage.linkGoogle" name="google" defaultValue={t.links.google} placeholder="https://maps.app.goo.gl/..." />
            <TextField help="homepage.ratingScore" name="score" defaultValue={t.rating.score?.toString() ?? ""} inputMode="decimal" />
            <NumberField help="homepage.ratingCount" name="count" defaultValue={t.rating.count} min={0} />
            <SelectField help="homepage.ratingSource" name="source" defaultValue={t.rating.source} placeholder="고르기" options={REVIEW_SOURCES.slice(0, 3).map((s) => ({ value: s, label: s }))} />
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
        </Card>

        <Card title={`손님 후기 ${t.reviews.length}/${TRUST_LIMIT.reviews}`} help={{ kind: "panel", id: "homepage.reviews" }}>
          {t.reviews.length ? (
            <ul className="mb-4 divide-y divide-[var(--line)] rounded-md border border-[var(--line)] text-sm">
              {t.reviews.map((r) => (
                <li key={r.id} className="flex gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="text-[var(--warn)]">{stars(r.rating)}</span> <b>{r.name}</b> <span className="text-xs text-[var(--muted)]">{[r.source, r.date].filter(Boolean).join(" · ")}</span>
                    </p>
                    <p className="mt-0.5 text-[var(--muted)]">{r.text}</p>
                  </div>
                  <form action={removeReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-[var(--danger)] underline">지우기</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 후기가 없습니다. 네이버·카카오맵 후기 가운데 좋은 것을 골라 옮겨 적으세요.</Empty>
          )}
          <AssistForm id="trust-review" action={addReviewAction} className="mt-3 space-y-4 border-t border-[var(--line)] pt-4">
            <TextAreaField help="homepage.reviewText" name="text" required rows={3} />
            <SelectField help="homepage.reviewRating" name="rating" required defaultValue="5" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${stars(n)} ${n}점` }))} />
            <TextField help="homepage.reviewName" name="name" />
            <SelectField help="homepage.reviewSource" name="source" required defaultValue="네이버" options={REVIEW_SOURCES.map((s) => ({ value: s, label: s }))} />
            <DateField help="homepage.reviewDate" name="date" defaultValue={seoulDate()} quick={["today"]} />
            <SubmitButton>후기 넣기</SubmitButton>
          </AssistForm>
        </Card>

        <Card title={`공업사 사진 ${t.photos.length}/${TRUST_LIMIT.photos}`} help={{ kind: "panel", id: "homepage.shopPhotos" }}>
          {t.photos.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {t.photos.map((p) => (
                <figure key={p.id} className="relative overflow-hidden rounded-md border border-[var(--line)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 올린 사진 미리 보기 */}
                  <img src={`/api/files/${p.path}`} alt={p.caption || PHOTO_KINDS[p.kind]} className="aspect-[4/3] w-full object-cover" />
                  <figcaption className="px-2 py-1 text-xs">
                    <b>{PHOTO_KINDS[p.kind]}</b> {p.caption}
                    {t.hero === p.id ? (
                      <span className="mt-1 block font-semibold text-[var(--accent)]">첫 화면 배경</span>
                    ) : (
                      <form action={setHeroAction} className="mt-1">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-[var(--accent)] underline">첫 화면 배경으로</button>
                      </form>
                    )}
                  </figcaption>
                  <form action={removeShopPhotoAction} className="absolute right-1 top-1">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded bg-black/70 px-2 py-0.5 text-xs text-white">빼기</button>
                  </form>
                </figure>
              ))}
            </div>
          )}
          <div className="mb-4 flex items-center gap-3 rounded-md bg-[var(--surface-2)] p-3 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- 첫 화면 배경 미리 보기 */}
            <img src={hero.startsWith("/api/site-file/") ? hero.replace("/api/site-file/", "/api/files/") : hero} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
            <p className="min-w-0 flex-1">
              <b>첫 화면 배경</b>: {t.hero ? "고른 공업사 사진" : "기본 그림(차체 곡면)"}. 가로로 넓고 밝지 않은 외관·작업장 사진이 잘 어울립니다.
            </p>
            {t.hero && (
              <form action={setHeroAction}>
                <input type="hidden" name="id" value="" />
                <button className={buttonClass("secondary")}>기본 그림으로</button>
              </form>
            )}
          </div>
          <ShopPhotoUpload kinds={PHOTO_KINDS} full={t.photos.length >= TRUST_LIMIT.photos} />
          <p className="mt-3 text-xs text-[var(--muted)]">직원 얼굴이 나오는 사진은 그 직원에게 홈페이지에 써도 되는지 먼저 물어보세요. 손님 차 번호판이 보이면 올리지 마세요.</p>
        </Card>

        <Card title={`자격·인증 ${t.certs.length}/${TRUST_LIMIT.certs}`} help={{ kind: "panel", id: "homepage.certs" }}>
          {t.certs.length ? (
            <ul className="mb-4 divide-y divide-[var(--line)] rounded-md border border-[var(--line)] text-sm">
              {t.certs.map((c) => (
                <li key={c.id} className="flex gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-[var(--muted)]">{c.desc}</p>
                  </div>
                  <form action={removeCertAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-[var(--danger)] underline">지우기</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 없습니다. 자동차 정비업 등록, 보험사 협력 정비업체, 도료 회사 인증 같은 것이 생기면 넣으세요.</Empty>
          )}
          <AssistForm id="trust-cert" action={addCertAction} className="mt-3 space-y-4 border-t border-[var(--line)] pt-4">
            <TextField help="homepage.certName" name="name" required />
            <TextField help="homepage.certDesc" name="desc" required />
            <SubmitButton>넣기</SubmitButton>
          </AssistForm>
        </Card>
      </div>
    </>
  );
}
