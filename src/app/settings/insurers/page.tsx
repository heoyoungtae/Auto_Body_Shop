import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { aosEnabled, INSURER_KIND_LABEL, listInsurers, pctText } from "@/modules/repair/insurers";
import { AssistForm } from "../../_assist";
import { CheckGroup, SelectField, TextAreaField, TextField, NumberField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { insurerAction } from "./actions";

const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);

/** 보험사 목록·AOS 사용(AOS 보험사설정 참고, 대표 결정 2026-11-23) */
export default async function InsurersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; id?: string; new?: string }> }) {
  const { error, notice, id, new: isNew } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [list, aos] = await Promise.all([listInsurers(db), aosEnabled(db)]);
  const boss = can(user, "settings.edit");
  const desk = can(user, "claim.desk") || boss;
  const cur = id ? list.find((x) => x.id === id) : undefined;
  const editing = desk && (cur || isNew);
  return (
    <>
      <PageTitle
        help="settings.insurers"
        sub="보험 청구에서 고르는 보험사·공제조합·렌터카와 보험사별 계약 단가. AOS 사용 여부도 여기서 정합니다."
        actions={
          desk && (
            <Link href="/settings/insurers?new=1" className={buttonClass("secondary")}>
              보험사 더하기
            </Link>
          )
        }
      >
        보험사·AOS
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          {editing && (
            <Card title={cur ? `${cur.name} 고치기` : "보험사 더하기"} help={{ kind: "panel", id: "insurers.list" }}>
              <AssistForm id={`insurer-${cur?.id ?? "new"}`} action={insurerAction} className="space-y-3">
                <input type="hidden" name="id" value={cur?.id ?? ""} />
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField help="ins.name" name="name" required defaultValue={cur?.name ?? ""} />
                  <SelectField help="ins.kind" name="kind" required defaultValue={cur?.kind ?? "insurer"} options={Object.entries(INSURER_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
                  <CheckGroup help="ins.active" name="active" options={[{ value: "1", label: "고르기 목록에 보임" }]} defaultChecked={cur && !cur.active ? [] : ["1"]} />
                </div>
                {boss ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberField help="ins.rateWon" name="rateWon" unit="원" min={0} defaultValue={cur?.rateWon ?? null} />
                    <TextField help="ins.partsDiscount" name="partsDiscount" inputMode="decimal" defaultValue={pctText(cur?.partsDiscountX10)} />
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="rateWon" value={cur?.rateWon ?? ""} />
                    <input type="hidden" name="partsDiscount" value={pctText(cur?.partsDiscountX10)} />
                    <p className="text-sm text-[var(--muted)]">
                      시간당 공임 {won(cur?.rateWon)} · 부품 할인율 {cur?.partsDiscountX10 != null ? `${pctText(cur.partsDiscountX10)}%` : "—"} (대표만 바꿉니다)
                    </p>
                  </>
                )}
                <TextAreaField help="ins.contacts" name="contacts" rows={3} defaultValue={(cur?.contacts ?? []).map((c) => [c.name, c.role, c.phone, c.email].filter(Boolean).join(", ")).join("\n")} />
                <TextField help="ins.note" name="note" defaultValue={cur?.note ?? ""} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton>{cur ? "고치기" : "더하기"}</SubmitButton>
                  <Link href="/settings/insurers" className={buttonClass("secondary")}>
                    닫기
                  </Link>
                </div>
              </AssistForm>
            </Card>
          )}
          <Card title="보험사 목록" help={{ kind: "panel", id: "insurers.list" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">이름</th>
                    <th className="py-1.5 pr-2">구분</th>
                    <th className="py-1.5 pr-2 text-right">시간당 공임</th>
                    <th className="py-1.5 pr-2 text-right">부품 할인율</th>
                    <th className="py-1.5 pr-2">보상 담당자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {list.map((x) => (
                    <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                      <td className="py-1.5 pr-2">
                        {desk ? (
                          <Link href={`/settings/insurers?id=${x.id}`} className="font-medium text-[var(--accent)]">
                            {x.name}
                          </Link>
                        ) : (
                          x.name
                        )}
                        {!x.active && <Badge>안 씀</Badge>}
                      </td>
                      <td className="py-1.5 pr-2">{INSURER_KIND_LABEL[x.kind]}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{x.rateWon ? won(x.rateWon) : <span className="text-[var(--muted)]">기준표 값</span>}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{x.partsDiscountX10 != null ? `${pctText(x.partsDiscountX10)}%` : "—"}</td>
                      <td className="py-1.5 pr-2 text-xs">{x.contacts.map((c) => `${c.name}${c.phone ? ` ${c.phone}` : ""}`).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card title="AOS 사용" help={{ kind: "panel", id: "insurers.aos" }}>
          <p className="text-sm">
            지금: <Badge tone={aos ? "ok" : "neutral"}>{aos ? "AOS 씀" : "AOS 안 씀"}</Badge>
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">켜면 보험 청구 화면에 &lsquo;AOS 진행&rsquo; 칸(선견적 전송·지불보증·청구 전송·종결)이 생기고, 보내는 것을 잊지 않게 할 일에 알려 줍니다. 꺼도 앱은 모두 그대로 쓸 수 있습니다.</p>
          {boss && (
            <form action={insurerAction} className="mt-3">
              <input type="hidden" name="intent" value="aos" />
              <input type="hidden" name="enabled" value={aos ? "0" : "1"} />
              <SubmitButton variant={aos ? "secondary" : "primary"}>{aos ? "AOS 씀 끄기" : "AOS 씀 켜기"}</SubmitButton>
            </form>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">
            AOS 지급 조회 엑셀로 입금을 맞추려면{" "}
            <Link href="/claims/aos-paid" className="text-[var(--accent)]">
              AOS 지급 엑셀 맞추기
            </Link>
            로 갑니다.
          </p>
        </Card>
      </div>
    </>
  );
}
