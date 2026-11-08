// 근로자 명부 칸(직원 등록·명부 고치기가 같이 쓴다)
import type { ProfileView } from "@/modules/staff/service";
import { CONTRACT_KIND, GENDER } from "@/modules/staff/rules";
import { AddressField, DateField, SelectField, TextAreaField, TextField } from "../_input";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export function ProfileFields({ p, isNew = false }: { p: ProfileView | null; isNew?: boolean }) {
  const lic = p?.licenses ?? [];
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField help="staff.job" name="job" required defaultValue={p?.job ?? ""} />
        <DateField help="staff.hiredOn" name="hiredOn" required defaultValue={p?.hiredOn ?? ""} quick={["today"]} />
        <SelectField help="staff.contractKind" name="contractKind" required defaultValue={p?.contractKind || "regular"} options={opts(CONTRACT_KIND)} />
        <DateField help="staff.contractEnd" name="contractEnd" defaultValue={p?.contractEnd ?? ""} quick={["nextMonth"]} />
        <SelectField help="staff.gender" name="gender" defaultValue={p?.gender ?? ""} placeholder="고르기" options={opts(GENDER)} />
        <DateField help="staff.birth" name="birth" defaultValue={p?.birth ?? ""} quick={[]} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <TextField help="staff.phone" name="phone" required defaultValue={p?.phone ?? ""} inputMode="tel" />
        <TextField help="staff.emName" name="emName" defaultValue={p?.emName ?? ""} />
        <TextField help="staff.emRelation" name="emRelation" defaultValue={p?.emRelation ?? ""} suggestions={["배우자", "부", "모", "형제", "자녀", "친척"].map((v) => ({ value: v }))} />
        <TextField help="staff.emPhone" name="emPhone" defaultValue={p?.emPhone ?? ""} inputMode="tel" />
      </div>
      <AddressField help={{ zip: "staff.zip", address: "staff.address", detail: "staff.addressDetail" }} defaults={{ zip: p?.zip, address: p?.address, detail: p?.addressDetail }} />
      <TextAreaField help="staff.career" name="career" defaultValue={p?.career ?? ""} rows={2} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">자격증(최대 3개)</legend>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 md:grid-cols-3">
            <TextField help="staff.licName" name={`licName${i}`} defaultValue={lic[i]?.name ?? ""} />
            <TextField help="staff.licNo" name={`licNo${i}`} defaultValue={lic[i]?.no ?? ""} />
            <DateField help="staff.licOn" name={`licOn${i}`} defaultValue={lic[i]?.on ?? ""} quick={[]} />
          </div>
        ))}
      </fieldset>
      {!isNew && (
      <details className="rounded-md border border-[var(--line)] p-3" open={!!p?.leftOn}>
        <summary className="cursor-pointer text-sm font-semibold">퇴직 처리</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <DateField help="staff.leftOn" name="leftOn" defaultValue={p?.leftOn ?? ""} quick={["today"]} />
          <TextField help="staff.leftReason" name="leftReason" defaultValue={p?.leftReason ?? ""} />
        </div>
      </details>
      )}
    </>
  );
}
