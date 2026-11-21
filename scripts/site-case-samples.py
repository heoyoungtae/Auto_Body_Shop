# 사용: python3 scripts/site-case-samples.py  (public/site-art/cases/*.svg 를 다시 그린다)
# 작업 사례 예시 그림(전·후) 만들기: 차체 판을 가까이서 본 모습 + 손상. 실제 사진이 아님을 그림 안에도 적는다.
import math, os
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "site-art", "cases")
W, H = 800, 600

COLORS = {
  "white": ("#f4f5f7", "#d9dde3", "#aeb4bd"),
  "black": ("#2b3038", "#14171c", "#050607"),
  "red":   ("#c8263f", "#8e0c22", "#4a0410"),
  "blue":  ("#3d5f8f", "#22395c", "#0e1a2c"),
  "silver":("#d7dbe0", "#a9afb8", "#6e757f"),
  "gray":  ("#7c838d", "#4f555e", "#262a30"),
}

def head(c):
  hi, mid, lo = COLORS[c]
  return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
<defs>
 <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mid}"/><stop offset=".42" stop-color="{hi}"/><stop offset=".5" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>
 <linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <radialGradient id="dent" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".55" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
 <radialGradient id="dentHi" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".7" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <filter id="b"><feGaussianBlur stdDeviation="1.4"/></filter>
 <filter id="b4"><feGaussianBlur stdDeviation="4"/></filter>
 <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .2  0 0 0 0 .05  0 0 0 .9 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>
<rect width="{W}" height="{H}" fill="#0f1115"/>
'''

def panel(extra_lines=""):
  # 문짝 판 + 프레스 라인 + 손잡이 + 반사 줄
  return f'''<path d="M-10 70 C 200 50, 600 50, 810 80 L 810 560 C 600 585, 200 585, -10 560 Z" fill="url(#p)"/>
<path d="M-10 250 C 250 232, 560 232, 810 252" stroke="#000" stroke-opacity=".22" stroke-width="3" fill="none"/>
<path d="M-10 254 C 250 236, 560 236, 810 256" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" fill="none"/>
<rect x="560" y="190" width="120" height="22" rx="11" fill="#000" opacity=".28"/>
<rect x="566" y="193" width="108" height="10" rx="5" fill="#fff" opacity=".18"/>
{extra_lines}'''

def streaks(warp=None):
  # 조명 반사 줄. warp=(cx,cy,r,depth) 이면 찌그러진 곳에서 줄이 휜다
  out = []
  for y0, w, op in [(140, 6, .85), (165, 2, .5), (330, 4, .55), (352, 1.5, .4)]:
    pts = []
    for x in range(-10, 811, 10):
      y = y0 + (x - 400) ** 2 / 9000 * -1 + 8
      if warp:
        cx, cy, r, d = warp
        dist = math.hypot(x - cx, y - cy)
        if dist < r * 1.4:
          k = math.exp(-(dist / r) ** 2 * 1.6)
          y += d * k * (1 if y > cy else -1) * 0.9 + d * k * 0.6 * math.sin((x - cx) / r * 3.1)
      pts.append(f"{x},{y:.1f}")
    out.append(f'<polyline points="{" ".join(pts)}" stroke="url(#s)" stroke-width="{w}" fill="none" opacity="{op}" filter="url(#b)"/>')
  return "\n".join(out)

def label(side):
  t = "수리 전" if side == "before" else "수리 후"
  return f'''<g font-family="Pretendard, sans-serif" font-weight="700">
<rect x="24" y="24" width="132" height="64" rx="32" fill="#c8102e"/>
<text x="90" y="68" font-size="38" fill="#fff" text-anchor="middle">예시</text>
<rect x="{W-200}" y="{H-88}" width="176" height="64" rx="32" fill="#000" opacity=".62"/>
<text x="{W-112}" y="{H-44}" font-size="36" fill="#fff" text-anchor="middle">{t}</text>
<text x="{W/2}" y="{H-14}" font-size="20" fill="#fff" fill-opacity=".7" text-anchor="middle">실제 작업사진 준비중</text>
</g></svg>'''

def dent(c, cx, cy, r):
  return lambda side: head(c) + panel() + (streaks((cx, cy, r, 34)) + f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.72}" fill="url(#dent)"/><ellipse cx="{cx-r*.25}" cy="{cy-r*.2}" rx="{r*.9}" ry="{r*.6}" fill="url(#dentHi)"/>' if side == "before" else streaks()) + label(side)

def scratch(c, lines, deep=False):
  def f(side):
    s = head(c) + panel() + streaks()
    if side == "before":
      for (x1, y1, x2, y2, w) in lines:
        s += f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#fff" stroke-opacity=".85" stroke-width="{w}" stroke-linecap="round"/>'
        s += f'<line x1="{x1}" y1="{y1+2}" x2="{x2}" y2="{y2+2}" stroke="#000" stroke-opacity=".25" stroke-width="{w*.6}" stroke-linecap="round"/>'
        if deep:
          s += f'<line x1="{x1+20}" y1="{y1+1}" x2="{x2-30}" y2="{y2+1}" stroke="#8a929c" stroke-width="{w*.5}" stroke-linecap="round"/>'
    return s + label(side)
  return f

def bumper(c):
  def f(side):
    hi, mid, lo = COLORS[c]
    s = head(c) + f'''<path d="M-10 120 C 300 90, 600 100, 760 160 C 800 175, 812 230, 812 300 L 812 600 L -10 600 Z" fill="url(#p)"/>
