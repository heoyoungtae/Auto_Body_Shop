import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { DELEGATION_HELP, GLOSSARY, POLICY_HELP } from "@/modules/help/glossary";
import { PAGE_HELP, ROLE_START, ROUTE_HELP } from "@/modules/help/pages";
import { DEFAULT_DELEGATION, type DelegationTask } from "@/modules/platform/delegation";
import { DEFAULT_POLICY, type PolicyKey } from "@/modules/platform/policy";
import { requireUser } from "../_lib/session";
import { Card, PageTitle } from "../_ui";
import { HelpSearch, type HelpItem } from "./help-search";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await requireUser();
  const hrefOf = Object.fromEntries(Object.entries(ROUTE_HELP).map(([route, key]) => [key, route.includes("[") ? null : route]));
  const items: HelpItem[] = [
    ...Object.entries(PAGE_HELP).map(([k, h]) => {
      const x = h as typeof h & { tips?: string[]; faq?: { q: string; a: string }[] };
      return {
        kind: "화면",
        title: h.title,
        body: [h.purpose, ...h.steps.map((s, i) => `${i + 1}. ${s}`), ...(x.tips ?? []), ...(x.faq ?? []).map((f) => `Q. ${f.q} A. ${f.a}`)].join("\n"),
        href: hrefOf[k] ?? undefined,
      };
    }),
    ...Object.entries(GLOSSARY).map(([t, d]) => ({ kind: "용어", title: t, body: d })),
    ...(Object.keys(POLICY_HELP) as PolicyKey[]).map((k) => ({
      kind: "정책값",
      title: `${DEFAULT_POLICY[k].label} (부록 D ${DEFAULT_POLICY[k].clause})`,
      body: `${POLICY_HELP[k]} 표준서 제안값 ${DEFAULT_POLICY[k].value.toLocaleString("ko-KR")} ${DEFAULT_POLICY[k].unit}.`,
      href: `/settings/policies?key=${k}`,
    })),
    ...(Object.keys(DELEGATION_HELP) as DelegationTask[]).map((t) => ({ kind: "전결", title: DEFAULT_DELEGATION[t].label, body: DELEGATION_HELP[t], href: "/settings/delegation" })),
  ];
  const mine = user.roles.length ? user.roles : (["advisor"] as Role[]);
  return (
    <>
      <PageTitle help="help" sub="화면 사용법, 용어, 정책값·전결 설명을 한곳에서 찾습니다.">
        도움말 센터
      </PageTitle>
      <div className="space-y-4">
        <Card title="처음 할 일(내 역할)" help={{ kind: "panel", id: "help.start" }}>
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((r) => (
              <div key={r}>
                <h3 className="mb-1 text-sm font-semibold">{ROLE_LABEL[r]}</h3>
                <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                  {(ROLE_START[r] ?? []).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[var(--accent)]">다른 역할도 보기</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(Object.keys(ROLE_START) as Role[])
                .filter((r) => !mine.includes(r))
                .map((r) => (
                  <div key={r}>
                    <h3 className="mb-1 font-semibold">{ROLE_LABEL[r]}</h3>
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {ROLE_START[r].map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                ))}
            </div>
          </details>
        </Card>
        <Card title="입력 도우미 쓰는 법" help={{ kind: "panel", id: "help.howto" }}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>칸 이름 옆 <b>필수</b>는 꼭 적어야 하는 칸, <b>선택</b>은 비워도 되는 칸입니다.</li>
            <li>화면 제목·패널 제목·칸 이름 옆 <b>?</b> 를 누르면 오른쪽에 도움말 창이 열립니다. 창을 연 채로 계속 입력할 수 있고, 다시 누르거나 Esc 로 닫습니다.</li>
            <li><b>○○에서 불러옴</b> 표시는 앞선 문서나 설정에서 값을 끌어온 칸입니다. 바뀐 것만 고치면 됩니다.</li>
            <li><b>문구 넣기</b> 단추는 자주 쓰는 문장을 칸에 넣어 줍니다. 넣은 뒤 빈 곳만 채우세요.</li>
            <li>금액 칸은 쉼표가 저절로 들어가고 아래에 한글로 읽어 줍니다(예: 150만 원).</li>
            <li>날짜 칸 아래 단추(오늘·내일·1주 뒤…)로 바로 고를 수 있고, 요일과 며칠 뒤인지 보여 줍니다.</li>
            <li>저장이 거절되면 적었던 내용이 그대로 남아 있으니 빨간 안내만 고치면 됩니다.</li>
            <li>긴 양식은 적는 중 이 기기에 임시 저장되어, 창을 닫았다 와도 &lsquo;되살리기&rsquo;로 이어 쓸 수 있습니다.</li>
          </ul>
        </Card>
        <HelpSearch key={q ?? ""} items={items} initial={q} />
      </div>
    </>
  );
}
