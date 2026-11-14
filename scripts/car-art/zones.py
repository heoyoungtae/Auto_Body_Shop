"""layout.json + 차형별 치수 → 부위 구역(실루엣 안 3×3 칸 상자 포함) TS 파일. 사용: python3 -I zones.py OUTDIR TSFILE"""
import json, sys, re
from shapely.geometry import Polygon, box as rect, Point
from shapely.ops import unary_union
from PIL import Image, ImageDraw

OUT, TS = sys.argv[1], sys.argv[2]
L = json.load(open(OUT + '/layout.json'))
FR = {'side': (470, 170), 'top': (470, 200), 'front': (200, 170), 'rear': (200, 170)}


def sil_poly(d):
    polys = []
    for sub in d.split('M')[1:]:
        pts = [tuple(map(float, p.strip(' Z').split(','))) for p in sub.replace('L', '|').split('|') if p.strip(' Z')]
        if len(pts) >= 3:
            polys.append(Polygon(pts).buffer(0))
    return unary_union(polys)


def seam_poly(left, right, W=470, H=170):
    """두 이음선(위→아래 점 목록) 사이. None 이면 그림 가장자리"""
    lp = left if left else [(0, 0), (0, H)]
    rp = right if right else [(W, 0), (W, H)]
    return Polygon(lp + rp[::-1]).buffer(0)


def d_of(g):
    g = g.buffer(0)
    geoms = getattr(g, 'geoms', [g])
    out = []
    for p in geoms:
        if p.is_empty or p.area < 1:
            continue
        c = list(p.exterior.coords)[:-1]
        out.append('M' + ' L'.join(f'{x:.1f},{y:.1f}'.replace('.0,', ',').replace('.0', '') if False else f'{fmt(x)},{fmt(y)}' for x, y in c) + ' Z')
    return ' '.join(out)


