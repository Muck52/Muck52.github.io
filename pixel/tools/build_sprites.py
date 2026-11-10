"""Build the Norwegian Forest Cat sprite set from the reference sheet.

Usage: python3 pixel/tools/build_sprites.py   (from the repo root)

Steps
 1. Recover the sheet's native pixel grid (pitch found by edge periodicity: 3.196 x 3.248 px per art pixel,
    so the art is 320 x 176). Each cell takes the median of its centre, which also removes JPEG noise.
 2. Flood-fill the flat background and the cool ground shadows in from the outside; the black outline
    stops the fill, so dark fur inside a cat is never mistaken for shadow.
 3. Split into connected sprites (the five poses; the title text is dropped).
 4. One shared palette: median cut over the brown/cream/charcoal fur, plus reserved slots for the
    eye greens and nose pinks, so the small accents survive. Accents only go where the source was green/pink.
 5. Cleanup: near-identical stray pixels join their neighbours; specks under 3 px are removed.
 6. Hand pass: the seated portrait's eyes are repainted as large almond eyes with a catchlight.
Outputs go to pixel/sprites/.
"""
import json, os
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference', 'nfc-sheet-gemini.jpg')
OUT = os.path.join(ROOT, 'sprites')
PITCH_X, PHASE_X, PITCH_Y, PHASE_Y, GW, GH = 3.196, 0.4, 3.248, 1.7, 320, 176
BG, SHADOW = np.array([70, 73, 80]), np.array([44, 41, 49])
POSES = [  # name, title, rough centre in native coordinates (used to pick the component)
    ('sit', 'Seated portrait', (95, 60)),
    ('stalk', 'Stalk / pounce wind-up', (195, 40)),
    ('stand', 'Standing', (268, 35)),
    ('swipe', 'Paw swipe', (200, 135)),
    ('arch', 'Back arch stretch', (265, 130)),
]

def native_grid(src):
    im = np.asarray(Image.open(src).convert('RGB')).astype(float)
    nat = np.zeros((GH, GW, 3), np.uint8)
    for j in range(GH):
        for i in range(GW):
            x0, y0 = PHASE_X + i * PITCH_X, PHASE_Y + j * PITCH_Y
            xa = int(round(x0 + 0.8)); xb = max(xa + 1, int(round(x0 + PITCH_X - 0.8)))
            ya = int(round(y0 + 0.8)); yb = max(ya + 1, int(round(y0 + PITCH_Y - 0.8)))
            blk = im[ya:yb, xa:xb].reshape(-1, 3)
            nat[j, i] = np.median(blk, axis=0)
    return nat

def flood(mask_ok, seeds, shape):
    h, w = shape
    seen = np.zeros(shape, bool); q = deque()
    for x, y in seeds:
        if mask_ok[y, x] and not seen[y, x]: seen[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and mask_ok[Y, X] and not seen[Y, X]: seen[Y, X] = True; q.append((X, Y))
    return seen

def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), int); n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1; q = deque([(x, y)]); lab[y, x] = n
                while q:
                    a, b = q.popleft()
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            X, Y = a + dx, b + dy
                            if 0 <= X < w and 0 <= Y < h and mask[Y, X] and not lab[Y, X]: lab[Y, X] = n; q.append((X, Y))
    return lab, n

def is_green(c): return (c[..., 1] > c[..., 0] + 8) & (c[..., 1] > c[..., 2] + 4)
def is_pink(c): return (c[..., 0] > c[..., 1] + 35) & (c[..., 0] > c[..., 2] + 25)

def median_cut(px, n):
    q = Image.fromarray(px.astype(np.uint8).reshape(1, -1, 3)).quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.array(q.getpalette()[:3 * n]).reshape(-1, 3)

