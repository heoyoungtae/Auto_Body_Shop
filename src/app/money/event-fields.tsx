// 지출 결의 › 경조사비 칸(접대비 = 거래처, 복리후생 = 직원). 증빙은 청첩장·부고장 사진(아래 증빙 파일)
import { EVENT_KINDS, type EventTarget } from "@/modules/money/rules";
import { CheckGroup, DateField, SelectField, TextField } from "../_input";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export type EventOld = { kind: string; name: string; relation: string; on: string; userId?: string } | null;

export function EventFields({ target, people, clientMax, staffTable, old }: { target: EventTarget; people: { value: string; label: string }[]; clientMax: number; staffTable: { kind: string; label: string; won: number }[]; old: EventOld }) {
  const kinds = Object.entries(EVENT_KINDS)
    .filter(([v, k]) => target === "client" || k.staff || v === "other")
    .map(([value, k]) => ({ value, label: k.label }));
  return (
    <div className="space-y-3 rounded-md border border-[var(--line)] p-3">
      <CheckGroup help="exp.hasEvent" name="hasEvent" options={[{ value: "1", label: target === "client" ? "거래처 경조사비(축의금·부의금)" : "직원 경조금(사내 기준표)" }]} defaultChecked={old ? ["1"] : []} />
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField help="exp.eventKind" name="eventKind" placeholder="종류 고르기" defaultValue={old?.kind ?? ""} options={kinds} />
        {target === "staff" ? (
          <SelectField help="exp.eventUserId" name="eventUserId" placeholder="직원 고르기" defaultValue={old?.userId ?? ""} options={people} />
        ) : (
          <TextField help="exp.eventName" name="eventName" defaultValue={old?.name ?? ""} />
        )}
        <TextField help="exp.eventRelation" name="eventRelation" defaultValue={old?.relation ?? ""} />
        <DateField help="exp.eventOn" name="eventOn" defaultValue={old?.on ?? ""} quick={["today", "tomorrow", "week"]} />
      </div>
      <p className="text-xs text-[var(--muted)]">
        {target === "client"
          ? `거래처 경조사비는 한 번에 ${won(clientMax)}까지만 청첩장·부고장으로 비용 인정됩니다(넘으면 전액 불인정이라 결의가 막힙니다). 증빙은 '청첩장·부고장'을 고르고 사진을 붙입니다. 화환을 카드로 샀으면 경조사 칸 없이 카드 전표로 따로 결의합니다.`
          : `사내 경조금 기준: ${staffTable.filter((r) => r.won > 0).map((r) => `${r.label} ${won(r.won)}`).join(" · ") || "아직 없음(설정 › 정책값)"}. 기준표 금액이면 복리후생비로 한도 없이 인정됩니다. 증빙은 '청첩장·부고장'을 고르고 사진을 붙입니다.`}
      </p>
    </div>
  );
}
