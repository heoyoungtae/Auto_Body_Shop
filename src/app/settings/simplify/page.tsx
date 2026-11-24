import Link from "next/link";
import { getDb } from "@/db/runtime";
import { simplifyOverview } from "@/modules/platform/simplify";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { SubmitButton } from "../../_submit";
import { simplifyAction } from "../actions";

/** 간소화(대표 2026-11-24): 업무를 줄이는 설정을 한곳에서 켜고 끈다. 끄면 표준서 원래 절차대로 전부 기록한다 */
export default async function SimplifyPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const { items, mode } = await simplifyOverview(await getDb());
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
                <dd>{i.saves}(수리 한 건 기준, 추정)</dd>
              </dl>
            </Card>
          </li>
        ))}
      </ol>
      {!owner && <p className="mt-4 text-sm text-[var(--muted)]">간소화는 대표만 켜고 끕니다.</p>}
    </>
  );
}