<path d="M-10 420 C 300 400, 600 405, 812 430" stroke="#000" stroke-opacity=".35" stroke-width="4" fill="none"/>
<rect x="80" y="455" width="520" height="70" rx="20" fill="#111" opacity=".85"/>
<g stroke="#2a2e35" stroke-width="3">{"".join(f'<line x1="{100+i*40}" y1="465" x2="{100+i*40}" y2="515"/>' for i in range(13))}</g>
''' + streaks()
    if side == "before":
      s += '<path d="M640 170 C 720 190, 790 240, 800 330 L 760 360 C 740 300, 700 240, 630 205 Z" fill="#b9bec6" opacity=".85" filter="url(#b)"/>'
      s += "".join(f'<line x1="{650+i*14}" y1="{190+i*12}" x2="{720+i*10}" y2="{260+i*12}" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>' for i in range(6))
    return s + label(side)
  return f

def rust(c):
  def f(side):
    s = head(c) + panel() + streaks()
    # 바퀴 둘레(휠 하우스)
    s += '<path d="M200 600 C 200 430, 600 430, 600 600 Z" fill="#07080a"/><path d="M200 600 C 200 430, 600 430, 600 600" stroke="#000" stroke-opacity=".5" stroke-width="8" fill="none"/>'
    if side == "before":
      for (x, y, r) in [(215, 520, 20), (245, 478, 14), (300, 452, 11), (560, 470, 16), (585, 515, 22), (520, 448, 8), (230, 560, 12)]:
        s += f'<circle cx="{x}" cy="{y}" r="{r*1.6}" fill="#6b3a12" opacity=".35" filter="url(#b4)"/>'
        s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#8b4513" filter="url(#rough)"/><circle cx="{x}" cy="{y}" r="{r*.55}" fill="#5a2b0c" opacity=".8"/>'
    return s + label(side)
  return f

def chips(c):
  def f(side):
    s = head(c) + panel() + streaks()
    if side == "before":
      import random
      random.seed(7)
      for _ in range(38):
        x, y = random.randint(40, 760), random.randint(90, 300)
        r = random.choice([2, 2.5, 3, 4])
        s += f'<circle cx="{x}" cy="{y}" r="{r+1.5}" fill="#fff" opacity=".6"/><circle cx="{x}" cy="{y}" r="{r}" fill="#6f767f"/>'
    return s + label(side)
  return f

def fade(c):
  def f(side):
    s = head(c) + panel()
    if side == "before":
      s += '<filter id="mot"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .92  0 0 0 0 .92  0 0 0 1.4 -.55"/><feGaussianBlur stdDeviation="3"/></filter>'
      s += '<clipPath id="pc"><path d="M-10 70 C 200 50, 600 50, 810 80 L 810 560 C 600 585, 200 585, -10 560 Z"/></clipPath>'
      s += '<linearGradient id="fm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".8"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="m"><rect width="800" height="600" fill="url(#fm)"/></mask>'
      s += '<g clip-path="url(#pc)" mask="url(#m)"><rect x="0" y="0" width="800" height="600" filter="url(#mot)" opacity=".7"/></g>'
      s += streaks().replace('opacity="0.85"', 'opacity=".2"').replace('opacity="0.55"', 'opacity=".15"')
    else:
      s += streaks()
    return s + label(side)
  return f

CASES = {
  "door-dent": dent("silver", 400, 300, 90),
  "fender-dent": dent("blue", 330, 320, 70),
  "door-scratch": scratch("white", [(140, 300, 620, 335, 3), (180, 318, 560, 346, 2), (250, 290, 470, 305, 1.5)]),
  "bumper-scuff": bumper("black"),
  "rust-arch": rust("red"),
  "hood-fade": fade("red"),
}
for k, fn in CASES.items():
  for side in ("before", "after"):
    open(f"{OUT}/{k}-{side}.svg", "w").write(fn(side))
print(len(os.listdir(OUT)))