def main():
    nat = native_grid(REF).astype(int)
    H, W, _ = nat.shape
    bglike = np.sqrt(((nat - BG) ** 2).sum(2)) < 16
    shlike = (np.sqrt(((nat - SHADOW) ** 2).sum(2)) < 14) & (nat[..., 2] >= nat[..., 0] - 3)
    border = [(x, y) for y in range(H) for x in range(W) if (x in (0, W - 1) or y in (0, H - 1))]
    outside = flood(bglike | shlike, [p for p in border if bglike[p[1], p[0]]], (H, W))
    lab, _ = components(~outside)

    crops = {}
    for name, title, (cx, cy) in POSES:
        k = lab[cy, cx] or np.bincount(lab[cy - 6:cy + 6, cx - 6:cx + 6].ravel())[1:].argmax() + 1
        ys, xs = np.where(lab == k)
        x0, x1, y0, y1 = xs.min() - 1, xs.max() + 2, ys.min() - 1, ys.max() + 2
        img = nat[y0:y1, x0:x1].copy(); m = lab[y0:y1, x0:x1] == k
        h, w = m.shape
        lum = img.mean(2)
        shadowish = (img[..., 2] >= img[..., 0] + 3) & (lum > 25) & (lum < 70)
        edge = [(x, y) for y in range(h) for x in range(w) if m[y, x] and shadowish[y, x] and
                any(not (0 <= x + dx < w and 0 <= y + dy < h) or not m[y + dy, x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        m &= ~flood(m & shadowish, edge, (h, w))          # ground-shadow remnants touching the outside
        crops[name] = (img, m, title)

    allpx = np.concatenate([c[0][c[1]] for c in crops.values()])
    acc_mask = is_green(allpx) | is_pink(allpx)
    pal = np.concatenate([median_cut(allpx[~acc_mask], 26), median_cut(allpx[is_green(allpx)], 3), median_cut(allpx[is_pink(allpx)], 3)])
    keep = []
    for c in pal:
        if all(((c - k) ** 2).sum() > 30 for k in keep): keep.append(c)
    pal = [tuple(int(v) for v in c) for c in keep]
    pal_np = np.array(pal)
    isacc = is_green(pal_np) | is_pink(pal_np)

    sprites = {}
    for name, (img, m, title) in crops.items():
        h, w = m.shape
        out = -np.ones((h, w), int)
        g, p = is_green(img), is_pink(img)
        for y in range(h):
            for x in range(w):
                if not m[y, x]: continue
                d = ((pal_np - img[y, x]) ** 2).sum(1)
                if not (g[y, x] or p[y, x]): d = d + isacc * 10 ** 7
                out[y, x] = int(d.argmin())
        for _ in range(2):                                  # near-identical strays join their neighbours
            fix = []
            for y in range(1, h - 1):
                for x in range(1, w - 1):
                    c = out[y, x]
                    if c < 0: continue
                    nb = [out[y + dy, x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
                    if -1 in nb or c in nb: continue
                    maj = max(set(nb), key=nb.count)
                    if nb.count(maj) >= 5 and ((pal_np[c] - pal_np[maj]) ** 2).sum() < 900: fix.append((x, y, maj))
            for x, y, c in fix: out[y, x] = c
        lab2, n2 = components(out >= 0)                     # specks under 3 px
        for k in range(1, n2 + 1):
            if (lab2 == k).sum() < 3: out[lab2 == k] = -1
        sprites[name] = (out, title)

    # hand pass: large almond eyes on the seated portrait
    add = {'G': (124, 170, 92), 'g': (84, 128, 66), 'y': (168, 162, 94), 'p': (16, 18, 8), 'w': (240, 234, 216)}
    ix = {}
    for k, c in add.items(): pal.append(c); ix[k] = len(pal) - 1
    ix['K'] = int(np.argmin([sum(c) for c in pal]))
    eye = ['.KKKK.', 'KwGGgK', 'KGppGK', 'KygpyK', '.KKKK.']
    o = sprites['sit'][0]
    for ox, oy in ((13, 24), (25, 24)):
        for j, row in enumerate(eye):
            for i, ch in enumerate(row):
                if ch != '.': o[oy + j, ox + i] = ix[ch]

    # export: shared palette + one module per pose; PNGs at 1x and 4x
    keys = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    hexpal = {keys[i]: '#%02x%02x%02x' % c for i, c in enumerate(pal)}
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for name, (out, title) in sprites.items():
        h, w = out.shape
        rows = [''.join('.' if v < 0 else keys[v] for v in r) for r in out]
        manifest.append({'id': name, 'title': title, 'w': w, 'h': h, 'rows': rows})
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
        for y in range(h):
            for x in range(w):
                if out[y, x] >= 0: px[x, y] = pal[out[y, x]] + (255,)
        im.save(os.path.join(OUT, f'nfc-{name}.png'))
        im.resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(OUT, f'nfc-{name}@4x.png'))
    data = {'name': 'Norwegian Forest Cat', 'palette': hexpal, 'sprites': manifest}
    with open(os.path.join(OUT, 'nfc-sprites.js'), 'w') as f:
        f.write('// Norwegian Forest Cat sprite set. Generated by tools/build_sprites.py from reference/nfc-sheet-gemini.jpg.\n')
        f.write("// palette: key -> colour; each sprite's rows use those keys, '.' = transparent.\n")
        f.write('export default ' + json.dumps(data) + ';\n')
    print(len(pal), 'colours;', ', '.join(f"{s['id']} {s['w']}x{s['h']}" for s in manifest))

if __name__ == '__main__':
    main()
