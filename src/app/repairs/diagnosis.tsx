// 손상 진단(STD-02 5절) — 수리 건 화면 안의 부분. 줄마다 따로 저장하고, 공장장이 확인하면 견적 대기로 넘어간다.
import type { roDamage } from "@/db/schema";
import { type CarLook, cellsLabel } from "@/modules/repair/body-map";
import { damageSeverity, DAMAGE_KINDS, diagnosisIssues, METHODS, PAINT_LAYERS, partName, repainted, SEVERITY_LABEL } from "@/modules/repair/rules";
import { AssistForm } from "../_assist";
import { CheckGroup, NumberField, SelectField, TextAreaField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, Card } from "../_ui";
import { PhotoStrip } from "../photo-strip";
import { confirmDiagnosisAction, damageAction, removeDamagePhotoAction, uploadDamagePhotoAction } from "./actions";
import { CarMap } from "./car-map";
import { damageFills, damagePins, MethodLegend, methodColor, viewOf } from "./damage-map";
import { MethodHint } from "./method-hint";
import { PartPicker } from "./part-picker";

type Damage = typeof roDamage.$inferSelect;
const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

function DamageFields({ d, repaintUm, options, others, extra, car }: { d?: Damage; repaintUm: number; options: string[]; others: Damage[]; extra?: Record<string, string[]>; car?: CarLook }) {
  return (
    <div className="space-y-4">
      <PartPicker initial={d ? { part: d.part, view: viewOf(d), cells: d.cells } : undefined} subPart={d?.subPart} others={damageFills(others, true)} from={d?.note?.startsWith("입고 도면에서 불러옴") ? "입고 도면" : undefined} extra={extra} car={car} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <SelectField help="dmg.kind" name="kind" required defaultValue={d?.kind ?? "D"} options={opts(DAMAGE_KINDS)} />
        <NumberField help="dmg.size" name="sizeCm" unit="cm" min={0} max={500} defaultValue={d?.sizeCm ?? null} />
        <NumberField help="dmg.depth" name="depthMm" unit="mm" min={0} max={200} defaultValue={d?.depthMm ?? null} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField help="dmg.paintLayer" name="paintLayer" required defaultValue={d?.paintLayer ?? "none"} options={opts(PAINT_LAYERS)} />
        <CheckGroup
          help="dmg.flags"
          name="flags"
          options={[
            { value: "crease", label: "날카로운 꺾임·능선 변형" },
            { value: "broken", label: "찢어짐·플라스틱 파손" },
            { value: "structural", label: "보강재·프레임 의심, 간격 틀어짐" },
          ]}
          defaultChecked={[...(d?.crease ? ["crease"] : []), ...(d?.broken ? ["broken"] : []), ...(d?.structural ? ["structural"] : [])]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField help="dmg.filmPanel" name="filmPanel" defaultValue={d?.filmPanel.join(", ") ?? ""} />
        <TextField help="dmg.filmAdjacent" name="filmAdjacent" defaultValue={d?.filmAdjacent.join(", ") ?? ""} />
      </div>
      <MethodHint repaintUm={repaintUm} options={options} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField help="dmg.method" name="method" defaultValue={d && d.method !== d.suggested ? d.method : ""} placeholder="기준표 제안대로" options={opts(METHODS)} />
        <TextField help="dmg.methodReason" name="methodReason" defaultValue={d?.methodReason ?? ""} />
        <SelectField
          help="dmg.calibrate"
          name="calibrate"
          defaultValue={d ? (d.calibrate ? "1" : "0") : ""}
          placeholder="차량 사양으로 자동 판단"
          options={[
            { value: "1", label: "보정 필요" },
            { value: "0", label: "보정 필요 없음" },
          ]}
        />
      </div>
      <TextAreaField help="dmg.note" name="note" rows={2} defaultValue={d?.note ?? undefined} />
    </div>
  );
}

function Summary({ d, repaintUm }: { d: Damage; repaintUm: number }) {
  const film = [...d.filmPanel, ...d.filmAdjacent];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      <b>
        {d.seq}. {partName(d.part, d.subPart)}
      </b>
      <span className="text-[var(--muted)]">{cellsLabel(viewOf(d), d.cells)}</span>
      <span>{DAMAGE_KINDS[d.kind as keyof typeof DAMAGE_KINDS] ?? d.kind}</span>
      {d.sizeCm != null && <span className="text-[var(--muted)]">{d.sizeCm}cm</span>}
      <span className="text-[var(--muted)]">{PAINT_LAYERS[d.paintLayer as keyof typeof PAINT_LAYERS]}</span>
      <span className="text-[var(--muted)]">정도 {SEVERITY_LABEL[damageSeverity(d)]}</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-medium">
        <span className="size-2.5 rounded-full" style={{ background: methodColor(d.method) }} />
        {METHODS[d.method as keyof typeof METHODS]}
      </span>
      {d.method !== d.suggested && <Badge tone="warn">제안과 다름</Badge>}
      {d.calibrate && <Badge tone="warn">센서 보정</Badge>}
      {repainted(film, repaintUm) && <Badge tone="danger">재도장 이력</Badge>}
      {d.method !== "polish" && d.method !== "outsource" && (d.filmPanel.length < 3 || d.filmAdjacent.length < 3) && <Badge tone="warn">도막 측정 부족</Badge>}
    </span>
  );
}

