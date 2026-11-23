"use client";
// 테크베이 작업 내용 확인 표(대표 결정 2026-11-22). 줄마다 풀이 결과를 보여 주고, 직원이 고른 것으로 바로 다시 풀어 본다.
// ✓ 알아봄 · △ 확인 필요(좌우·앞뒤 모름, 덴트·광택) · ✕ 못 알아봄. 남은 줄이 없어야 '확인 마치고 입고 시작'이 켜진다.
// 서버(confirmTechbayCheck)가 같은 규칙(techbay-items)으로 다시 확인한다.
import { useMemo, useState } from "react";
import type { CarLook } from "@/modules/repair/body-map";
import { partLabel } from "@/modules/repair/body-map";
import { ZONE_KIND_LABEL, type ZoneKind } from "@/modules/repair/damage-text";
import { checkCount, NOT_OURS, parseLine, REQ_METHOD_LABEL, resolveCheck, type LineDecision, type Word, wordFrom, zonesOfCheck } from "@/modules/partner/techbay-items";
import { HelpButton } from "../../../_help-drawer";
import { CarMap, type MapPin, PinIcon, type PinShape } from "../../../repairs/car-map";
import { SubmitButton } from "../../../_submit";
import { Badge, Button, Card } from "../../../_ui";

const KINDS: Record<ZoneKind, { color: string; shape: PinShape }> = {
  D: { color: "#dc2626", shape: "circle" },
  S: { color: "#ea580c", shape: "square" },
  C: { color: "#7c3aed", shape: "diamond" },
  R: { color: "#92400e", shape: "hexagon" },
  W: { color: "#0f766e", shape: "rounded" },
};
const SPOT = [4, 3, 5, 1, 7, 0, 2, 6, 8];
const circledNo = (n: number) => (n >= 1 && n <= 20 ? "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"[n - 1] : `(${n})`);

type D = LineDecision & { remember?: boolean };

