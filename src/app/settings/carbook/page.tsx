// 설정 › 내 차 수첩(고객용 차계부): 켜기·끄기, 영업시간·안내문, 쓰는 고객 수. 정비소 이름·전화·주소는 사업장 정보에서 불러온다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { carbookConfig, carbookStats, shopCard } from "@/modules/carbook/service";
import { appUrl } from "@/modules/customer/service";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { CheckGroup, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { saveCarbookAction } from "./actions";

export default async function CarbookSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const [cfg, stats, shop] = await Promise.all([carbookConfig(db), carbookStats(db), shopCard(db)]);
  return (
    <>
      <PageTitle
        help="settings.carbook"
        sub="고객이 휴대폰으로 수리 기록·사진·서류·보증을 보는 '내 차 수첩'입니다. 고객은 문자 인증으로 들어오고 비밀번호가 없습니다."
        actions={
          <Link href="/my/login" target="_blank" className={buttonClass("secondary")}>
            고객 화면 열기
          </Link>
        }
      >
        내 차 수첩
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <Card title="켜기·안내" help={{ kind: "panel", id: "carbook.settings" }}>
          <AssistForm id="carbook-settings" action={saveCarbookAction} className="space-y-4">
            <CheckGroup help="carbook.enabled" name="enabled" options={[{ value: "on", label: "고객이 내 차 수첩을 쓸 수 있게 켜기" }]} defaultChecked={cfg.enabled ? ["on"] : []} />
            <TextField help="carbook.hours" name="hours" defaultValue={cfg.hours} />
            <TextAreaField help="carbook.notice" name="notice" defaultValue={cfg.notice} rows={2} />
            <p className="text-xs text-[var(--muted)]">
              고객 화면에 보이는 정비소: {shop.name} · {shop.phone || "전화 없음"} · {shop.address || "주소 없음"} —{" "}
              <Link href="/settings/shop" className="text-[var(--accent)] underline">
                사업장 정보에서 고치기
              </Link>
            </p>
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
        </Card>
        <Card title="쓰는 고객" help={{ kind: "panel", id: "carbook.stats" }}>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-[var(--muted)]">문자 인증한 고객</dt>
            <dd>{stats.users}명</dd>
            <dt className="text-[var(--muted)]">최근 30일 들어온 고객</dt>
            <dd>{stats.recent}명</dd>
            <dt className="text-[var(--muted)]">고객 주소</dt>
            <dd className="break-all font-mono text-xs">{appUrl()}/my</dd>
          </dl>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
            <li>출고 안내 알림톡에 링크가 저절로 들어갑니다(그 수리 건만 보임, {stats.linkDays}일 유효).</li>
            <li>다른 고객은 고객 화면의 &lsquo;내 차 수첩&rsquo; 칸에서 [초대 문자 보내기]로 부릅니다.</li>
            <li>고객에게 보일 사진은 수리 건 화면의 &lsquo;고객에게 보일 사진&rsquo;에서 고릅니다.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
