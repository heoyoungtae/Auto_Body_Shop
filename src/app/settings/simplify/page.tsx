import Link from "next/link";
import { getDb } from "@/db/runtime";
import { simplifyOverview } from "@/modules/platform/simplify";
import { FEATURES, featuresOff } from "@/modules/platform/features";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { SubmitButton } from "../../_submit";
import { simplifyAction } from "../actions";

/** 간소화(대표 2026-11-24): 업무를 줄이는 설정을 한곳에서 켜고 끈다. 끄면 표준서 원래 절차대로 전부 기록한다 */
export default async function SimplifyPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const db = await getDb();
  const { items, mode } = await simplifyOverview(db);
  const off = await featuresOff(db);
  const onCount = items.filter((i) => i.value === 1).length;
  return (
    <>
      <PageTitle help="settings.simplify" sub="직원이 앱에서 누르고 적는 일을 줄이는 설정입니다. 켜면 간편, 끄면 표준서 원래 절차대로 전부 기록합니다.">
        간소화
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <Card title="한 번에 고르기" help={{ kind: "panel", id: "simplify.mode" }}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            지금: <Badge tone={mode === "simple" ? "ok" : mode === "standard" ? "neutral" : "accent"}>{mode === "simple" ? "간편 모드" : mode === "standard" ? "표준(전부 기록)" : "직접 고름"}</Badge> · 켠 항목 {onCount}/{items.length}
          </span>
          {owner && (
            <>
              <form action={simplifyAction}>
                <input type="hidden" name="intent" value="simple" />
                <SubmitButton variant={mode === "simple" ? "secondary" : "primary"}>소규모 공업사 간편 모드(권장)</SubmitButton>
              </form>
              <form action={simplifyAction}>
                <input type="hidden" name="intent" value="standard" />
                <SubmitButton variant="secondary">표준(모두 끄기)</SubmitButton>
              </form>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">법으로 정한 것(법정 견적서·정비명세서 발급, 개인정보 필수 동의, 위험성평가)은 여기서 끌 수 없습니다. 바꾸면 오늘부터 적용되고 정책값 이력·감사 로그에 남습니다.</p>
      </Card>
      <ol className="mt-4 space-y-3">
        {items.map((i, n) => (
          <li key={i.key}>
            <Card
              help={{ kind: "policy", id: i.key, title: i.title }}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {n + 1}. {i.title}
                  </span>
                  <Badge tone={i.value === 1 ? "ok" : "neutral"}>{i.value === 1 ? "켬" : "끔"}</Badge>
                </span>
              }
              actions={
                owner ? (
                  <form action={simplifyAction}>
                    <input type="hidden" name="intent" value="one" />
                    <input type="hidden" name="key" value={i.key} />
                    <input type="hidden" name="on" value={i.value === 1 ? "0" : "1"} />
                    <SubmitButton variant={i.value === 1 ? "secondary" : "primary"}>{i.value === 1 ? "끄기" : "켜기"}</SubmitButton>
                  </form>
                ) : undefined
              }
            >
              <dl className="grid gap-x-4 gap-y-1 text-sm md:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="text-[var(--muted)]">켜면</dt>
                <dd>{i.on}</dd>
                <dt className="text-[var(--muted)]">끄면</dt>
                <dd>{i.off}</dd>
                <dt className="text-[var(--muted)]">표준서·법</dt>
                <dd>
                  {i.conflict}
                  {i.std && (
                    <>
                      {" "}
                      <Link href={`/std/${i.std.slice(4)}`} className="text-[var(--accent)] hover:underline">
                        {i.std} 보기
                      </Link>
                    </>
                  )}
                </dd>
                <dt className="text-[var(--muted)]">줄어드는 일</dt>
                <dd>{i.saves}, 추정</dd>
              </dl>
            </Card>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <Card title="안 쓰는 기능 끄기" help={{ kind: "panel", id: "simplify.features" }}>
          <p className="mb-3 text-sm text-[var(--muted)]">끄면 사이드 메뉴·메뉴 찾기에서 숨기고, 그 기능의 할 일·알림·대시보드 줄·보고서와 자동 발송도 멈춥니다. 기록은 지우지 않고, 다시 켜면 그대로 돌아옵니다. 법정 서류·수리 흐름에 꼭 필요한 화면은 목록에 없어 끌 수 없습니다. &apos;간편 모드에서 끔&apos; 표시는 위 간편 모드 단추를 누르면 함께 꺼집니다.</p>
          <p className="mb-3 text-sm text-[var(--muted)]">
            고객용 내 차 수첩은{" "}
            <Link href="/settings/carbook" className="text-[var(--accent)] hover:underline">
              설정 › 내 차 수첩
            </Link>
            에서 켜고 끕니다.
          </p>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {FEATURES.map((f) => {
              const on = !off.includes(f.key);
              return (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{f.title}</b> <Badge tone={on ? "ok" : "neutral"}>{on ? "씀" : "꺼 둠"}</Badge>
                    {f.simple && <span className="ml-1 text-xs text-[var(--muted)]">간편 모드에서 끔</span>}
                    <span className="block text-xs text-[var(--muted)]">{f.note}</span>
                  </span>
                  {owner && (
                    <form action={simplifyAction}>
                      <input type="hidden" name="intent" value="feature" />
                      <input type="hidden" name="key" value={f.key} />
                      <input type="hidden" name="on" value={on ? "0" : "1"} />
                      <SubmitButton variant="secondary">{on ? "끄기" : "다시 켜기"}</SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      {!owner && <p className="mt-4 text-sm text-[var(--muted)]">간소화는 대표만 켜고 끕니다.</p>}
    </>
  );
}
