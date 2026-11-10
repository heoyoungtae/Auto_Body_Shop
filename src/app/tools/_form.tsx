// 치공구 칸(등록·고치기 같이 씀)
import { TOOL_KEEP } from "@/modules/equipment/rules";
import { DateField, RadioRow, SelectField, TextAreaField, TextField } from "../_input";

type T = { name: string; spec: string | null; purchasedOn: string | null; location: string | null; keep: string; holderId: string | null; managerId: string | null; special: boolean; note: string | null };

export function ToolFields({ t, users }: { t?: T; users: { id: string; name: string }[] }) {
  const opts = users.map((u) => ({ value: u.id, label: u.name }));
  return (
    <>
      <TextField help="tool.name" name="name" required defaultValue={t?.name} />
      <TextField help="tool.spec" name="spec" defaultValue={t?.spec ?? ""} />
      <div className="md:col-span-2">
        <RadioRow help="tool.keep" name="keep" required defaultValue={t?.keep ?? "board"} options={Object.entries(TOOL_KEEP).map(([value, label]) => ({ value, label }))} />
      </div>
      <TextField help="tool.location" name="location" defaultValue={t?.location ?? ""} suggestions={["F 공용 공구 쉐도우 보드", "A 판금 구역", "B 도장 준비", "D 조색실", "E 자재 창고"].map((v) => ({ value: v }))} />
      <SelectField help="tool.holderId" name="holderId" defaultValue={t?.holderId ?? ""} placeholder="공용이면 비워 둠" options={opts} />
      <SelectField help="tool.managerId" name="managerId" defaultValue={t?.managerId ?? ""} placeholder="구역 담당 고르기" options={opts} />
      <DateField help="tool.purchasedOn" name="purchasedOn" defaultValue={t?.purchasedOn ?? ""} quick={["today"]} />
      <div className="md:col-span-2">
        <RadioRow
          help="tool.special"
          name="special"
          required
          defaultValue={t ? (t.special ? "1" : "0") : "0"}
          options={[
            { value: "0", label: "일반(반출 기록 안 함)" },
            { value: "1", label: "고가·특수(반출·반납 기록)", tone: "warn" },
          ]}
        />
      </div>
      <div className="md:col-span-2">
        <TextAreaField help="tool.note" name="note" rows={2} defaultValue={t?.note ?? ""} />
      </div>
    </>
  );
}