def fmt(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def circle_d(cx, cy, r):
    return f'M{fmt(cx - r)},{fmt(cy)} a{fmt(r)},{fmt(r)} 0 1,0 {fmt(2 * r)},0 a{fmt(r)},{fmt(r)} 0 1,0 {fmt(-2 * r)},0 Z'


def shape(part, g, sil, look=None, free=False, d=None, within=None):
    b = g if free else g.intersection(sil)
    if within is not None:
        b = b.intersection(within)
    if b.is_empty:
        raise SystemExit(f'empty {part}')
    x0, y0, x1, y1 = b.bounds
    s = {'part': part, 'd': d or d_of(g), 'box': [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]}
    if free:
        s['clip'] = False
    if look:
        s['look'] = look
    return s


def mirror_g(x, y, w, h):
    return rect(x, y, x + w, y + h).buffer(min(w, h) * 0.25).intersection(rect(x - 2, y - 2, x + w + 2, y + h + 2))


def side_shapes(p, sil):
    H = 170
    sil = sil.difference(unary_union([Point(cx, cy).buffer(r + 2) for cx, cy, r in p['wheels']]))
    sill = rect(p['fd'][-1][0] - 4, p['sill'], p['qd'][-1][0] + 2, H)
    above = rect(0, 0, 470, p['sill'])
    out = []
    out.append(shape('f_bumper', seam_poly(None, p['fb']), sil))
    out.append(shape('s_f_fender', seam_poly(p['fb'], p['fd']).difference(sill), sil))
    out.append(shape('s_f_door', seam_poly(p['fd'], p['rd']).intersection(above), sil))
    out.append(shape('s_r_door', seam_poly(p['rd'], p['qd']).intersection(above), sil))
    rb = Polygon(p['rb'])
    tr = Polygon(p['trunk']) if p.get('trunk') else None
    q = seam_poly(p['qd'], None).difference(rb).difference(sill)
    if tr:
        q = q.difference(tr)
    out.append(shape('s_quarter', q, sil))
    if tr:
        out.append(shape('trunk', tr.difference(rb), sil))
    out.append(shape('r_bumper', rb, sil))
    out.append(shape('s_sill', sill, sil))
    out.append(shape('s_mirror', mirror_g(*p['mirror']), sil, free=True))
    for n, (cx, cy, r) in (('s_f_wheel', p['wheels'][0]), ('s_r_wheel', p['wheels'][1])):
        out.append(shape(n, Point(cx, cy).buffer(r), sil, free=True, d=circle_d(cx, cy, r)))
    return out


def top_shapes(p, sil, W=470, H=200):
    a, b, c, d, e, f = p['xs']
    dy = p['dy']
    mid = rect(0, dy, W, H - dy)
    out = [shape('f_bumper', rect(0, 0, a, H), sil)]
    for part, x1, x2, look in (('hood', a, b, None), ('windshield', b, c, 'glass'), ('roof', c, d, None), ('rear_glass', d, e, 'glass'), ('trunk', e, f, None)):
        out.append(shape(part, rect(x1, dy, x2, H - dy), sil, look))
    out.append(shape('r_bumper', rect(f, 0, W, H), sil))
    k = p['ks']
    names = ['f_fender', 'f_door', 'r_door', 'quarter']
    for side, y1, y2 in (('r', 0, dy), ('l', H - dy, H)):
        for i, n in enumerate(names):
            out.append(shape(f'{side}_{n}', rect(k[i], y1, k[i + 1], y2), sil))
    mx, my, mw, mh = p['mirror']
    out.append(shape('r_mirror', mirror_g(mx, my, mw, mh), sil, free=True))
    out.append(shape('l_mirror', mirror_g(mx, H - my - mh, mw, mh), sil, free=True))
    return out


def flipx(r, W=200):
    x1, y1, x2, y2 = r
    return (W - x2, y1, W - x1, y2)


def front_shapes(p, sil, W=200, H=170):
    lx1, lx2, ly1, ly2 = p['lamp']
    gx1, gx2, gy1, gy2 = p['grille']
    lampR = rect(lx1, ly1, lx2, ly2)
    lampL = rect(*flipx((lx1, ly1, lx2, ly2)))
    gr = rect(gx1, gy1, gx2, gy2)
    out = [shape('windshield', rect(0, 0, W, p['belt']), sil)]
    if p.get('hood', True):
        out.append(shape('hood', rect(0, p['belt'], W, p['hoodB']).difference(gr), sil))
    out.append(shape('f_bumper', rect(0, p['bumper'], W, H).difference(gr).difference(lampR).difference(lampL), sil))
    if p.get('fender'):
        fx1, fx2, fy1, fy2 = p['fender']
        out.append(shape('r_f_fender', rect(fx1, fy1, fx2, fy2), sil))
        out.append(shape('l_f_fender', rect(*flipx((fx1, fy1, fx2, fy2))), sil))
    out.append(shape('r_headlamp', lampR, sil, 'lamp'))
    out.append(shape('grille', gr, sil, 'grille'))
    out.append(shape('l_headlamp', lampL, sil, 'lamp'))
    mx, my, mw, mh = p['mirror']
    out.append(shape('r_mirror', mirror_g(mx, my, mw, mh), sil, free=True))
    out.append(shape('l_mirror', mirror_g(W - mx - mw, my, mw, mh), sil, free=True))
    return out


def rear_shapes(p, sil, W=200, H=170):
    lx1, lx2, ly1, ly2 = p['lamp']
    lampL = rect(lx1, ly1, lx2, ly2)
    lampR = rect(*flipx((lx1, ly1, lx2, ly2)))
    out = []
    if p.get('truck'):
        gx1, gx2, gy1, gy2 = p['glass']
        out.append(shape('roof', rect(0, 0, W, p['belt']), sil))
        out.append(shape('rear_glass', rect(gx1, gy1, gx2, gy2), sil, 'glass'))
        out.append(shape('bed_gate', rect(0, p['belt'], W, p['bumper']), sil))
    else:
        out.append(shape('rear_glass', rect(0, 0, W, p['belt']), sil))
        out.append(shape('trunk', rect(0, p['belt'], W, p['bumper']).difference(lampL).difference(lampR), sil))
    out.append(shape('r_bumper', rect(0, p['bumper'], W, H).difference(lampL).difference(lampR), sil))
    out.append(shape('l_taillamp', lampL, sil, 'tail'))
    out.append(shape('r_taillamp', lampR, sil, 'tail'))
    mx, my, mw, mh = p['mirror']
    out.append(shape('l_mirror', mirror_g(mx, my, mw, mh), sil, free=True))
    out.append(shape('r_mirror', mirror_g(W - mx - mw, my, mw, mh), sil, free=True))
    return out


P = {
    'sedan': {
        'side': dict(fb=[(58, 0), (58, 104), (66, 120), (68, 170)], fd=[(147, 0), (147, 170)], rd=[(250, 0), (248, 170)],
                     qd=[(357, 0), (357, 55), (338, 108), (330, 170)], rb=[(400, 90), (470, 90), (470, 170), (386, 170), (386, 122)],
                     sill=137, wheels=[(103, 142, 26), (355, 142, 26)], mirror=(157, 67, 27, 16)),
        'top': dict(xs=[40, 130, 205, 338, 400, 432], ks=[40, 145, 250, 335, 470], dy=45, mirror=(156, 3, 22, 28)),
        'front': dict(belt=77, hoodB=97, lamp=(16, 62, 95, 117), grille=(52, 148, 103, 141), bumper=117, mirror=(3, 62, 22, 17)),
        'rear': dict(belt=64, bumper=108, lamp=(16, 63, 76, 93), mirror=(4, 62, 21, 17)),
    },
    'hatch': {
        'side': dict(fb=[(52, 0), (52, 98), (60, 108), (64, 170)], fd=[(153, 0), (150, 100), (153, 170)], rd=[(274, 0), (266, 170)],
                     qd=[(358, 0), (358, 50), (370, 80), (337, 170)], trunk=[(388, 0), (470, 0), (470, 96), (444, 96)],
                     rb=[(415, 96), (470, 96), (470, 170), (420, 170), (418, 110)], sill=132, wheels=[(103, 134, 32), (384, 134, 32)], mirror=(166, 45, 24, 18)),
        'front': dict(belt=70, hoodB=86, lamp=(18, 58, 84, 110), grille=(56, 144, 88, 103), bumper=108, mirror=(4, 56, 22, 17)),
        'rear': dict(belt=58, bumper=102, lamp=(20, 50, 58, 92), mirror=(8, 61, 18, 18)),
    },
    'suv': {
        'side': dict(fb=[(62, 0), (62, 92), (70, 170)], fd=[(153, 0), (150, 170)], rd=[(248, 0), (240, 170)],
                     qd=[(322, 0), (336, 68), (328, 100), (306, 170)], trunk=[(386, 0), (470, 0), (470, 98), (436, 98), (432, 62)],
                     rb=[(400, 98), (470, 98), (470, 170), (392, 170), (392, 118)], sill=128, wheels=[(109, 135, 33), (349, 135, 33)], mirror=(159, 56, 23, 19)),
        'top': dict(xs=[42, 130, 195, 390, 418, 436], ks=[42, 150, 245, 330, 470], dy=45, mirror=(160, 3, 20, 30)),
        'front': dict(belt=70, hoodB=82, lamp=(18, 58, 82, 126), grille=(55, 145, 90, 136), bumper=126, mirror=(4, 54, 21, 17)),
        'rear': dict(belt=70, bumper=112, lamp=(20, 58, 68, 85), mirror=(4, 57, 22, 17)),
    },
    'van': {
        'side': dict(fb=[(42, 0), (42, 108), (68, 114), (68, 170)], fd=[(135, 0), (128, 90), (130, 170)], rd=[(217, 0), (214, 170)],
                     qd=[(312, 0), (312, 170)], trunk=[(418, 0), (470, 0), (470, 118), (418, 118)],
                     rb=[(395, 118), (470, 118), (470, 170), (392, 170)], sill=125, wheels=[(99, 138, 28), (354, 138, 28)], mirror=(132, 47, 20, 20)),
        'top': dict(xs=[42, 80, 160, 398, 414, 432], ks=[42, 130, 216, 312, 470], dy=40, mirror=(130, 2, 22, 26)),
        'front': dict(belt=68, hoodB=80, lamp=(25, 57, 78, 114), grille=(57, 143, 84, 118), bumper=114, mirror=(8, 49, 22, 20)),
        'rear': dict(belt=64, bumper=122, lamp=(24, 42, 60, 108), mirror=(8, 48, 22, 20)),
    },
}
# 해치백 위 모습 = 세단 위 모습을 늘인 것
st, ht = L['sedan']['top'], L['hatch']['top']
fx = ht['w'] / st['w']
mx = lambda x: round(ht['x'] + (x - st['x']) * fx, 1) if x < 470 else 470
sp = P['sedan']['top']
P['hatch']['top'] = dict(xs=[mx(x) for x in sp['xs']], ks=[mx(x) for x in sp['ks']], dy=sp['dy'], mirror=(mx(sp['mirror'][0]), sp['mirror'][1], sp['mirror'][2] * fx, sp['mirror'][3]))


# ---- 화물차: 도면 위 모습이 없어 같은 선 굵기로 그린다
def truck_top():
    els = []
    S = 'fill="none" stroke="#000" stroke-linejoin="round"'
    els.append(f'<path d="M48,33 L200,33 L200,167 L48,167 Q38,167 38,157 L38,43 Q38,33 48,33 Z" {S} stroke-width="1.6"/>')
    els.append(f'<path d="M44,40 Q44,37 47,37 L62,37 L62,163 L47,163 Q44,163 44,160 Z" {S} stroke-width="1"/>')
    els.append(f'<rect x="64" y="39" width="132" height="122" rx="6" {S} stroke-width="1"/>')
    els.append(f'<path d="M74,39 L74,161 M188,39 L188,161" {S} stroke-width="0.6"/>')
    for y, sgn in ((33, -1), (167, 1)):
        y2 = y + sgn * 9
        els.append(f'<path d="M60,{y} L57,{y2}" {S} stroke-width="1.2"/>')
        els.append(f'<rect x="51" y="{min(y2, y2 + sgn * 9)}" width="13" height="9" rx="2.5" {S} stroke-width="1.2"/>')
    els.append(f'<rect x="204" y="34" width="226" height="132" rx="1.5" {S} stroke-width="1.6"/>')
    els.append(f'<rect x="209" y="39" width="216" height="122" {S} stroke-width="1"/>')
    for y in (64, 84, 100, 116, 136):
        els.append(f'<path d="M212,{y} L422,{y}" {S} stroke-width="0.6"/>')
    els.append(f'<path d="M425,39 L425,161" {S} stroke-width="1"/>')
    els.append(f'<path d="M201,60 L203,60 M201,140 L203,140" {S} stroke-width="1"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 200" preserveAspectRatio="none">' + ''.join(els) + '</svg>'
    open(OUT + '/truck-top.svg', 'w').write(svg)
    sil = unary_union([rect(38, 33, 201, 167).buffer(0), rect(203, 33, 431, 167), rect(50, 22, 65, 33), rect(50, 167, 65, 178), rect(199, 58, 205, 142)])
    return sil


truck_sil_top = truck_top()
TR = {
    'side': None,  # 아래에서 직접
}


def truck_side(sil):
    out = []
    sil = sil.difference(unary_union([Point(131, 137).buffer(28), Point(331, 138).buffer(26)]))
    out.append(shape('f_bumper', rect(0, 103, 62, 170), sil))
    out.append(shape('s_f_fender', rect(0, 0, 74, 103), sil))
    out.append(shape('s_f_door', rect(74, 0, 202, 112), sil))
    out.append(shape('s_sill', rect(62, 112, 202, 170), sil))
    out.append(shape('s_bed', Polygon([(202, 0), (470, 0), (470, 105), (418, 105), (418, 170), (202, 170)]), sil, within=rect(206, 76, 432, 142)))
    out.append(shape('r_bumper', rect(418, 105, 470, 170), sil))
    out.append(shape('s_mirror', mirror_g(49, 45, 21, 19), sil, free=True))
    for n, (cx, cy, r) in (('s_f_wheel', (131, 137, 26)), ('s_r_wheel', (331, 138, 24))):
        out.append(shape(n, Point(cx, cy).buffer(r), sil, free=True, d=circle_d(cx, cy, r)))
    return out


def truck_topz(sil):
    H = 200
    out = [shape('f_bumper', rect(0, 0, 40, H), sil), shape('windshield', rect(40, 37, 63, 163), sil, 'glass'),
           shape('roof', rect(63, 37, 202, 163), sil), shape('bed_floor', rect(202, 38, 426, 162), sil), shape('bed_gate', rect(426, 0, 470, H), sil)]
    for side, y1, y2 in (('r', 0, 38), ('l', 162, 200)):
        out += [shape(f'{side}_f_fender', rect(40, y1, 74, y2), sil), shape(f'{side}_f_door', rect(74, y1, 202, y2), sil), shape(f'{side}_bed', rect(202, y1, 426, y2), sil)]
    out.append(shape('r_mirror', mirror_g(50, 12, 15, 11), sil, free=True))
    out.append(shape('l_mirror', mirror_g(50, 177, 15, 11), sil, free=True))
    return out


views_ts = {}
for body in ['sedan', 'hatch', 'suv', 'van', 'truck']:
    V = {}
    for v in ['side', 'top', 'front', 'rear']:
        if body == 'truck' and v == 'top':
            g = {'x': 0, 'y': 0, 'w': 470, 'h': 200}
            sil = truck_sil_top
            sild = d_of(sil)
            img = 'truck-top'
            shapes = truck_topz(sil)
        else:
            g = L[body][v]
            sild = g['sil']
            sil = sil_poly(sild)
            img = g.get('src', f'{body}-{v}')
            if body == 'truck':
                shapes = truck_side(sil) if v == 'side' else front_shapes(dict(belt=68, lamp=(30, 52, 78, 110), grille=(52, 148, 70, 110), bumper=110, hood=False, fender=(28, 54, 62, 78), mirror=(16, 50, 18, 24)), sil) if v == 'front' else rear_shapes(dict(truck=True, belt=80, bumper=112, glass=(58, 142, 18, 52), lamp=(36, 66, 115, 130), mirror=(16, 48, 18, 24)), sil)
            else:
                fn = {'side': side_shapes, 'top': top_shapes, 'front': front_shapes, 'rear': rear_shapes}[v]
                shapes = fn(P[body][v], sil)
        V[v] = {'img': f'/car/{img}.svg', 'x': g['x'], 'y': g['y'], 'w': g['w'], 'h': g['h'], 'sil': sild, 'shapes': shapes}
    views_ts[body] = V

head = '''// 자동 생성 파일(scripts/car-art/zones.py) — 직접 고치지 말 것.
// 차 그림: GetOutlines(getoutlines.com) 무료 도면(CC BY 4.0)을 선화로 바꾼 것. 엠블럼·안테나는 지웠다. 화물차 위 모습은 직접 그렸다.
// 면 좌표: 옆 470×170(앞이 왼쪽), 위 470×200(앞이 왼쪽, 위쪽이 차 오른쪽), 앞·뒤 200×170.
// 옆모습 부위 이름의 "s_" 는 왼쪽(l_)·오른쪽(r_)으로 바꿔 쓴다.
import type { Shape } from "./body-map";

export type ArtView = { img: string; x: number; y: number; w: number; h: number; sil: string; shapes: Shape[] };
export type ArtBody = { side: ArtView; top: ArtView; front: ArtView; rear: ArtView };

'''
body = 'export const CAR_ART: Record<"sedan" | "hatch" | "suv" | "van" | "truck", ArtBody> = ' + json.dumps(views_ts, ensure_ascii=False, indent=1) + ';\n'
open(TS, 'w').write(head + body)
print('ok', TS)
