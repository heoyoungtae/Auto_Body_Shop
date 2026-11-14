// 차 그림의 꾸밈(누르지 않음): 명암·빛 반사·창틀·램프·그릴·휠. 부위 구역(body-map.ts) 위아래에 겹쳐 실사풍으로 보이게 한다.
// 상태·이벤트가 없는 SVG 조각이라 서버·브라우저 어디서나 그린다. 색은 globals.css 의 --car-* 토큰만 쓴다.
// 특정 차종·엠블럼은 그리지 않는다(저작권). 좌표는 body-map.ts 의 면 좌표(옆 470×170, 위 470×200, 앞·뒤 200×170).
// 차형마다 다른 위치(창·바퀴·램프·부착물)는 body-map.ts BODY_SPECS 의 art 에서 읽는다.

import type { BodySpec, Shape } from "@/modules/repair/body-map";

type Art = BodySpec["art"];

/** 그라데이션·무늬·흐림 정의. id 앞머리(uid)는 그림마다 다르다 */
export function CarArtDefs({ uid }: { uid: string }) {
  return (
    <>
      {/* 옆·앞·뒤: 어깨선 위 빛, 아래로 갈수록 그늘 */}
      <linearGradient id={`${uid}-shade`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="150">
        <stop offset="0" stopColor="var(--car-sheen)" stopOpacity="0" />
        <stop offset="0.45" stopColor="var(--car-sheen)" stopOpacity="0.55" />
        <stop offset="0.53" stopColor="var(--car-sheen)" stopOpacity="0" />
        <stop offset="0.6" stopColor="var(--car-depth)" stopOpacity="0.04" />
        <stop offset="0.86" stopColor="var(--car-depth)" stopOpacity="0.14" />
        <stop offset="1" stopColor="var(--car-depth)" stopOpacity="0.3" />
      </linearGradient>
      {/* 위에서: 가운데 등줄기 빛, 양옆 그늘 */}
      <linearGradient id={`${uid}-shadeTop`} gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="186">
        <stop offset="0" stopColor="var(--car-depth)" stopOpacity="0.22" />
        <stop offset="0.2" stopColor="var(--car-depth)" stopOpacity="0.02" />
        <stop offset="0.42" stopColor="var(--car-sheen)" stopOpacity="0.5" />
        <stop offset="0.58" stopColor="var(--car-sheen)" stopOpacity="0" />
        <stop offset="0.8" stopColor="var(--car-depth)" stopOpacity="0.02" />
        <stop offset="1" stopColor="var(--car-depth)" stopOpacity="0.22" />
      </linearGradient>
      <linearGradient id={`${uid}-glassArt`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor="var(--car-glass-hi)" />
        <stop offset="0.55" stopColor="var(--car-glass-lo)" />
        <stop offset="1" stopColor="var(--car-glass-deep)" />
      </linearGradient>
      <linearGradient id={`${uid}-tail`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--car-tail-hi)" />
        <stop offset="1" stopColor="var(--car-tail)" />
      </linearGradient>
      <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--car-rim-hi)" />
        <stop offset="1" stopColor="var(--car-rim)" />
      </linearGradient>
      <radialGradient id={`${uid}-rimArt`} cx="0.42" cy="0.38" r="0.7">
        <stop offset="0" stopColor="var(--car-rim-hi)" />
        <stop offset="0.7" stopColor="var(--car-rim)" />
        <stop offset="1" stopColor="var(--car-rim-lo)" />
      </radialGradient>
      {/* 그릴 벌집 무늬 */}
      <pattern id={`${uid}-mesh`} width="7" height="6" patternUnits="userSpaceOnUse">
        <rect width="7" height="6" fill="var(--car-grille)" />
        <path d="M0,3 L1.75,0 L5.25,0 L7,3 L5.25,6 L1.75,6 Z" fill="none" stroke="var(--car-grille-hi)" strokeWidth="0.7" />
      </pattern>
      <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
    </>
  );
}

/** 바퀴 휠: 타이어 옆면, 브레이크 디스크·캘리퍼, 5 트윈 스포크 */
function Wheel({ uid, x, y }: { uid: string; x: number; y: number }) {
  const spokes = [0, 72, 144, 216, 288].map((a) => {
    const r = (d: number) => (d * Math.PI) / 180;
    const p = (ang: number, rad: number) => `${(x + rad * Math.cos(r(ang))).toFixed(1)},${(y + rad * Math.sin(r(ang))).toFixed(1)}`;
    return `M${p(a - 14, 5.5)} L${p(a - 6, 20)} L${p(a + 6, 20)} L${p(a + 14, 5.5)} Z`;
  });
  return (
    <g>
      <circle cx={x} cy={y} r={27.5} fill="none" stroke="var(--car-tire-hi)" strokeWidth="1.2" />
      <circle cx={x} cy={y} r={22} fill="var(--car-rim-lo)" />
      <circle cx={x} cy={y} r={16} fill="var(--car-disc)" />
      <circle cx={x} cy={y} r={16} fill="none" stroke="var(--car-rim-lo)" strokeWidth="0.6" strokeDasharray="1.2 2" />
      <path d={`M${x - 14},${y - 7} A15,15 0 0 1 ${x - 5},${y - 14.5}`} fill="none" stroke="var(--car-caliper)" strokeWidth="4.5" strokeLinecap="round" />
      {spokes.map((d) => (
        <path key={d} d={d} fill={`url(#${uid}-rimArt)`} stroke="var(--car-rim-lo)" strokeWidth="0.5" />
      ))}
      <circle cx={x} cy={y} r={21} fill="none" stroke={`url(#${uid}-chrome)`} strokeWidth="2.4" />
      <circle cx={x} cy={y} r={6} fill={`url(#${uid}-rimArt)`} stroke="var(--car-rim-lo)" strokeWidth="0.6" />
      <circle cx={x} cy={y} r={2} fill="var(--car-rim-lo)" />
    </g>
  );
}

/** 옆모습 · 부위 밑: 휠 하우스 그늘 */
export function SideUnder({ art }: { art: Art }) {
  return (
    <g pointerEvents="none">
      {art.arches.map(([a, b, y]) => (
        <path key={a} d={`M${a},${y} A${(b - a) / 2},${(b - a) / 2} 0 0 1 ${b},${y} Z`} fill="var(--car-arch)" />
      ))}
    </g>
  );
}

/** 옆모습 · 부위 위(실루엣 안): 명암·반사·창·램프·손잡이·부착물 */
export function SideOver({ uid, sil, art, attach }: { uid: string; sil: string; art: Art; attach: string[] }) {
  const [s1, s2] = art.shoulder;
  const [k1, k2, ky] = art.skirt;
  const [b1, b2, by] = art.belt;
  const g0 = art.glass[0];
  const gx = Number(/M(\d+)/.exec(g0)?.[1] ?? 178);
  return (
    <g pointerEvents="none">
      <g clipPath={`url(#${sil})`}>
        <rect x="0" y="0" width="470" height="170" fill={`url(#${uid}-shade)`} />
        {/* 문짝에 비친 빛 */}
        <path d={`M${b1 - 20},${ky} L${b1 + 40},${by + 8} L${b1 + 86},${by + 8} L${b1 + 24},${ky} Z`} fill="var(--car-sheen)" opacity="0.3" filter={`url(#${uid}-soft)`} />
        {!art.truck && <path d={`M${b2 - 80},${ky - 4} L${b2 - 42},${by + 10} L${b2 - 26},${by + 10} L${b2 - 64},${ky - 4} Z`} fill="var(--car-sheen)" opacity="0.2" filter={`url(#${uid}-soft)`} />}
        {/* 어깨선(빛) + 그 아래 그늘, 아래쪽 캐릭터 라인 */}
        <path d={`M${art.truck ? 6 : 42},${s1} C150,${s1 - 5} 300,${s2 + 3} ${art.truck ? 466 : 448},${s2}`} fill="none" stroke="var(--car-sheen)" strokeWidth="1.4" opacity="0.9" />
        <path d={`M${art.truck ? 6 : 42},${s1 + 2} C150,${s1 - 3} 300,${s2 + 5} ${art.truck ? 466 : 448},${s2 + 2}`} fill="none" stroke="var(--car-depth)" strokeWidth="1" opacity="0.14" />
        {!art.truck && <path d={`M${k1 + 18},${ky - 12} C220,${ky - 15} 300,${ky - 15} ${k2 - 4},${ky - 13}`} fill="none" stroke="var(--car-depth)" strokeWidth="0.9" opacity="0.16" />}
        {/* 사이드 스커트 그늘 */}
        <path d={`M${k1},${ky} L${k2},${ky} L${k2 - 4},${ky + 12} L${k1 + 4},${ky + 12} Z`} fill="var(--car-depth)" opacity="0.12" />
        {/* 화물차 적재함: 위 테두리, 기둥·경첩 */}
        {art.truck && (
          <g>
            <path d="M152,66 L468,66" stroke="var(--car-sheen)" strokeWidth="1.6" opacity="0.9" />
            <path d="M152,70 L468,70" stroke="var(--car-depth)" strokeWidth="1" opacity="0.18" />
            {[256, 360].map((x) => (
              <path key={x} d={`M${x},66 L${x},118`} stroke="var(--car-seam)" strokeWidth="1.2" />
            ))}
            <path d="M152,116 L468,116" stroke="var(--car-depth)" strokeWidth="2" opacity="0.2" />
          </g>
        )}
      </g>
      {/* 창: 검은 창틀, 유리, 빛 줄기, 크롬 벨트 라인 */}
      <path d={art.frame} fill="var(--car-trim)" />
      {art.glass.map((d) => (
        <path key={d} d={d} fill={`url(#${uid}-glassArt)`} />
      ))}
      <path d={`M${gx + 18},${by - 1} L${gx + 58},${by - 36} L${gx + 74},${by - 37} L${gx + 34},${by - 1} Z`} fill="var(--car-sheen)" opacity="0.26" />
      <path d={`M${b1},${by} L${b2},${by}`} stroke={`url(#${uid}-chrome)`} strokeWidth="1.8" />
      {/* 헤드램프·리어램프 */}
      <path d={art.head} fill={`url(#${uid}-glassArt)`} stroke="var(--car-outline)" strokeWidth="0.7" />
      <path d={art.tail} fill={`url(#${uid}-tail)`} />
      {/* 손잡이(차체색 + 그늘), 주유구 */}
      {art.handles.map((x) => (
        <g key={x}>
          <rect x={x} y={art.handleY} width={22} height={5} rx={2.5} fill="var(--car-body-hi)" stroke="var(--car-seam)" strokeWidth="0.8" />
          <path d={`M${x + 2},${art.handleY + 6} L${x + 20},${art.handleY + 6}`} stroke="var(--car-depth)" strokeWidth="1" opacity="0.2" />
        </g>
      ))}
      {art.fuel && <circle cx={art.fuel[0]} cy={art.fuel[1]} r={6.5} fill="none" stroke="var(--car-seam)" strokeWidth="0.9" />}
      {/* 부착물 */}
      {attach.includes("roof_rack") && (
        <g>
          <rect x={art.rack[0]} y={art.rack[2] - 5} width={art.rack[1] - art.rack[0]} height={3.4} rx={1.7} fill={`url(#${uid}-chrome)`} stroke="var(--car-outline)" strokeWidth="0.5" />
          {[art.rack[0] + 6, art.rack[1] - 10].map((x) => (
            <rect key={x} x={x} y={art.rack[2] - 3} width={4} height={4} fill="var(--car-trim)" />
          ))}
        </g>
      )}
      {attach.includes("spoiler") && <path d={art.spoiler} fill="var(--car-trim)" stroke="var(--car-outline)" strokeWidth="0.5" />}
      {attach.includes("side_step") && <rect x={art.step[0]} y={art.skirt[2] + 10} width={art.step[1] - art.step[0]} height={5} rx={2.5} fill={`url(#${uid}-chrome)`} stroke="var(--car-outline)" strokeWidth="0.6" />}
    </g>
  );
}

/** 옆모습 · 맨 위: 휠 */
export function SideWheels({ uid, art }: { uid: string; art: Art }) {
  return (
    <g pointerEvents="none">
      {art.wheels.map((x) => (
        <Wheel key={x} uid={uid} x={x} y={132} />
      ))}
    </g>
  );
}

/** 앞·뒷모습 · 부위 밑: 타이어 */
export function EndUnder() {
  return (
    <g pointerEvents="none">
      {[20, 154].map((x) => (
        <rect key={x} x={x} y={140} width={26} height={24} rx={6} fill="var(--car-tire)" />
      ))}
    </g>
  );
}

/** 앞모습 · 부위 위 */
export function FrontOver({ uid, sil, art, attach }: { uid: string; sil: string; art: Art; attach: string[] }) {
  const lamp = (m: (x: number) => number) => (
    <g>
      <circle cx={m(26)} cy={101} r={4.2} fill="var(--car-sheen)" opacity="0.85" stroke="var(--car-outline)" strokeWidth="0.5" />
      <circle cx={m(41)} cy={101} r={4.2} fill="var(--car-sheen)" opacity="0.85" stroke="var(--car-outline)" strokeWidth="0.5" />
      <path d={`M${m(13)},95.5 L${m(58)},94.5`} stroke="var(--car-drl)" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
  return (
    <g pointerEvents="none">
      <g clipPath={`url(#${sil})`}>
        <rect x="0" y="0" width="200" height="170" fill={`url(#${uid}-shade)`} />
        {/* 아래 공기 흡입구, 안개등 */}
        <path d="M58,128 L142,128 L136,143 L64,143 Z" fill={`url(#${uid}-mesh)`} />
        <ellipse cx={30} cy={130} rx={8} ry={3.6} fill={`url(#${uid}-glassArt)`} stroke="var(--car-trim)" strokeWidth="1" />
        <ellipse cx={170} cy={130} rx={8} ry={3.6} fill={`url(#${uid}-glassArt)`} stroke="var(--car-trim)" strokeWidth="1" />
      </g>
      {/* 앞유리: 검은 테두리, 빛 */}
      <path d={art.frontGlass} fill={`url(#${uid}-glassArt)`} stroke="var(--car-trim)" strokeWidth="3.5" strokeLinejoin="round" />
      {(() => {
        const [t, b] = yRange(art.frontGlass);
        return (
          <>
            <path d={`M70,${b - 2} L90,${t + 6} L100,${t + 5} L80,${b - 2} Z`} fill="var(--car-sheen)" opacity="0.22" />
            <path d={`M66,${b - 2} L95,${b - 8} M106,${b - 2} L135,${b - 8}`} stroke="var(--car-trim)" strokeWidth="1.3" strokeLinecap="round" />
          </>
        );
      })()}
      {lamp((x) => x)}
      {lamp((x) => 200 - x)}
      <path d="M62,92 L138,92 L134,116 L66,116 Z" fill="none" stroke={`url(#${uid}-chrome)`} strokeWidth="1.6" />
      <rect x={80} y={118} width={40} height={9} rx={1.5} fill="var(--surface)" stroke="var(--car-outline)" strokeWidth="0.8" />
      {attach.includes("roof_rack") && <EndRack top={art.frontGlass} />}
    </g>
  );
}

/** 경로 y 값의 [가장 위, 가장 아래] */
const yRange = (d: string) => {
  const ys = [...d.matchAll(/,(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return [Math.min(...ys), Math.max(...ys)] as const;
};

/** 앞·뒷모습의 지붕 레일: 유리 위 끝 y 를 경로에서 읽어 그 위에 그린다 */
function EndRack({ top }: { top: string }) {
  const y = yRange(top)[0] - 6;
  return (
    <g>
      {[62, 134].map((x) => (
        <rect key={x} x={x} y={y - 4} width={4} height={6} rx={1} fill="var(--car-trim)" />
      ))}
    </g>
  );
}

/** 뒷모습 · 부위 위 */
export function RearOver({ uid, sil, art, attach }: { uid: string; sil: string; art: Art; attach: string[] }) {
  return (
    <g pointerEvents="none">
      <g clipPath={`url(#${sil})`}>
        <rect x="0" y="0" width="200" height="170" fill={`url(#${uid}-shade)`} />
        {!art.truck && (
          <>
            {/* 디퓨저·배기구 */}
            <path d="M46,132 L154,132 L148,147 L52,147 Z" fill="var(--car-trim)" opacity="0.85" />
            {[64, 136].map((x) => (
              <g key={x}>
                <ellipse cx={x} cy={141} rx={8} ry={3.6} fill={`url(#${uid}-chrome)`} />
                <ellipse cx={x} cy={141} rx={5.6} ry={2.2} fill="var(--car-arch)" />
              </g>
            ))}
          </>
        )}
        {art.truck && <path d="M8,96 L192,96 M8,72 L192,72" stroke="var(--car-seam)" strokeWidth="1.2" />}
      </g>
      <path d={art.rearGlass} fill={`url(#${uid}-glassArt)`} stroke="var(--car-trim)" strokeWidth="3.5" strokeLinejoin="round" />
      {!art.truck && <path d={`M86,${yRange(art.rearGlass)[0] + 4} L114,${yRange(art.rearGlass)[0] + 4}`} stroke="var(--car-tail)" strokeWidth="2" strokeLinecap="round" />}
      {!art.truck && <rect x={80} y={106} width={40} height={9} rx={1.5} fill="var(--surface)" stroke="var(--car-outline)" strokeWidth="0.8" />}
      {art.truck && <rect x={80} y={140} width={40} height={9} rx={1.5} fill="var(--surface)" stroke="var(--car-outline)" strokeWidth="0.8" />}
      {attach.includes("roof_rack") && <EndRack top={art.rearGlass} />}
    </g>
  );
}

/** 위에서 · 부위 위: 등줄기 빛, 유리 테두리, 미러 받침, 선루프·루프랙·스포일러 */
export function TopOver({ uid, sil, art, shapes, attach }: { uid: string; sil: string; art: Art; shapes: Shape[]; attach: string[] }) {
  const glass = shapes.filter((s) => s.look === "glass" && s.clip !== false);
  const [r1, r2] = art.roof;
  const rear = shapes.find((s) => s.part === "trunk" || s.part === "bed_gate");
  return (
    <g pointerEvents="none">
      <g clipPath={`url(#${sil})`}>
        <rect x="0" y="0" width="470" height="200" fill={`url(#${uid}-shadeTop)`} />
        {!art.truck && <path d="M48,66 Q100,62 160,64 M48,134 Q100,138 160,136" fill="none" stroke="var(--car-sheen)" strokeWidth="1.2" opacity="0.85" />}
        {glass.map((g) => (
          <path key={g.part} d={g.d} fill="none" stroke="var(--car-trim)" strokeWidth="3.2" />
        ))}
        {attach.includes("sunroof") && <rect x={r1 + 8} y={56} width={Math.min(r2 - r1 - 16, 130)} height={88} rx={8} fill={`url(#${uid}-glassArt)`} stroke="var(--car-trim)" strokeWidth="2.4" />}
        {attach.includes("roof_rack") && [44, 152].map((y) => <rect key={y} x={r1 + 4} y={y} width={r2 - r1 - 8} height={4} rx={2} fill={`url(#${uid}-chrome)`} stroke="var(--car-outline)" strokeWidth="0.5" />)}
        {attach.includes("spoiler") && rear && <rect x={art.truck ? r1 : rear.box[0] - 6} y={34} width={6} height={132} rx={3} fill="var(--car-trim)" />}
      </g>
    </g>
  );
}