export function TechbayCheckForm({ consultId, items, words, car, action }: { consultId: string; items: { type: string; content: string }[]; words: Word[]; car: CarLook; action: (f: FormData) => Promise<void> }) {
  const [dec, setDec] = useState<Record<number, D>>({});
  const set = (no: number, patch: Partial<D>) => setDec((d) => ({ ...d, [no]: { ...d[no], ...patch } }));
  const res = useMemo(() => resolveCheck(items, dec, words, car.body), [items, dec, words, car.body]);
  const parsed = useMemo(() => items.map((it, i) => parseLine(i + 1, it.type, it.content, { read: dec[i + 1]?.read?.trim() || undefined, words, body: car.body })), [items, dec, words, car.body]);
  const count = checkCount(res.lines);
  // 그림 번호 = 손상 부위 줄의 순서(상담 손상 부위 글의 ①②와 같음)
  const numOf = new Map<number, number>();
  let n = 0;
  for (const l of res.lines) if (!l.skip && l.items.length) numOf.set(l.no, ++n);
  const used = new Map<string, number>();
  const pins: MapPin[] = res.lines.flatMap((l) =>
    l.skip
      ? []
      : l.items.flatMap((it) => {
          const z = zonesOfCheck([{ ...l, items: [it] }], car.body)[0];
          if (!z) return [];
          const k = used.get(z.part) ?? 0;
          used.set(z.part, k + 1);
          const no = numOf.get(l.no) ?? 0;
          return [{ key: `${l.no}-${it.part}-${it.kind}`, part: z.part, view: z.view, cell: SPOT[k % SPOT.length], color: KINDS[it.kind].color, shape: KINDS[it.kind].shape, text: String(no), title: `${circledNo(no)} ${partLabel(it.part)} · ${ZONE_KIND_LABEL[it.kind]}` }];
        }),
  );
  const openOf = new Map(res.open.map((o) => [o.no, o.why]));

  return (
    <form action={action} className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
      <input type="hidden" name="consultId" value={consultId} />
      <input type="hidden" name="lines" value={items.length} />
      <Card title="작업 항목 줄마다 확인" help={{ kind: "panel", id: "tb.check" }}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <b>
            작업 항목 {count.total}줄 = 손상 부위 {count.damage} + 기타 요구 {count.other}
          </b>
          {res.open.length ? <Badge tone="warn">남은 줄 {res.open.length}</Badge> : <Badge tone="ok">모두 정리됨</Badge>}
        </div>
        <ol className="divide-y divide-[var(--line)]">
          {items.map((it, i) => {
            const no = i + 1;
            const d = dec[no] ?? {};
            const p = parsed[i];
            const line = res.lines[i];
            const why = openOf.get(no);
            const notOurs = !!p.method && NOT_OURS.includes(p.method);
            const changed = !!d.read?.trim() && d.read.trim() !== it.content;
            const word = changed && !d.skip && p.items.length ? wordFrom(it.content, p.items) : null;
            const mark = d.skip ? "—" : why ? (p.items.length || p.ask.side || p.ask.fr ? "△" : "✕") : "✓";
            const tone = d.skip ? "neutral" : why ? (mark === "✕" ? "danger" : "warn") : "ok";
            const prefix = (w: string) => set(no, { read: `${w} ${it.content}`, skip: false });
            return (
              <li key={no} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <Badge tone={tone}>
                    {mark} {no}
                  </Badge>
                  <p className="min-w-0 flex-1 text-sm">
                    {it.type && <span className="mr-1 text-[var(--muted)]">[{it.type}]</span>}
                    {it.content}
                  </p>
                </div>
                {!d.skip && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {line.items.length ? (
                      <>
                        {numOf.get(no) && <b>{circledNo(numOf.get(no)!)}</b>}
                        {line.items.map((x) => (
                          <span key={`${x.part}${x.kind}`} className="inline-flex items-center gap-1">
                            <PinIcon shape={KINDS[x.kind].shape} color={KINDS[x.kind].color} size={12} />
                            {partLabel(x.part)} {ZONE_KIND_LABEL[x.kind]}
                          </span>
                        ))}
                        {line.method && <span className="text-[var(--muted)]">요청: {REQ_METHOD_LABEL[line.method]}</span>}
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">부위 없음</span>
                    )}
                    {p.learned.length > 0 && <span className="text-xs text-[var(--muted)]">기억한 말로 읽음: {p.learned.join(", ")}</span>}
                  </p>
                )}
                {why && !d.skip && <p className="text-sm text-[var(--warn)]">{why}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {!d.skip && p.ask.side && (
                    <>
                      <Button type="button" variant="secondary" onClick={() => prefix("왼쪽")}>
                        왼쪽
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => prefix("오른쪽")}>
                        오른쪽
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => prefix("양쪽")}>
                        양쪽
                      </Button>
                    </>
                  )}
                  {!d.skip && p.ask.fr && (
                    <>
                      <Button type="button" variant="secondary" onClick={() => prefix("앞")}>
                        앞
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => prefix("뒤")}>
                        뒤
                      </Button>
                    </>
                  )}
                  {!d.skip && notOurs && (
                    <label className="inline-flex items-center gap-1.5 text-sm">
                      <input data-assist="grid" type="checkbox" checked={!!d.asPartial} onChange={(e) => set(no, { asPartial: e.target.checked })} />
                      판금·도장으로 받기
                    </label>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input data-assist="grid" type="checkbox" checked={!!d.skip} onChange={(e) => set(no, { skip: e.target.checked })} />
                    기타 요구로(손상 아님·하지 않음)
                  </label>
                </div>
                {!d.skip && (
                  <div className="flex items-center gap-2">
                    <input
                      data-assist="grid"
                      aria-label={`${no}번째 줄 고쳐 읽기`}
                      value={d.read ?? it.content}
                      onChange={(e) => set(no, { read: e.target.value })}
                      maxLength={300}
                      className="block w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                    />
                    <HelpButton topic={{ kind: "field", id: "tb.read" }} name="고쳐 읽기" />
                  </div>
                )}
                {word && (
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input data-assist="grid" type="checkbox" checked={!!d.remember} onChange={(e) => set(no, { remember: e.target.checked })} />
                    다음부터 &lsquo;{word.word}&rsquo;을(를) &lsquo;{word.means}&rsquo;(으)로 알아듣기
                  </label>
                )}
                <input type="hidden" name={`d${no}_read`} value={changed ? d.read!.trim() : ""} />
                <input type="hidden" name={`d${no}_skip`} value={d.skip ? "1" : ""} />
                <input type="hidden" name={`d${no}_partial`} value={d.asPartial ? "1" : ""} />
                <input type="hidden" name={`d${no}_remember`} value={word && d.remember ? "1" : ""} />
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="space-y-4 xl:sticky xl:top-[4.5rem]">
        <Card title="차 그림" help={{ kind: "panel", id: "tb.map" }}>
          <CarMap pins={pins} car={car} label="테크베이 작업 항목 손상 부위" />
          <p className="mt-2 text-xs text-[var(--muted)]">번호는 손상 부위 줄의 순서입니다. 입고 도면에는 수리할 곳(O)으로 찍히고, 진단 줄은 요청 한 줄마다 따로 만들어집니다.</p>
        </Card>
        <div className="space-y-2">
          <SubmitButton full disabled={res.open.length > 0}>
            {res.open.length ? `남은 줄 ${res.open.length}개를 먼저 정리하세요` : "확인 마치고 입고 시작"}
          </SubmitButton>
          <p className="text-xs text-[var(--muted)]">누르면 누가 언제 확인했는지 남고, 상담의 손상 부위·손상 유형·예비 판단이 채워진 뒤 수리 건이 열립니다.</p>
        </div>
      </div>
    </form>
  );
}
