"""A small 2D skinning rig for pixel art.

pose(sprite) -> new sprite, built like RotSprite:
  1. upscale the sprite 4x with Scale2x (twice), which keeps edges crisp,
  2. move every sub-pixel by linear-blend skinning over a few bones (smooth weights, so fur bends, not tears),
  3. downsample to the art grid: each output pixel takes the colour most sub-pixels voted for,
     with front layers (head > legs > chest > body/tail) winning where they overlap.
Bones are 2D transforms: (a, b, c, d, e, f) mapping (x, y) -> (a x + b y + e, c x + d y + f).
"""
import math

def scale2x(rows):
    h, w = len(rows), len(rows[0])
    out = [[None] * (w * 2) for _ in range(h * 2)]
    g = lambda x, y: rows[min(max(y, 0), h - 1)][min(max(x, 0), w - 1)]
    for y in range(h):
        for x in range(w):
            E = rows[y][x]; B = g(x, y - 1); D = g(x - 1, y); F = g(x + 1, y); H = g(x, y + 1)
            if B != H and D != F:
                e0 = D if D == B else E; e1 = F if B == F else E
                e2 = D if D == H else E; e3 = F if H == F else E
            else:
                e0 = e1 = e2 = e3 = E
            out[2 * y][2 * x] = e0; out[2 * y][2 * x + 1] = e1
            out[2 * y + 1][2 * x] = e2; out[2 * y + 1][2 * x + 1] = e3
    return [''.join(r) for r in out]

def ident(): return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
def compose(m, n):
    """m after n."""
    a, b, c, d, e, f = m; A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, a * E + b * F + e, c * E + d * F + f)
def rot_about(px, py, deg, tx=0.0, ty=0.0):
    r = math.radians(deg); co, si = math.cos(r), math.sin(r)
    # rotate about (px, py), then translate
    return (co, -si, si, co, px - co * px + si * py + tx, py - si * px - co * py + ty)
def apply(m, x, y):
    a, b, c, d, e, f = m
    return a * x + b * y + e, c * x + d * y + f
def similarity(p0, p1, q0, q1):
    """The rotation+uniform-scale+translation mapping p0->q0 and p1->q1."""
    vx, vy = p1[0] - p0[0], p1[1] - p0[1]
    ux, uy = q1[0] - q0[0], q1[1] - q0[1]
    den = vx * vx + vy * vy
    a = (ux * vx + uy * vy) / den; b = (uy * vx - ux * vy) / den
    m = (a, -b, b, a, 0.0, 0.0)
    x, y = apply(m, *p0)
    return (a, -b, b, a, q0[0] - x, q0[1] - y)

def smooth(t): t = min(max(t, 0.0), 1.0); return t * t * (3 - 2 * t)

def pose(rows, weights_fn, bones, order, out_w, out_h, ox=0, oy=0, up=2):
    """rows: sprite rows ('.' transparent). weights_fn(x, y) -> {bone: weight}. bones: {bone: matrix}.
    order: bone names back -> front (front wins overlaps). ox, oy: where sprite (0,0) lands in the output."""
    big = rows
    for _ in range(up): big = scale2x(big)
    k = 2 ** up
    votes = {}
    rank = {b: i for i, b in enumerate(order)}
    for Y, r in enumerate(big):
        for X, ch in enumerate(r):
            if ch == '.': continue
            x, y = (X + 0.5) / k, (Y + 0.5) / k
            w = weights_fn(x, y)
            tot = sum(w.values()) or 1.0
            nx = ny = 0.0
            for b, wt in w.items():
                px, py = apply(bones[b], x, y)
                nx += px * wt / tot; ny += py * wt / tot
            layer = rank[max(w, key=w.get)]
            ix, iy = int(math.floor(nx + ox)), int(math.floor(ny + oy))
            if 0 <= ix < out_w and 0 <= iy < out_h:
                cell = votes.setdefault((ix, iy), {})
                key = (layer, ch)
                cell[key] = cell.get(key, 0) + 1
    out = [['.'] * out_w for _ in range(out_h)]
    for (ix, iy), cell in votes.items():
        top = max(l for l, _ in cell)
        # front layer wins only if it covers a fair share of the pixel; else the majority layer
        total = sum(cell.values())
        front = {c: n for (l, c), n in cell.items() if l == top}
        if sum(front.values()) >= 0.3 * total:
            out[iy][ix] = max(front, key=front.get)
        else:
            merged = {}
            for (l, c), n in cell.items(): merged[c] = merged.get(c, 0) + n
            out[iy][ix] = max(merged, key=merged.get)
    # fill pinholes: an empty pixel with 3+ filled 4-neighbours takes their majority colour
    for _ in range(2):
        fix = []
        for y in range(1, out_h - 1):
            for x in range(1, out_w - 1):
                if out[y][x] != '.': continue
                nb = [out[y - 1][x], out[y + 1][x], out[y][x - 1], out[y][x + 1]]
                full = [c for c in nb if c != '.']
                if len(full) >= 3: fix.append((x, y, max(set(full), key=full.count)))
        for x, y, c in fix: out[y][x] = c
    return [''.join(r) for r in out]
