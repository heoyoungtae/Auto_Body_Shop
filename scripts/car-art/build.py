"""무료 도면(GetOutlines, CC BY 4.0) → 면별 선화 SVG + 실루엣 + 배치. 사용: python3 -I build.py OUTDIR"""
import sys, json, subprocess, re, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

BP = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

E = 'c-hyundai-elantra-2017.png'
I = 'c-hyundai-i30-2008.gif'
S = 'hyundai-santa-fe-2018.png'
H = 'hyundai-h-1-2008-02.gif'
B = 'c-kia-bongo-iii-2010.png'
# (src, crop, erase(abs), flip, rot180, thr, upscale)
SPEC = {
    'sedan': {
        'side': (E, (258, 0, 807, 182), [], True, False),
        'front': (E, (0, 0, 256, 182), [(118, 97, 140, 111)], False, False),
        'rear': (E, (0, 255, 258, 432), [(117, 305, 140, 320)], False, False),
        'top': (E, (258, 185, 807, 432), [], False, True),
    },
    'hatch': {
        'side': (I, (0, 40, 1096, 442), [(175, 25, 240, 73)], True, False),
        'rear': (I, (0, 445, 532, 882), [(250, 445, 275, 500), (228, 600, 285, 655)], False, False),
        'front': (I, (535, 445, 1096, 882), [(790, 450, 812, 497), (775, 660, 830, 700)], False, False),
    },
    'suv': {
        'front': (S, (0, 0, 302, 234), [(133, 112, 163, 137, 29)], False, False),
        'side': (S, (303, 0, 947, 234), [], True, False),
        'rear': (S, (0, 290, 302, 530), [(133, 363, 163, 388)], False, False),
        'top': (S, (303, 234, 947, 530), [], False, True),
    },
    'van': {
        'rear': (H, (0, 10, 460, 395), [(205, 185, 252, 212), (290, 10, 315, 50)], False, False),
        'side': (H, (515, 10, 1470, 395), [(900, 10, 955, 48)], False, False),
        'front': (H, (0, 415, 460, 805), [(205, 632, 252, 662), (130, 415, 150, 462)], False, False),
        'top': (H, (515, 405, 1470, 822), [(820, 475, 978, 752), (975, 595, 1400, 632), (1163, 452, 1200, 772)], False, False),
    },
    'truck': {
        'front': (B, (0, 0, 130, 130), [(56, 60, 71, 72)], False, False),
        'rear': (B, (150, 0, 280, 130), [], False, False),
        'side': (B, (305, 0, 633, 130), [], False, False),
    },
}
THR = {'truck': 175}
K = {'truck': 6}


def load(body, view):
    src, box, erase, flip, rot = SPEC[body][view]
    im = Image.open(os.path.join(BP, src)).convert('L').crop(box)
    d = ImageDraw.Draw(im)
    a = np.array(im)
    if src == B:  # 워터마크(옅은 회색 글자) 지우기
        wy0, wx0 = 104 - box[1], max(470 - box[0], 0)
        if wx0 < a.shape[1]:
            r = a[wy0:, wx0:]
            r[r > 160] = 255
    for e in erase:
        x0, y0, x1, y1 = e[0] - box[0], e[1] - box[1], e[2] - box[0], e[3] - box[1]
        if len(e) == 5:  # 무늬(그릴)는 옆 무늬를 옮겨 채운다
            a[y0:y1 + 1, x0:x1 + 1] = a[y0:y1 + 1, x0 - e[4]:x1 + 1 - e[4]]
            continue
        x0, y0 = max(x0, 1), max(y0, 1)
        x1, y1 = min(x1, a.shape[1] - 2), min(y1, a.shape[0] - 2)
        a[y0:y1 + 1, x0:x1 + 1] = 255
        # 지운 칸을 가로지르던 선은 이어 준다
        for y in range(y0, y1 + 1):
            if (a[y, max(x0 - 3, 0):x0] < 140).all() and (a[y, x1 + 1:x1 + 4] < 140).all() and (a[max(y - 2, 0):y + 3, x0 - 1] < 140).sum() <= 3:
                a[y, x0:x1 + 1] = min(a[y, x0 - 1], a[y, x1 + 1])
        for x in range(x0, x1 + 1):
            if (a[max(y0 - 3, 0):y0, x] < 140).all() and (a[y1 + 1:y1 + 4, x] < 140).all() and (a[y0 - 1, max(x - 2, 0):x + 3] < 140).sum() <= 3:
                a[y0:y1 + 1, x] = min(a[y0 - 1, x], a[y1 + 1, x])
    # 바닥선(가로로 길게 이어진 줄) 지우기
    dark = a < 160
    for y in range(int(a.shape[0] * 0.93), a.shape[0]):
        if dark[y].mean() > 0.45:
            a[y] = 255
    im = Image.fromarray(a)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        im = im.transpose(Image.ROTATE_180)
    m = np.array(im) < THR.get(body, 190)
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    # 작은 부스러기(글자·치수 조각) 버리기: 가장 큰 덩어리 bbox 기준으로 자르기
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.zeros_like(m)
    big = sizes.max()
    for i, sz in enumerate(sizes, 1):
        if sz >= 10:
            keep |= lab == i
    ys, xs = np.where(keep)
    bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    g = np.array(im)
    g[~ndi.binary_dilation(keep, iterations=1)] = 255
    im = Image.fromarray(g).crop(bb)
    return im


