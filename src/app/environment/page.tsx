import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import {
  envAspectCount,
  envMonth,
  filterStatus,
  wasteLedger,
  wasteStock,
  wasteVendors,
} from "@/modules/safety/environment";
import {
  ENV_EVENTS,
  WASTE_GROUP,
  WASTE_ITEMS,
  type EnvEventKind,
  type WasteItem,
} from "@/modules/safety/env-rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { DateField, RadioRow, SelectField, TextField } from "../_input";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../_ui";
import { envAction } from "./actions";

const shift = (ym: string, d: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return t.toISOString().slice(0, 7);
};

/** 환경 관리(STD-10): 방지시설 운영 일지(F-10-01) · 폐기물 관리대장(F-10-02) · 환경측면 */
export default async function EnvironmentPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate(new Date());
  const thisYm = today.slice(0, 7);
  const ym =
    q.ym && /^\d{4}-\d{2}$/.test(q.ym) && q.ym <= thisYm ? q.ym : thisYm;
  const manage = can(user, "safety.manage");
  const field = can(user, "equip.check");
  const [m, filters, stock, ledger, vendors, aspects, p] = await Promise.all([
    envMonth(db, ym),
    filterStatus(db),
    wasteStock(db),
    wasteLedger(db, ym),
    wasteVendors(db),
    envAspectCount(db),
    loadPolicy(db, today),
  ]);
  const itemOptions = (
    Object.entries(WASTE_ITEMS) as [
      WasteItem,
      (typeof WASTE_ITEMS)[WasteItem],
    ][]
  ).map(([value, x]) => ({
    value,
    label: `${x.label} (${WASTE_GROUP[x.group]})`,
  }));
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="ym" value={ym} />
    </>
  );
  return (
    <>
      <PageTitle
        help="environment"
        sub="도장 배출(VOC·먼지)은 방지시설을 켜고만 작업하고 교체·측정을 기록합니다. 폐기물은 품목별로 발생과 위탁 인계를 적고, 지정폐기물은 보관 한도 전에 위탁합니다."
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/environment?ym=${shift(ym, -1)}`}
              className="text-[var(--accent)]"
            >
              ← {shift(ym, -1)}
            </Link>
            <span className="font-medium">{ym}</span>
            {ym < thisYm && (
              <Link
                href={`/environment?ym=${shift(ym, 1)}`}
                className="text-[var(--accent)]"
              >
                {shift(ym, 1)} →
              </Link>
            )}
          </div>
        }
      >
        환경 관리
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <p className="mb-3 text-sm">
        {ym} · 부스 가동 {m.days}일 · 도료·시너 {m.paintL}L · 지정폐기물 발생{" "}
        {ledger.genDesignated}kg · 위탁 {ledger.out}kg
      </p>

      {manage && !aspects && (
        <AssistForm
          id="env-aspects"
          action={envAction}
          guard={false}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-[var(--accent-soft)] p-3"
        >
          {hidden("aspects")}
          <p className="text-sm">
            환경측면(배출물·폐기물·에너지)이 아직 리스크·기회 대장에 없습니다.
            공정별 초안 6건을 넣고 점수를 맞추세요(STD-10 4절).
          </p>
          <SubmitButton>환경측면 초안 넣기</SubmitButton>
        </AssistForm>
      )}

      <div id="ops" />
      <Card
        title="방지시설 운영(F-10-01)"
        help={{ kind: "panel", id: "env.ops" }}
      >
        {filters.length ? (
          <ul className="mb-3 space-y-1 text-sm">
            {filters.map((f) => (
              <li
                key={f.booth.id}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-medium">{f.booth.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  필터 마지막 교체 {f.last ?? "기록 없음"}
                </span>
                {f.nextDue && (
                  <Badge
                    tone={
                      f.nextDue < today
                        ? "danger"
                        : f.nextDue <= today
                          ? "warn"
                          : "neutral"
                    }
                  >
                    다음 {f.nextDue}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-[var(--muted)]">
            설비 대장에 도장 부스가 없습니다. 설비 대장에 부스를 등록하면 운전
            일지가 여기에 모입니다.
          </p>
        )}
        {field && (
          <AssistForm
            id="env-event"
            action={envAction}
            className="grid gap-3 rounded-md border border-[var(--line)] p-3 md:grid-cols-2"
          >
            {hidden("event")}
            <div className="md:col-span-2">
              <RadioRow
                help="env.kind"
                name="kind"
                required
                defaultValue="filter"
                options={(
                  Object.entries(ENV_EVENTS) as [EnvEventKind, string][]
                )
                  .filter(([k]) => manage || k !== "measure")
                  .map(([value, label]) => ({ value, label }))}
              />
            </div>
            <SelectField
              help="env.equipmentId"
              name="equipmentId"
              defaultValue={filters.length === 1 ? filters[0].booth.id : ""}
              placeholder="부스 고르기"
              options={filters.map((f) => ({
                value: f.booth.id,
                label: f.booth.name,
              }))}
            />
            <DateField
              help="env.on"
              name="on"
              required
              defaultValue={today}
              quick={["today"]}
            />
            <TextField help="env.detail" name="detail" />
            <TextField help="env.wasteKg" name="wasteKg" inputMode="decimal" />
            {manage && (
              <div className="md:col-span-2">
                <TextField help="env.result" name="result" />
              </div>
            )}
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              필터·활성탄을 바꾸면 다음 교체일이 {p["env.filter_change_days"]}일
              뒤로 정해집니다(차압이 기준을 넘으면 그 전에 바꿉니다). 일일 가동
              시각·차압·필터 상태·도료 사용량은 설비의 운전 일지에 적습니다.
            </p>
            <div className="md:col-span-2">
              <SubmitButton>기록</SubmitButton>
            </div>
          </AssistForm>
        )}
        <h3 className="mt-4 mb-1 text-sm font-semibold">{ym} 운영 일지</h3>
        {m.logs.length || m.events.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[var(--muted)]">
                <tr>
                  <th className="py-1 pr-2">날</th>
                  <th className="pr-2">구분</th>
                  <th className="pr-2">내용</th>
                  <th>기록</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {[
                  ...m.logs.map(({ l, by }) => ({
                    key: l.id,
                    on: l.logDate,
                    kind: `운전(${m.booths.find((b) => b.id === l.equipmentId)?.name ?? "부스"})`,
                    text: [
                      l.data.start && l.data.end
                        ? `${l.data.start}~${l.data.end}`
                        : null,
                      l.data.filterPa && `차압 ${l.data.filterPa}Pa`,
                      l.data.filterState && `필터 ${l.data.filterState}`,
                      l.data.paintL && `도료 ${l.data.paintL}L`,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    by,
                  })),
                  ...m.events.map(({ e, by }) => ({
                    key: e.id,
                    on: e.on,
                    kind: ENV_EVENTS[e.kind as EnvEventKind],
                    text: [
                      e.detail,
                      e.result && `결과: ${e.result}`,
                      e.nextDue && `다음 ${e.nextDue}`,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    by,
                  })),
                ]
                  .sort((a, b) => a.on.localeCompare(b.on))
                  .map((r) => (
                    <tr key={r.key}>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {r.on.slice(5)}
                      </td>
                      <td className="pr-2 whitespace-nowrap">{r.kind}</td>
                      <td className="pr-2">{r.text || "-"}</td>
                      <td className="whitespace-nowrap">{r.by ?? "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">이달 기록이 없습니다.</p>
        )}
        <div className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
          {m.sign ? (
            <p className="text-[var(--muted)]">
              {fmtTime(m.sign.at)} 확인 서명: {m.sign.summary}
              {m.sign.note && ` · ${m.sign.note}`}
            </p>
          ) : manage && ym < thisYm ? (
            <AssistForm
              id={`env-sign-${ym}`}
              action={envAction}
              className="flex flex-wrap items-end gap-3"
            >
              {hidden("sign")}
              <input type="hidden" name="signYm" value={ym} />
              <div className="min-w-60 flex-1">
                <TextField help="env.signNote" name="signNote" />
              </div>
              <SubmitButton>{ym} 확인 서명</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-[var(--muted)]">
              월 확인 서명은 다음 달 5일까지 안전환경 담당이 합니다.
            </p>
          )}
        </div>
      </Card>

      <div id="waste" />
      <Card title="폐기물 보관 현황" help={{ kind: "panel", id: "env.stock" }}>
        {stock.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="py-1 pr-2">품목</th>
                <th className="pr-2">보관량</th>
                <th>보관 시작·한도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {stock.map((s) => (
                <tr key={s.item}>
                  <td className="py-1.5 pr-2">
                    {WASTE_ITEMS[s.item].label}{" "}
                    {s.designated && <Badge tone="warn">지정</Badge>}
                  </td>
                  <td className="pr-2">{s.stock}kg</td>
                  <td className="text-xs">
                    {s.since ? `${s.since}부터` : "-"}{" "}
                    {s.left != null && (
                      <Badge
                        tone={
                          s.left < 0
                            ? "danger"
                            : s.left <= p["waste.alert_days"]
                              ? "warn"
                              : "ok"
                        }
                      >
                        {s.left < 0 ? `${-s.left}일 지남` : `${s.left}일 남음`}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>아직 폐기물 기록이 없습니다.</Empty>
        )}
        <p className="mt-2 text-xs text-[var(--muted)]">
          지정폐기물은 첫 발생분부터 {p["waste.designated_days"]}일 안에
          위탁합니다(먼저 낸 것 먼저 처리로 계산). 한도 {p["waste.alert_days"]}
          일 전부터 알림이 갑니다.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {field && (
          <Card title="발생 기록" help={{ kind: "panel", id: "env.gen" }}>
            <AssistForm
              id="waste-gen"
              action={envAction}
              className="grid gap-3"
            >
              {hidden("gen")}
              <SelectField
                help="waste.item"
                name="item"
                required
                placeholder="품목 고르기"
                options={itemOptions}
              />
              <TextField
                help="waste.qty"
                name="qty"
                required
                inputMode="decimal"
              />
              <DateField
                help="waste.on"
                name="on"
                required
                defaultValue={today}
                quick={["today"]}
              />
              <TextField help="waste.note" name="note" />
              <div>
                <SubmitButton>발생 기록</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}
        {manage && (
          <Card title="위탁 인계" help={{ kind: "panel", id: "env.out" }}>
            {vendors.length ? (
              <AssistForm
                id="waste-out"
                action={envAction}
                className="grid gap-3"
              >
                {hidden("out")}
                <SelectField
                  help="waste.item"
                  name="item"
                  required
                  placeholder="품목 고르기"
                  options={itemOptions.filter((o) =>
                    stock.some((s) => s.item === o.value && s.stock > 0),
                  )}
                />
                <TextField
                  help="waste.qty"
                  name="qty"
                  required
                  inputMode="decimal"
                />
                <DateField
                  help="waste.outOn"
                  name="on"
                  required
                  defaultValue={today}
                  quick={["today"]}
                />
                <SelectField
                  help="waste.supplierId"
                  name="supplierId"
                  required
                  defaultValue={vendors.length === 1 ? vendors[0].id : ""}
                  placeholder="위탁 업체 고르기"
                  from={
                    vendors.length === 1 ? "등록된 유일한 위탁 업체" : undefined
                  }
                  options={vendors.map((v) => ({
                    value: v.id,
                    label: `${v.name}${v.docs.includes("license") ? "" : " (허가증 확인 없음)"}`,
                  }))}
                />
                <TextField help="waste.slipNo" name="slipNo" />
                <TextField help="waste.note" name="note" />
                <div>
                  <SubmitButton>인계 기록</SubmitButton>
                </div>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                등록된 폐기물 위탁 업체가 없습니다.{" "}
                <Link href="/suppliers/new" className="text-[var(--accent)]">
                  협력업체에서 '폐기물 위탁' 업체를 허가증과 함께 등록
                </Link>
                하세요(STD-10 6.3).
              </p>
            )}
          </Card>
        )}
      </div>

      <Card
        title={`${ym} 폐기물 관리대장(F-10-02)`}
        help={{ kind: "panel", id: "env.ledger" }}
      >
        {ledger.rows.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="py-1 pr-2">날</th>
                <th className="pr-2">구분</th>
                <th className="pr-2">품목</th>
                <th className="pr-2">양</th>
                <th className="pr-2">위탁 업체·전자인계</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {ledger.rows.map(({ w, by, sup }) => (
                <tr key={w.id}>
                  <td className="py-1 pr-2">{w.on.slice(5)}</td>
                  <td className="pr-2">
                    {w.kind === "gen" ? "발생" : <Badge tone="ok">인계</Badge>}
                  </td>
                  <td className="pr-2">
                    {WASTE_ITEMS[w.item as WasteItem]?.label ?? w.item}
                  </td>
                  <td className="pr-2">{w.qty}kg</td>
                  <td className="pr-2">
                    {w.kind === "out"
                      ? `${sup ?? "-"}${w.slipNo ? ` · ${w.slipNo}` : ""}`
                      : (w.note ?? "")}
                  </td>
                  <td>{by ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>이달 기록이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