export function Diagnosis({ roId, status, damages, canDiagnose, canConfirm, repaintUm, options, diagNote, photos = [], canPhoto = false, subExtras, car }: { roId: string; status: string; damages: Damage[]; canDiagnose: boolean; canConfirm: boolean; repaintUm: number; options: string[]; diagNote: string | null; photos?: { damageId: string; path: string }[]; canPhoto?: boolean; subExtras?: Record<string, string[]>; car?: CarLook }) {
  const editable = status === "checked" && canDiagnose;
  // 손상 줄 사진(가까이 찍은 것): 진단부터 검사까지 붙이고 뺄 수 있다. 견적·손님 설명에 같이 쓴다
  const photoEditable = canPhoto && ["checked", "estimating", "working", "inspecting"].includes(status);
  const linePhotos = (d: Damage) => {
    const list = photos.filter((p) => p.damageId === d.id).map((p) => p.path);
    if (!list.length && !photoEditable) return null;
    return (
      <div className="mt-2">
        <PhotoStrip fields={{ id: roId, damageId: d.id }} upload={uploadDamagePhotoAction} remove={removeDamagePhotoAction} photos={list} editable={photoEditable} label={`${d.seq}. ${partName(d.part, d.subPart)}`} />
      </div>
    );
  };
  const issues = diagnosisIssues(damages);
  return (
    <section id="diagnosis" className="space-y-4">
      <Card title="손상 진단" help={{ kind: "panel", id: "ro.diagnosis" }}>
        {damages.length > 0 && (
          <div className="mb-4">
            <CarMap label="진단한 손상 위치(색은 수리 방법)" fills={damageFills(damages)} pins={damagePins(damages)} car={car} />
            <MethodLegend />
          </div>
        )}
        {damages.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {damages.map((d) => (
              <li key={d.id} className="py-2">
                {editable ? (
                  <details>
                    <summary className="cursor-pointer">
                      <Summary d={d} repaintUm={repaintUm} />
                    </summary>
                    <AssistForm id={`dmg-${d.id}`} action={damageAction} className="mt-3 space-y-3 rounded-md border border-[var(--line)] p-3">
                      <input type="hidden" name="id" value={roId} />
                      <input type="hidden" name="damageId" value={d.id} />
                      <DamageFields d={d} repaintUm={repaintUm} options={options} others={damages.filter((x) => x.id !== d.id)} extra={subExtras} car={car} />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="intent" value="save">
                          이 줄 저장
                        </SubmitButton>
                        <SubmitButton name="intent" value="remove" variant="danger" noValidate>
                          이 줄 지우기
                        </SubmitButton>
                      </div>
                    </AssistForm>
                  </details>
                ) : (
                  <>
                    <Summary d={d} repaintUm={repaintUm} />
                    {(d.methodReason || d.note) && <p className="mt-0.5 text-xs text-[var(--muted)]">{[d.methodReason && `다른 방법 사유: ${d.methodReason}`, d.note].filter(Boolean).join(" · ")}</p>}
                  </>
                )}
                {linePhotos(d)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">아직 진단한 손상이 없습니다{editable ? ". 아래에서 부위를 넣으세요" : ""}.</p>
        )}
        {editable && (
          <details className="mt-3" open={!damages.length}>
            <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">+ 손상 부위 넣기</summary>
            <AssistForm id={`dmg-new-${roId}`} action={damageAction} className="mt-3 space-y-3 rounded-md border border-[var(--line)] p-3">
              <input type="hidden" name="id" value={roId} />
              <DamageFields repaintUm={repaintUm} options={options} others={damages} extra={subExtras} car={car} />
              <SubmitButton name="intent" value="save">
                넣기
              </SubmitButton>
            </AssistForm>
          </details>
        )}
      </Card>
      {status === "checked" && (
        <Card title="공장장 확인" help={{ kind: "panel", id: "ro.diagConfirm" }}>
          {issues.length ? (
            <div className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-sm">
              <p className="font-semibold text-[var(--warn)]">아직 확인할 수 없습니다({issues.length}건)</p>
              <ul className="mt-1 space-y-0.5">
                {issues.map((i) => (
                  <li key={i.msg}>⚠ {i.msg}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mb-3 rounded-md border border-[var(--line)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">진단이 갖춰졌습니다. 공장장이 확인하면 견적으로 넘어갑니다.</p>
          )}
          {canConfirm ? (
            <AssistForm id={`diag-ok-${roId}`} action={confirmDiagnosisAction} className="space-y-3">
              <input type="hidden" name="id" value={roId} />
              <TextAreaField help="dmg.confirmNote" name="diagNote" rows={2} />
              <SubmitButton>진단 확인 → 견적으로</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">공장장(또는 대표)이 확인합니다.</p>
          )}
        </Card>
      )}
      {status === "estimating" && (
        <Card title="공장장 확인" help={{ kind: "panel", id: "ro.diagConfirm" }}>
          <p className="text-sm">
            <Badge tone="ok">진단 확인됨</Badge> {diagNote}
          </p>
          {canConfirm && (
            <form action={confirmDiagnosisAction} className="mt-2">
              <input type="hidden" name="id" value={roId} />
              <input type="hidden" name="intent" value="reopen" />
              <SubmitButton variant="secondary">진단 다시 열기</SubmitButton>
            </form>
          )}
        </Card>
      )}
    </section>
  );
}