def silhouette(im, thr):
    m = np.array(im) < thr
    c = ndi.binary_closing(np.pad(m, 4), structure=np.ones((3, 3)), iterations=2)
    filled = ndi.binary_fill_holes(c)
    filled = ndi.binary_opening(filled, iterations=1)
    lab, n = ndi.label(filled)
    if n > 1:
        sizes = ndi.sum(filled, lab, range(1, n + 1))
        # 바퀴처럼 떨어진 덩어리도 남김(크기 2% 이상)
        filled = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.02])
    return filled[4:-4, 4:-4]


def trace_svg(im, out, thr, k):
    w, h = im.size
    big = im.resize((w * k, h * k), Image.LANCZOS)
    bw = big.point(lambda v: 0 if v < thr else 255).convert('1')
    pbm = out + '.pbm'
    bw.save(pbm)
    subprocess.run(['potrace', '-s', '-o', out + '.svg', '--turdsize', str(2 * k), '--alphamax', '1.0', '--opttolerance', '0.6', '-u', '1', pbm], check=True)
    os.remove(pbm)
    s = open(out + '.svg').read()
    # 군더더기 지우기, 크기는 viewBox 만
    s = re.sub(r'<\?xml.*?\?>\s*', '', s)
    s = re.sub(r'<!DOCTYPE.*?>\s*', '', s, flags=re.S)
    s = re.sub(r'<metadata>.*?</metadata>\s*', '', s, flags=re.S)
    s = re.sub(r'width="[^"]*pt" height="[^"]*pt"', '', s)
    s = s.replace('preserveAspectRatio="xMidYMid meet"', 'preserveAspectRatio="none"')
    open(out + '.svg', 'w').write(s)


def mask_path(mask, s, ox, oy):
    """마스크 → potrace geojson → 프레임 좌표 경로"""
    h, w = mask.shape
    Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).convert('1').save('/tmp/_m.pbm')
    r = subprocess.run(['potrace', '-b', 'geojson', '-o', '-', '--turdsize', '20', '--alphamax', '1.2', '--opttolerance', '1', '/tmp/_m.pbm'], check=True, capture_output=True, text=True)
    gj = json.loads(r.stdout)
    parts = []
    for f in gj['features']:
        rings = f['geometry']['coordinates']
        ring = rings[0]  # 바깥 테두리만
        pts = [(ox + x * s, oy + (h - y) * s) for x, y in ring]
        pts = simplify(pts, 0.6)
        parts.append('M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z')
    return ' '.join(parts)


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    def rdp(p):
        if len(p) < 3:
            return p
        a, b = np.array(p[0]), np.array(p[-1])
        ab = b - a
        L = np.hypot(*ab) or 1e-9
        d = [abs(ab[0] * (q[1] - a[1]) - ab[1] * (q[0] - a[0])) / L for q in p[1:-1]]
        i = int(np.argmax(d))
        if d[i] > tol:
            return rdp(p[:i + 2])[:-1] + rdp(p[i + 1:])
        return [p[0], p[-1]]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    m = len(pts) // 2
    return rdp(pts[:m + 1])[:-1] + rdp(pts[m:] + [pts[0]])[:-1]


FRAME = {'side': (470, 170), 'top': (470, 200), 'front': (200, 170), 'rear': (200, 170)}
GROUND = 166
layout = {}
for body, views in SPEC.items():
    ims = {v: load(body, v) for v in views}
    sw, sh = ims['side'].size
    s = min(456 / sw, 156 / sh)
    if 'top' in ims:
        w, h = ims['top'].size
        s = min(s, 456 / w, 192 / h)
    se = 9
    for v in ('front', 'rear'):
        w, h = ims[v].size
        se = min(se, 192 / w, 156 / h)
    L = {}
    for v, im in ims.items():
        w, h = im.size
        sc = se if v in ('front', 'rear') else s
        fw, fh = FRAME[v]
        W, Hh = w * sc, h * sc
        x = (fw - W) / 2
        y = (fh - Hh) / 2 if v == 'top' else GROUND - Hh
        thr = THR.get(body, 190)
        trace_svg(im, f'{OUT}/{body}-{v}', thr, K.get(body, 3))
        im.save(f'{OUT}/{body}-{v}.png')
        sil = mask_path(silhouette(im, thr), sc, x, y)
        L[v] = {'x': round(x, 1), 'y': round(y, 1), 'w': round(W, 1), 'h': round(Hh, 1), 'sil': sil, 'px': [w, h]}
    layout[body] = L
    print(body, 'scale', round(s, 3), {v: (L[v]['x'], L[v]['y'], L[v]['w'], L[v]['h']) for v in L})
json.dump(layout, open(f'{OUT}/layout.json', 'w'))

# 해치백 위 모습: 세단 위 모습을 해치백 길이에 맞춰 늘이고 줄인다
st, hs = layout['sedan']['top'], layout['hatch']['side']
fx = hs['w'] / st['w']
nx = (470 - hs['w']) / 2
def rex(d):
    return re.sub(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', lambda m: f"{nx + (float(m.group(1)) - st['x']) * fx:.1f},{m.group(2)}", d)
layout['hatch']['top'] = {**st, 'x': round(nx, 1), 'w': hs['w'], 'sil': rex(st['sil']), 'src': 'sedan-top'}
json.dump(layout, open(f'{OUT}/layout.json', 'w'))
