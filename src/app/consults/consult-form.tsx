// 상담 일지(F-01-01) 입력 칸 묶음 — 새 상담과 고치기가 같이 쓴다.
// 앞선 기록(고른 고객·차량, 지난 상담)에서 온 값에는 '○○에서 불러옴'을 붙인다.
import type { ReactNode } from "react";
import { CONSENT_PICK, CONSENT_TEXT, CAUSES, CHANNEL_LABEL, DAMAGE_TYPES, INSURANCE_LABEL, METHODS, PARTS_PREF, RESULT_LABEL, TIME_SLOTS } from "@/modules/customer/rules";
import { CheckGroup, DateField, NumberField, SelectField, TextAreaField, TextField } from "../_input";
import { ShowWhen } from "./show-when";
import { VehicleFields } from "./vehicle-fields";
import { CONSENT_LINK_DAYS } from "@/modules/customer/consent-const";

export type ConsultPrefill = {
  channel?: string;
  mileage?: number | null;
  damageTypes?: string[];
  damageParts?: string | null;
  cause?: string | null;
  photoCount?: number;
  methods?: string[];
  structural?: boolean;
  insurance?: string;
  insurer?: string | null;
  claimNo?: string | null;
  wantDate?: string | null;
  partsPref?: string | null;
  rental?: boolean;
  needs?: string | null;
  estMin?: number | null;
  estMax?: number | null;
  estNoticed?: boolean;
  result?: string;
  reservedDate?: string;
  reservedTime?: string;
  overCapacityOk?: boolean;
  recontactOn?: string | null;
  closeReason?: string | null;
};

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const list = (a: readonly string[]) => a.map((v) => ({ value: v, label: v }));
const one = (label: string) => [{ value: "1", label }];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-[var(--line)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** 새 고객: 이름·연락처·동의 */
export function NewCustomerFields({ name, phone }: { name?: string; phone?: string }) {
  return (
    <Group title="고객">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField help="cust.name" name="newName" required defaultValue={name} autoComplete="off" />
        <TextField help="cust.phone" name="newPhone" required defaultValue={phone} inputMode="tel" autoComplete="off" />
      </div>
      <ConsentFields />
    </Group>
  );
}

export function ConsentFields({ checked = ["required"], method = "phone", narrow = false, link = true }: { checked?: string[]; method?: string; narrow?: boolean; link?: boolean }) {
  const boxes = (
    <CheckGroup
      help="consent.items"
      name="consent"
      options={[
        { value: "required", label: "필수: 수리 상담·연락" },
        { value: "photo", label: "선택: 사진 홍보" },
        { value: "marketing", label: "선택: 이벤트·기프티콘·광고 문자" },
      ]}
      defaultChecked={checked}
    />
  );
  const picks = link ? CONSENT_PICK : { phone: CONSENT_PICK.phone, visit: CONSENT_PICK.visit };
  return (
    <div className="space-y-3">
      <details className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">동의서 문구(고객에게 읽어 주기) · F-13-01</summary>
        <div className="mt-2 space-y-2 text-[var(--muted)]">
          {(["required", "photo", "marketing"] as const).map((k) => (
            <p key={k}>
              <b className="text-[var(--text)]">{CONSENT_TEXT[k].title}</b> {CONSENT_TEXT[k].body}
            </p>
          ))}
          <p className="text-xs">{CONSENT_TEXT.notice}</p>
        </div>
      </details>
      <ShowWhen
        field="consentMethod"
        initial={method}
        cases={{
          phone: boxes,
          visit: boxes,
          link: (
            <p className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm">
              저장하면 고객 휴대폰으로 동의 링크를 보냅니다(알림톡이 준비됐으면 알림톡, 아니면 문자). 고객이 {CONSENT_LINK_DAYS}일 안에 동의하지 않으면 연락처는 자동으로 지워지고 상담 기록만 남습니다.
            </p>
          ),
        }}
      >
        <div className={narrow ? "" : "sm:max-w-md"}>
          <SelectField help="consent.method" name="consentMethod" required defaultValue={method} options={opts(picks)} />
        </div>
      </ShowWhen>
    </div>
  );
}

export function NewVehicleFields({ from, v, colors }: { from?: string; v?: { plateNo?: string; vin?: string | null; maker?: string | null; model?: string | null; year?: number | null; colorCode?: string | null }; colors?: Record<string, string[]> }) {
  return <VehicleFields v={v} from={from} colors={colors} />;
}

/** 상담 내용·요구·예상 금액·결과. src 는 값을 불러온 곳(지난 상담 번호) */
export function ConsultFields({ p, src, today, channel = true }: { p: ConsultPrefill; src?: string; today: string; channel?: boolean }) {
  const f = (has: unknown) => (has != null && has !== "" && !(Array.isArray(has) && !has.length) ? src : undefined);
  return (
    <>
      <Group title="손상과 예비 판단">
        <div className="grid gap-4 lg:grid-cols-2">
          {channel && <SelectField help="consult.channel" name="channel" required defaultValue={p.channel ?? "phone"} options={opts(CHANNEL_LABEL)} />}
          <SelectField help="consult.cause" name="cause" defaultValue={p.cause ?? ""} placeholder="고르기" options={list(CAUSES)} from={f(p.cause)} />
        </div>
        <NumberField help="consult.mileage" name="mileage" unit="km" min={0} max={2000000} defaultValue={p.mileage ?? null} />
        <CheckGroup help="consult.damageTypes" name="damageTypes" options={list(DAMAGE_TYPES)} defaultChecked={p.damageTypes ?? []} />
        <TextAreaField help="consult.damageParts" name="damageParts" rows={2} defaultValue={p.damageParts ?? undefined} from={f(p.damageParts)} />
        <div className="grid gap-4 lg:grid-cols-3">
          <NumberField help="consult.photoCount" name="photoCount" unit="장" min={0} max={50} defaultValue={p.photoCount ?? null} />
          <div className="lg:col-span-2">
            <CheckGroup help="consult.methods" name="methods" options={list(METHODS)} defaultChecked={p.methods ?? []} />
          </div>
        </div>
        <CheckGroup help="consult.structural" name="structural" options={one("프레임·필러 손상 의심")} defaultChecked={p.structural ? ["1"] : []} />
      </Group>

      <Group title="보험">
        <ShowWhen
          field="insurance"
          initial={p.insurance ?? "self"}
          cases={{
            own: <InsurerFields p={p} f={f} />,
            other: <InsurerFields p={p} f={f} />,
          }}
        >
          <SelectField help="consult.insurance" name="insurance" required defaultValue={p.insurance ?? "self"} options={opts(INSURANCE_LABEL)} from={f(p.insurance !== "self" ? p.insurance : null)} />
        </ShowWhen>
      </Group>

      <Group title="고객 요구 확인">
        <div className="grid gap-4 lg:grid-cols-3">
          <DateField help="consult.wantDate" name="wantDate" min={today} quick={["week", "nextMonth"]} defaultValue={p.wantDate ?? undefined} from={f(p.wantDate)} />
          <SelectField help="consult.partsPref" name="partsPref" defaultValue={p.partsPref ?? ""} placeholder="고르기" options={list(PARTS_PREF)} from={f(p.partsPref)} />
          <CheckGroup help="consult.rental" name="rental" options={one("대차 필요")} defaultChecked={p.rental ? ["1"] : []} />
        </div>
        <TextAreaField help="consult.needs" name="needs" rows={2} defaultValue={p.needs ?? undefined} from={f(p.needs)} />
      </Group>

      <Group title="예상 금액 안내(범위)">
        <div className="grid gap-4 lg:grid-cols-3">
          <NumberField help="consult.estMin" name="estMin" unit="원" min={0} defaultValue={p.estMin ?? null} from={f(p.estMin)} />
          <NumberField help="consult.estMax" name="estMax" unit="원" min={0} defaultValue={p.estMax ?? null} from={f(p.estMax)} />
          <CheckGroup help="consult.estNoticed" name="estNoticed" options={one("실차 진단 후 확정됨을 안내함")} defaultChecked={p.estNoticed ? ["1"] : []} />
        </div>
      </Group>

      <Group title="결과">
        <ShowWhen
          field="result"
          initial={p.result ?? "open"}
          cases={{
            reserved: (
              <div className="grid gap-4 lg:grid-cols-3">
                <DateField help="consult.reservedDate" name="reservedDate" required min={today} quick={["today", "tomorrow", "week"]} defaultValue={p.reservedDate} />
                <SelectField help="consult.reservedTime" name="reservedTime" required defaultValue={p.reservedTime ?? "10:00"} options={list(TIME_SLOTS)} />
                <CheckGroup help="consult.overCapacity" name="overCapacityOk" options={one("공장장 동의 받음")} defaultChecked={p.overCapacityOk ? ["1"] : []} />
              </div>
            ),
            recontact: <DateField help="consult.recontactOn" name="recontactOn" min={today} quick={["tomorrow", "week"]} defaultValue={p.recontactOn ?? undefined} />,
            declined: <TextAreaField help="consult.closeReason" name="closeReason" required rows={2} defaultValue={p.closeReason ?? undefined} />,
          }}
        >
          <SelectField help="consult.result" name="result" required defaultValue={p.result ?? "open"} options={opts({ open: RESULT_LABEL.open, reserved: RESULT_LABEL.reserved, recontact: RESULT_LABEL.recontact, declined: RESULT_LABEL.declined })} />
        </ShowWhen>
      </Group>
    </>
  );
}

function InsurerFields({ p, f }: { p: ConsultPrefill; f: (v: unknown) => string | undefined }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextField help="consult.insurer" name="insurer" required defaultValue={p.insurer ?? undefined} from={f(p.insurer)} />
      <TextField help="consult.claimNo" name="claimNo" defaultValue={p.claimNo ?? undefined} from={f(p.claimNo)} />
    </div>
  );
}
