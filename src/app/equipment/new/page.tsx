import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, equipment } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { EQ_KINDS, GRADES, isEqKind, itemsText, ZONES } from "@/modules/equipment/rules";
import { equipmentDefaults } from "@/modules/equipment/service";
import { PROCESSES } from "@/modules/repair/work-rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { saveEquipmentAction } from "../actions";
import { expensePrefill, unlinkedAssetExpenses } from "@/modules/asset/service";
import { guessAsset } from "@/modules/asset/rules";

/** 설비 등록·고치기(F-08-01). 종류를 고르면 표준서의 점검 항목·중요도·쓰는 공정을 채워 둔다 */
export default async function NewEquipmentPage({ searchParams }: { searchParams: Promise<{ kind?: string; edit?: string; error?: string; exp?: string }> }) {
  const { kind: kindQ, edit, error, exp } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const back = (
    <Link href={edit ? `/equipment/${edit}` : "/equipment"} className="text-sm text-[var(--accent)]">
      ← {edit ? "설비" : "설비 대장"}
    </Link>
  );
  if (!can(user, "equip.manage")) {
    return (
      <>
        <PageTitle help="equip.new">설비 등록</PageTitle>
        <ErrorBox message="설비 대장은 공장장(또는 대표)이 씁니다. 고장·이상은 설비 화면에서 신고하세요." />
      </>
    );
  }
  const [cur] = edit ? await db.select().from(equipment).where(eq(equipment.id, edit)) : [];
  if (edit && !cur) notFound();
  // 지출결의에서 불러오기: 품명으로 종류를 짐작해 바로 등록 칸으로
  const pre = !edit && exp ? await expensePrefill(db, exp) : null;
  const guessed = pre ? guessAsset(pre.purpose) : null;
  const kind = cur?.kind ?? kindQ ?? (guessed?.kind === "equipment" ? guessed.eqKind : undefined);
  const unlinked = !edit && !pre ? await unlinkedAssetExpenses(db) : [];
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const expQ = pre ? `&exp=${pre.expenseId}` : "";

  if (!kind || !isEqKind(kind)) {
    return (
      <>
        <PageTitle help="equip.new" sub="종류를 고르면 표준서의 점검 항목과 중요도를 채워 드립니다. 저장 전에 고칠 수 있습니다." actions={back}>
          설비 등록
        </PageTitle>
        {pre && (
          <p className="mb-3 text-sm">
            결의 <b>{pre.docNo}</b> {pre.payeeName} · {won(pre.supplyWon)} · {pre.purpose} — 종류를 고르면 결의 값이 채워집니다.
          </p>
        )}
        {unlinked.length > 0 && (
          <div className="mb-4">
            <Card title="지출결의에서 불러오기" help={{ kind: "panel", id: "fx.fromExpense" }}>
              <ul className="divide-y divide-[var(--line)] text-sm">
                {unlinked.slice(0, 10).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link href={`/equipment/new?exp=${e.id}`} className="font-semibold text-[var(--accent)]">
                      {e.docNo}
                    </Link>
                    <span>{e.payeeName}</span>
                    <span>{won(e.supplyWon)}</span>
                    <span className="text-[var(--muted)]">{e.purpose}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
        <Card title="설비 종류" help={{ kind: "panel", id: "equip.kind" }}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(EQ_KINDS).map(([k, v]) => (
              <Link key={k} href={`/equipment/new?kind=${k}${expQ}`} className="rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                <div className="font-semibold">{v.label}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  중요도 {v.grade} · 점검 {v.daily.length}항목{v.processes.length ? ` · ${v.processes.map((p) => PROCESSES[p as keyof typeof PROCESSES].label).join("·")}` : ""}
                  {v.legal && ` · ${v.legal}`}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </>
    );
  }

  const d = await equipmentDefaults(db, kind);
  const users = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name);
  const userOpts = users.map((u) => ({ value: u.id, label: u.name }));
  const from = cur ? undefined : "종류별 기본값";
  const v = cur ?? {
    name: pre?.purpose ?? EQ_KINDS[kind].label,
    grade: d.grade,
    dailyItems: d.dailyItems,
    monthlyItems: d.monthlyItems,
    processes: d.processes,
    legalKind: d.legalKind,
    calibMonths: d.calibMonths,
    checkDaily: kind !== "other",
    checkMonthly: kind !== "gauge" && kind !== "other",
  };
  const c = cur;
  return (
    <>
      <PageTitle help="equip.new" sub={`${EQ_KINDS[kind].label} · ${cur ? `${cur.no} 고치기` : "번호(EQ-)는 저장할 때 매깁니다"}`} actions={back}>
        {cur ? `${cur.name} 고치기` : "설비 등록"}
      </PageTitle>
      <ErrorBox message={error} />
      {pre && (
        <p className="mb-3 text-sm">
          결의 <b>{pre.docNo}</b> {pre.payeeName} · {won(pre.supplyWon)}에서 불러와 채웠습니다. 저장하면 이 결의와 묶입니다.{" "}
          <Link href={`/equipment/new?kind=${kind}`} className="text-[var(--accent)]">
            빼기
          </Link>
        </p>
      )}
      <AssistForm id={`equip-${edit ?? kind}${pre ? `-${pre.expenseId}` : ""}`} draft action={saveEquipmentAction} className="space-y-4">
        {edit && <input type="hidden" name="id" value={edit} />}
        {pre && <input type="hidden" name="expenseId" value={pre.expenseId} />}
        <input type="hidden" name="kind" value={kind} />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="기본 정보" help={{ kind: "panel", id: "equip.basic" }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField help="eq.name" name="name" required defaultValue={v.name} from={pre ? `결의 ${pre.docNo}` : undefined} />
              <RadioRow help="eq.grade" name="grade" required defaultValue={v.grade} from={from} options={Object.keys(GRADES).map((g) => ({ value: g, label: g, tone: g === "A" ? "danger" : g === "B" ? "warn" : undefined }))} />
              <TextField help="eq.model" name="model" defaultValue={c?.model ?? ""} />
              <TextField help="eq.maker" name="maker" defaultValue={c?.maker ?? ""} />
              <TextField help="eq.makerContact" name="makerContact" defaultValue={c?.makerContact ?? ""} />
              <TextField help="eq.rating" name="rating" defaultValue={c?.rating ?? ""} />
              <DateField help="eq.boughtOn" name="boughtOn" defaultValue={c?.boughtOn ?? pre?.on ?? ""} from={pre ? `결의 ${pre.docNo}` : undefined} quick={["today"]} />
              <NumberField help="eq.price" name="price" unit="원" min={0} defaultValue={c?.price ?? pre?.supplyWon ?? null} from={pre ? `결의 ${pre.docNo}` : undefined} />
              <SelectField help="eq.zone" name="zone" defaultValue={c?.zone ?? ""} placeholder="고르세요" options={Object.entries(ZONES).map(([value, label]) => ({ value, label }))} />
              <DateField help="eq.trialOn" name="trialOn" defaultValue={c?.trialOn ?? ""} quick={["today"]} />
              <TextField help="eq.manualRef" name="manualRef" defaultValue={c?.manualRef ?? ""} />
            </div>
          </Card>
          <Card title="담당·검사" help={{ kind: "panel", id: "equip.people" }}>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField help="eq.owner" name="ownerId" defaultValue={c?.ownerId ?? ""} placeholder="정하지 않음" options={userOpts} />
                <SelectField help="asset.subManager" name="subManagerId" defaultValue={c?.subManagerId ?? ""} placeholder="없음" options={userOpts} />
              </div>
              <CheckGroup help="eq.operators" name="operators" defaultChecked={c?.operators ?? []} options={userOpts} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField help="eq.legalKind" name="legalKind" defaultValue={v.legalKind ?? ""} from={!cur && d.legalKind ? from : undefined} />
                <DateField help="eq.legalNextOn" name="legalNextOn" defaultValue={c?.legalNextOn ?? ""} quick={[]} />
              </div>
              <CheckGroup help="eq.processes" name="processes" defaultChecked={v.processes} options={Object.entries(PROCESSES).map(([value, p]) => ({ value, label: p.label }))} />
            </div>
          </Card>
          <Card title="점검 항목(F-08-02)" help={{ kind: "panel", id: "equip.items" }}>
            <div className="space-y-3">
              <CheckGroup help="eq.cycle" name="cycle" defaultChecked={[v.checkDaily && "daily", v.checkMonthly && "monthly"].filter(Boolean) as string[]} options={[
                { value: "daily", label: "일상(매일 작업 전)" },
                { value: "monthly", label: "월간(공장장)" },
              ]} />
              <TextAreaField help="eq.dailyItems" name="dailyItems" rows={6} defaultValue={itemsText(v.dailyItems)} from={from} />
              <TextAreaField help="eq.monthlyItems" name="monthlyItems" rows={4} defaultValue={itemsText(v.monthlyItems)} from={from} />
            </div>
          </Card>
          <Card title="측정 장비란·비고" help={{ kind: "panel", id: "equip.gauge" }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField help="eq.measureRange" name="measureRange" defaultValue={c?.measureRange ?? ""} />
              <TextField help="eq.tolerance" name="tolerance" defaultValue={c?.tolerance ?? ""} />
              <NumberField help="eq.calibMonths" name="calibMonths" unit="개월" min={1} max={60} required={kind === "gauge"} defaultValue={v.calibMonths ?? null} from={!cur && d.calibMonths ? "정책값" : undefined} />
              <DateField help="eq.calibNextOn" name="calibNextOn" required={kind === "gauge"} defaultValue={c?.calibNextOn ?? ""} quick={[]} />
            </div>
            <div className="mt-3">
              <TextAreaField help="eq.note" name="note" rows={2} defaultValue={c?.note ?? ""} />
            </div>
          </Card>
        </div>
        <SubmitButton>저장</SubmitButton>
      </AssistForm>
    </>
  );
}
