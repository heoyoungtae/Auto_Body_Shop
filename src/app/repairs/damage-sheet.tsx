// 인쇄용 '손상 부위도' 쪽: 법정 서식(견적서·정비명세서)은 그대로 두고 그 뒤에 한 쪽 덧붙인다.
// 차 그림(번호·수리 방법 색)과 번호별 부위·위치·손상·정도·수리 방법 표. 서식에 없는 참고 쪽임을 밝힌다.
import type { roDamage } from "@/db/schema";
import { cellsLabel, type CarLook } from "@/modules/repair/body-map";
import { DAMAGE_KINDS, damageSeverity, METHODS, partName, SEVERITY_LABEL } from "@/modules/repair/rules";
import { CarMap } from "./car-map";
import { damageFills, damagePins, MethodLegend, viewOf } from "./damage-map";

type Damage = typeof roDamage.$inferSelect;
const cell = "border border-black px-1.5 py-1";
const head = `${cell} bg-neutral-100 text-center font-medium`;

export function DamageSheet({ damages, car, docNo, plateNo, carName, kind }: { damages: Damage[]; car: CarLook; docNo: string; plateNo: string; carName: string; kind: "estimate" | "statement" }) {
  if (!damages.length) return null;
  return (
    <article className="print-light print-page mx-auto mt-6 max-w-[190mm] bg-white p-4 text-[11px] leading-snug text-black print:mt-0 print:max-w-none print:p-0">
      <h2 className="text-center text-lg font-bold tracking-[0.2em]">손상 부위도</h2>
      <p className="mt-1 text-center text-[10px]">
        {kind === "estimate" ? "견적서" : "정비명세서"} {docNo} 붙임 · {plateNo} {carName} · 법정 서식에 덧붙이는 참고 쪽입니다
      </p>
      <div className="mt-2">
        <CarMap label="손상 부위도" fills={damageFills(damages)} pins={damagePins(damages)} car={car} plain />
        <MethodLegend />
      </div>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr>
            <td className={head}>번호</td>
            <td className={head}>부위</td>
            <td className={head}>위치</td>
            <td className={head}>손상</td>
            <td className={head}>정도</td>
            <td className={head}>{kind === "estimate" ? "수리 방법(견적)" : "수리 방법"}</td>
          </tr>
        </thead>
        <tbody>
          {damages.map((d) => {
            const v = viewOf(d);
            return (
              <tr key={d.id}>
                <td className={`${cell} text-center`}>{d.seq}</td>
                <td className={cell}>{partName(d.part, d.subPart)}</td>
                <td className={cell}>{v ? cellsLabel(v, d.cells) : "부위 전체"}</td>
                <td className={cell}>
                  {DAMAGE_KINDS[d.kind as keyof typeof DAMAGE_KINDS] ?? d.kind}
                  {d.sizeCm ? ` ${d.sizeCm}cm` : ""}
                </td>
                <td className={`${cell} text-center`}>{SEVERITY_LABEL[damageSeverity(d)]}</td>
                <td className={cell}>{METHODS[d.method as keyof typeof METHODS] ?? d.method}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
