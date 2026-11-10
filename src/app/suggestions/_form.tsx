// 개선 제안 칸(제출·고치기 같이 씀)
import { TextAreaField, TextField } from "../_input";

type S = { title: string; area: string | null; problem: string; proposal: string; effect: string | null };

export function SuggestionFields({ s }: { s?: S }) {
  return (
    <>
      <TextField help="sg.title" name="title" required defaultValue={s?.title} />
      <TextField help="sg.area" name="area" defaultValue={s?.area ?? ""} suggestions={["A 판금", "B 도장 준비", "C 도장 부스", "D 조색실", "E 자재 창고", "F 공용 공구", "G 사무실·고객 대기실", "H 외부·주차"].map((v) => ({ value: v }))} />
      <div className="md:col-span-2">
        <TextAreaField help="sg.problem" name="problem" required rows={3} defaultValue={s?.problem} />
      </div>
      <div className="md:col-span-2">
        <TextAreaField help="sg.proposal" name="proposal" required rows={3} defaultValue={s?.proposal} />
      </div>
      <div className="md:col-span-2">
        <TextAreaField help="sg.effect" name="effect" rows={2} defaultValue={s?.effect ?? ""} />
      </div>
    </>
  );
}
