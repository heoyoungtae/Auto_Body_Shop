import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { fiveSBoard } from "@/modules/quality/five-s";
import { DAILY_ITEMS, FIVE_S, isZone, SCORE_LABEL, SCORE_STEPS } from "@/modules/quality/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { dailyAction, monthlyAction, removeDailyPhotoAction, uploadDailyPhotoAction } from "../actions";

/** 구역 하나: 기준 사진, 일일 점검(휴대폰), 월간 평가(공장장) */
export default async function ZonePage({ params, searchParams }: { params: Promise<{ zone: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { zone } = await params;
  const { error, notice } = await searchParams;
  if (!isZone(zone)) notFound();
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const b = await fiveSBoard(db, today);
  const z = b.zones.find((x) => x.code === zone)!;
  const boss = can(user, "five_s.audit");
  const mine = z.ownerId === user.id || z.deputyId === user.id || boss;
  const rated = z.scores[b.ym];
  return (
    <>
      <PageTitle
        help="five_s.zone"
        sub={`담당 ${z.ownerName ?? "없음"}${z.deputyName ? ` · 대행 ${z.deputyName}` : ""} · 이달 점검률 ${z.rate ?? "-"}%`}
        actions={
          <Link href="/five-s" className="text-sm text-[var(--accent)]">
            ← 3정5S 현황
          </Link>
        }
      >
        {zone} {z.name} 구역
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="기준 사진" help={{ kind: "panel", id: "five_s.ref" }}>
          <p className="mb-2 text-sm text-[var(--muted)]">&lsquo;이 상태가 정상&rsquo;인 사진입니다. 일일 점검 사진은 같은 각도로 찍습니다.</p>
          <PhotoStrip fields={{ zone, ref: "1" }} upload={uploadDailyPhotoAction} remove={removeDailyPhotoAction} photos={z.refPhoto ? [z.refPhoto] : []} editable={boss} label="기준" />
        </Card>

        <Card title={`일일 점검 · ${today}`} help={{ kind: "panel", id: "five_s.daily" }} actions={z.today && <Badge tone="ok">저장함</Badge>}>
          {mine ? (
            <AssistForm id={`5s-${zone}-${today}`} action={dailyAction} className="space-y-3">
              <input type="hidden" name="zone" value={zone} />
              <DateField help="five_s.date" name="date" required defaultValue={today} quick={["today"]} />
              {DAILY_ITEMS.map((it, i) => (
                <RadioRow key={it} help="five_s.item" label={`${i + 1}. ${it}`} name={`c${i}`} required defaultValue={z.today ? (z.today.results[i] ? "o" : "x") : undefined} from={z.today ? "오늘 저장한 점검" : undefined} options={[
                  { value: "o", label: "○", tone: "ok" },
                  { value: "x", label: "×", tone: "danger" },
                ]} />
              ))}
              <TextField help="five_s.note" name="note" defaultValue={z.today?.note ?? ""} />
              <SubmitButton full>{z.today ? "고쳐 저장" : "점검 저장"}</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">이 구역 담당(대행자)과 공장장이 점검합니다.</p>
          )}
          {z.today && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-[var(--muted)]">오늘 사진(기준 사진과 같은 각도 1장)</p>
              <PhotoStrip fields={{ zone, id: z.today.id }} upload={uploadDailyPhotoAction} remove={removeDailyPhotoAction} photos={z.today.photos} editable={mine} label="일일 점검" />
            </div>
          )}
        </Card>

        <Card title={`월간 평가 · ${b.ym}`} help={{ kind: "panel", id: "five_s.monthly" }}>
          {rated ? (
            <div className="text-sm">
              <p className="mb-2">
                <b className={rated.total < b.threshold ? "text-[var(--danger)]" : ""}>{rated.total}점</b> ({FIVE_S.map((f, i) => `${f.label} ${rated.scores[i]}`).join(" · ")})
              </p>
              {rated.remarks && <p>지적 사항: {rated.remarks}</p>}
              {rated.ncId && (
                <Link href={`/nc/${rated.ncId}`} className="text-[var(--accent)]">
                  부적합 보고서 보기
                </Link>
              )}
            </div>
          ) : boss ? (
            <AssistForm id={`5sm-${zone}-${b.ym}`} action={monthlyAction} className="space-y-3">
              <input type="hidden" name="zone" value={zone} />
              <input type="hidden" name="ym" value={b.ym} />
              <p className="text-xs text-[var(--muted)]">이달 일일 점검률 {z.rate ?? "-"}% — 습관화 점수에 참고합니다.</p>
              {FIVE_S.map((f) => (
                <RadioRow key={f.key} help="five_s.score" label={`${f.label} — ${f.hint}`} name={f.key} required options={SCORE_STEPS.map((v) => ({ value: String(v), label: SCORE_LABEL[v], tone: v === 20 ? "ok" : v === 10 ? "warn" : "danger" }))} />
              ))}
              <TextAreaField help="five_s.remarks" name="remarks" rows={2} />
              <SubmitButton>평가 저장</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">공장장이 매월 첫 주에 평가합니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
