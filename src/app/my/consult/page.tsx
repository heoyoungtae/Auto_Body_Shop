// 사진으로 상담·예약 요청(3단계): 이름·전화·차량은 다시 묻지 않는다. 차 그림에서 다친 곳을 누르고 사진 몇 장.
// 보내면 공업사 상담 일지에 '고객용 화면' 경로로 들어가고 상담원이 회신 기한 안에 연락한다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { shopCard } from "@/modules/carbook/service";
import { ShopFooter } from "../_parts";
import { consultCars, INSURANCE_PICK, myConsults, REQUEST_LIMIT } from "@/modules/carbook/requests";
import { carOf } from "@/modules/repair/body-map";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { ConsultZones } from "../../consults/consult-zones";
import { requestConsultAction } from "../actions";
import { requireMy } from "../_session";
import { ClaimPhotos } from "../warranty/[id]/claim-photos";

const STATE = (r: { result: string; repliedAt: Date | null; reservedAt: Date | null }) =>
  r.result === "reserved" && r.reservedAt ? `입고 예약 ${r.reservedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : r.result === "converted" ? "입고함" : r.result === "declined" ? "마감" : r.repliedAt ? "공업사가 연락드림" : "연락 기다리는 중";

export default async function MyConsultPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; due?: string }> }) {
  const q = await searchParams;
  const s = await requireMy(true);
  const db = await getDb();
  const [cars, list, shop] = await Promise.all([consultCars(db, s), myConsults(db, s), shopCard(db)]);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.consult">사진으로 상담 요청</PageTitle>
      <ErrorBox message={q.error} />
      {q.sent && <Notice>보냈습니다. {q.due ? `${q.due}까지` : "곧"} 공업사에서 답을 드립니다. 답이 오면 알림톡(또는 문자)으로 알려 드리고, 이 화면 아래 '보낸 상담 요청'에서 보실 수 있습니다.</Notice>}
      {!cars.length ? (
        <Empty>등록된 차가 없습니다. 새 차는 공업사로 전화해 주세요.</Empty>
      ) : (
        <Card title="어디가 다쳤나요" help={{ kind: "panel", id: "my.consultForm" }}>
          <AssistForm id="my-consult" action={requestConsultAction} encType="multipart/form-data" className="space-y-4">
            <p className="text-sm text-[var(--muted)]">이름·전화·차는 다시 적지 않아도 됩니다. 아래 차 그림에서 다친 곳을 누르거나, 글로 적어 주세요.</p>
            {cars.length > 1 ? <SelectField help="my.vehicle" name="vehicleId" required options={cars.map((c) => ({ value: c.id, label: c.label }))} defaultValue={cars[0].id} /> : <input type="hidden" name="vehicleId" value={cars[0].id} />}
            <ConsultZones initial={[]} cars={Object.fromEntries(cars.map((c) => [c.id, carOf(c)]))} car={carOf(cars[0])} />
            <TextAreaField help="my.damageParts" name="damageParts" rows={2} />
            <ClaimPhotos max={REQUEST_LIMIT.photos} />
            <RadioRow help="my.insurance" name="insurance" required defaultValue="self" options={Object.entries(INSURANCE_PICK).map(([value, label]) => ({ value, label }))} />
            <TextField help="my.insurer" name="insurer" />
            <DateField help="my.wantDate" name="wantDate" min={seoulDate()} quick={["tomorrow", "week"]} />
            <TextField help="my.needs" name="needs" />
            <SubmitButton full>보내기</SubmitButton>
          </AssistForm>
        </Card>
      )}
      {list.length > 0 && (
        <Card title="보낸 상담 요청" help={{ kind: "panel", id: "my.consultList" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((r) => (
              <li key={r.id} id={r.docNo} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="text-xs text-[var(--muted)]">{seoulDate(r.at)}</span> {r.plateNo} <span className="text-[var(--muted)]">{(r.parts ?? "").split("\n")[0].slice(0, 30)}</span>
                    {r.source === "web" && <span className="ml-1 text-xs text-[var(--muted)]">· 홈페이지</span>}
                  </span>
                  <span className="shrink-0 text-xs">{r.reply ? "답변 왔음" : STATE(r)}</span>
                </div>
                {/* 공업사 답변(비밀): 문자 인증으로 들어온 이 손님에게만 보인다 */}
                {r.reply && (
                  <div className="mt-2 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
                    <p className="mb-1 text-xs font-semibold text-[var(--accent)]">공업사 답변 · {r.replyAt ? seoulDate(r.replyAt) : ""}</p>
                    <p className="whitespace-pre-line">{r.reply}</p>
                    {r.result === "open" && (
                      <p className="mt-2 text-xs text-[var(--muted)]">예약하시려면 아래 공업사 전화로 연락해 주세요.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-center text-sm">
        <Link href="/my/more" className="text-[var(--accent)] underline">
          더보기로 돌아가기
        </Link>
      </p>
      <ShopFooter shop={shop} />
    </div>
  );
}
