# Tiny pixel painter: shapes on a char grid, auto-outline, preview PNG.
from PIL import Image
import math

class Grid:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.g = [['.'] * w for _ in range(h)]
    def set(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = c
    def get(s, x, y):
        return s.g[y][x] if 0 <= x < s.w and 0 <= y < s.h else '.'
    def ell(s, cx, cy, rx, ry, c, only=None, rot=0):
        ca, sa = math.cos(rot), math.sin(rot)
        for y in range(s.h):
            for x in range(s.w):
                dx, dy = x + .5 - cx, y + .5 - cy
                u, v = dx * ca + dy * sa, -dx * sa + dy * ca
                if (u / rx) ** 2 + (v / ry) ** 2 <= 1 and (only is None or s.g[y][x] in only):
                    s.g[y][x] = c
    def poly(s, pts, c, only=None):
        for y in range(s.h):
            for x in range(s.w):
                px, py = x + .5, y + .5
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside and (only is None or s.g[y][x] in only):
                    s.g[y][x] = c
    def line(s, x0, y0, x1, y1, c, only=None):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n); y = round(y0 + (y1 - y0) * i / n)
            if only is None or s.get(x, y) in only: s.set(x, y, c)
    def outline(s, c='K'):
        out = []
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x] != '.' and any(s.get(x + dx, y + dy) == '.' for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))):
                    out.append((x, y))
        for x, y in out: s.g[y][x] = c
    def paint(s, rows, ox, oy):
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch != ' ': s.set(ox + i, oy + j, ch)
    def rows(s): return [''.join(r) for r in s.g]

def preview(rows, pal, path, scale=8, bg=(40, 46, 42)):
    h, w = len(rows), len(rows[0])
    im = Image.new('RGB', (w * scale, h * scale), bg)
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == '.': continue
            col = tuple(int(pal[ch][i:i+2], 16) for i in (1, 3, 5))
            for yy in range(scale):
                for xx in range(scale): px[x*scale+xx, y*scale+yy] = col
    im.save(path)
