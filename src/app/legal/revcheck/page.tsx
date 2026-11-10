import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listLegal } from "@/modules/quality/legal";
import { lawSearchUrl } from "@/modules/quality/legal-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, RadioRow, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { legalAction } from "../actions";

const quarterStart = (today: string) =>
  `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;

/** 분기 법령 개정 확인(Q.6 3): 이번 분기에 아직 확인하지 않은 항목을 한꺼번에 기록 */
export default async function LegalRevCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate(new Date());
  const qs = quarterStart(today);
  const { list } = await listLegal(db, user, "all");
  const left = list.filter(
    (x) => x.applies !== "no" && (!x.revCheckedOn || x.revCheckedOn < qs),
  );
  const done = list.filter(
    (x) => x.applies !== "no" && x.revCheckedOn && x.revCheckedOn >= qs,
  ).length;
  return (
    <>
      <PageTitle
        help="legal.revcheck"
        sub={`이번 분기(${qs}부터) 확인 끝 ${done}건 · 남음 ${left.length}건. 국가법령정보센터에서 최근 개정 이력을 보고, 바뀐 것이 없으면 여러 건을 한 번에 기록합니다.`}
        actions={
          <Link href="/legal" className="text-sm text-[var(--accent)]">
            ← 법규 대장
          </Link>
        }
      >
        분기 법령 개정 확인
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!can(user, "legal.manage") ? (
        <p className="text-sm text-[var(--muted)]">
          개정 확인은 안전환경 담당·대표가 합니다.
        </p>
      ) : left.length ? (
        <Card
          title="확인할 항목"
          help={{ kind: "panel", id: "legal.revcheck" }}
        >
          <ul className="mb-3 space-y-1 text-sm">
            {left.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-2">
                <span className="font-medium">{x.lawName}</span>
                <span className="text-xs text-[var(--muted)]">
                  마지막 확인 {x.revCheckedOn ?? "없음"}
                </span>
                <a
                  href={lawSearchUrl(x.lawName)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)]"
                >
                  개정 이력 보기 ↗
                </a>
              </li>
            ))}
          </ul>
          <AssistForm
            id="legal-revcheck"
            action={legalAction}
            className="grid gap-3"
          >
            <input type="hidden" name="intent" value="revcheck" />
            <input type="hidden" name="back" value="/legal/revcheck" />
            <CheckGroup
              help="legal.revIds"
              name="ids"
              options={left.map((x) => ({ value: x.id, label: x.lawName }))}
              defaultChecked={left.map((x) => x.id)}
            />
            <RadioRow
              help="legal.changed"
              name="changed"
              required
              defaultValue="0"
              options={[
                { value: "0", label: "개정 없음", tone: "ok" },
                { value: "1", label: "개정 있음", tone: "warn" },
              ]}
            />
            <TextAreaField help="legal.revNote" name="revNote" rows={2} />
            <div>
              <SubmitButton>고른 항목 확인 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <Empty>이번 분기 개정 확인을 모두 마쳤습니다.</Empty>
      )}
    </>
  );
}
