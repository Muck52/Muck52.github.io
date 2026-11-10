"""Norwegian Forest Cat, sitting, '64-bit' tier: lit from a height field, quantised to ramps. ~96x100."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from painter import Grid, preview
import json, math
from collections import deque

S, W0, H0 = 1.55, 62, 66
G = Grid(round(W0 * S), round(H0 * S))
def sc(p): return (p[0] * S, p[1] * S)
ell = lambda cx, cy, rx, ry, c, only=None, rot=0: G.ell(cx * S, cy * S, rx * S, ry * S, c, only, rot)
poly = lambda pts, c, only=None: G.poly([sc(p) for p in pts], c, only)
line = lambda x0, y0, x1, y1, c, only=None, w=1: [G.line(round(x0*S)+i, round(y0*S), round(x1*S)+i, round(y1*S), c, only) for i in range(w)]

# ---------------- silhouette (same design as the 32-bit tier, scaled) ----------------
ell(25, 59, 20, 4.8, 'M'); ell(47, 56.5, 4.2, 4.6, 'M')               # tail plume + curled tip
ell(22, 48, 14, 12.5, 'M'); ell(14, 53, 7.5, 7, 'M')                  # haunch, britches
ell(29, 37, 10.5, 15, 'M', rot=-0.28); ell(38, 37, 7.5, 12, 'M', rot=-0.12)
poly([(35,29),(48,29),(47,36),(37,37)], 'M'); ell(45.5, 39, 3.6, 8.5, 'M')
poly([(35,46),(41,46),(42.5,57),(35.5,57)], 'M'); ell(40, 57.5, 4.2, 3, 'M')
ell(37, 19.5, 12, 10.5, 'M')
poly([(27.4,13.8),(41.8,10.8),(53.8,22.2),(54.4,24.6),(49,30),(35.8,30.6)], 'M')
poly([(25.4,18),(27.4,1),(39.5,11)], 'M')
TUFTS = [((47,30),(50.5,33),(46.5,34)), ((46.5,34),(50,38),(46,39)), ((45.5,39),(49,43),(45,44)), ((44,44),(46,47),(42,47))]
for p in TUFTS + [((10,49),(4,53),(9,54)), ((9,54),(3,58),(8,59)), ((6,59),(1,60),(6,62)),
          ((25,26),(21,29),(26,29)), ((21,29),(18,33),(23,32)), ((17,34),(14,38),(19,37)),
          ((13,62),(16,64),(19,62)), ((26,62),(29,64),(32,62))]:
    poly(list(p), 'M')
# white areas
ell(39.5, 37, 6, 10.5, 'W', only='M', rot=-0.12)
poly([(38,29),(48,29),(51,33),(50,38),(49,43),(46,47),(40,46)], 'W', only='M'); ell(45.5, 39, 3.6, 8.5, 'W', only='M')
poly([(42,22.5),(55,23.5),(54.4,24.6),(49,30),(38,29.5)], 'W', only='M')
poly([(36,49),(41,49),(42.5,57),(36,57)], 'W', only='M'); ell(40, 57.5, 4.2, 3, 'W', only='M')
for p in TUFTS: poly(list(p), 'W', only='M')
# tabby markings as a separate material ('T'), painted over fur only
for x0 in (20, 27):
    line(x0+2, 30, x0-1, 36, 'T', only='M', w=3); line(x0-2, 38, x0-4, 42, 'T', only='M', w=3)
for a, b in [((11,48),(20,43)), ((11,53),(22,48))]:
    line(*a, *b, 'T', only='M', w=2); line(a[0], a[1]+0.7, b[0], b[1]+0.7, 'T', only='M', w=2)
for x0 in (11, 19, 27, 35): line(x0, 56, x0+1, 62, 'T', only='M', w=3)
line(45,52,49,54,'T',only='M',w=2); line(44,55,49,58,'T',only='M',w=2)
line(31,13,32,16,'T',only='M',w=2); line(34,12,34,15,'T',only='M',w=2); line(37,12,37,14,'T',only='M',w=2)
line(41,25,33,26,'T',only='M')
for (x, y) in [(47,52),(48,52),(46,53),(49,53)]: ell(x+.5, y+.5, .8, .8, 'T', only='M')

# ---------------- lighting: height field from distance to the silhouette edge ----------------
w, h = G.w, G.h
inside = [[G.g[y][x] != '.' for x in range(w)] for y in range(h)]
dist = [[0 if not inside[y][x] else 10**9 for x in range(w)] for y in range(h)]
q = deque((x, y) for y in range(h) for x in range(w) if not inside[y][x])
while q:                                   # BFS distance (8-neighbour) to the outside
    x, y = q.popleft()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and dist[ny][nx] > dist[y][x] + 1:
                dist[ny][nx] = dist[y][x] + 1; q.append((nx, ny))
R = 9.0
H = [[math.sqrt(max(0.0, 1 - (1 - min(dist[y][x], R) / R) ** 2)) * R if inside[y][x] else 0 for x in range(w)] for y in range(h)]
L = (-0.55, -0.65, 0.52); n_ = math.sqrt(sum(c * c for c in L)); L = tuple(c / n_ for c in L)
def light(x, y):
    gx = (H[y][min(x+1, w-1)] - H[y][max(x-1, 0)]) / 2
    gy = (H[min(y+1, h-1)][x] - H[max(y-1, 0)][x]) / 2
    nx, ny, nz = -gx, -gy, 1.0
    m = math.sqrt(nx*nx + ny*ny + nz*nz)
    return max(0.0, (nx*L[0] + ny*L[1] + nz*L[2]) / m)
RAMPS = {   # dark -> light
 'M': ['#3d2a1c', '#57402b', '#735538', '#8f6c46', '#ad8858', '#cba56e'],
 'T': ['#24180f', '#33241a', '#463223', '#5a4330'],
 'W': ['#a99d8a', '#c5baa6', '#ddd4c3', '#efe8dc', '#fbf8f1'],
}
KEYS = {'M': '012345', 'T': '6789', 'W': 'qrsuv'}  # ramp keys never collide with detail keys
out = [['.'] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        m = G.g[y][x]
        if m == '.': continue
        v = light(x, y) * 0.85 + 0.15
        v += ((x * 7 + y * 13) % 5 - 2) * 0.012          # faint fur grain, ordered so it stays stable
        if m == 'M' and (x + 2 * y) % 9 == 0: v -= 0.05   # sparse darker guard-hair flecks
        ks = KEYS[m]; i = max(0, min(len(ks) - 1, int(v * len(ks))))
        out[y][x] = ks[i]
PAL = {}
for m, ks in KEYS.items():
    for k, col in zip(ks, RAMPS[m]): PAL[k] = col
PAL.update({'K': '#22160e', 'k': '#5e4431', 'E': '#a9cc55', 'F': '#6b9a2f', 'G': '#cfe58a', 'e': '#121a0c',
            'N': '#d98d82', 'n': '#b56d64', 'P': '#e9b0a1', 'p': '#c98c7e', 'X': '#ffffff'})
# ---------------- outline: dark on shadow side, warm-soft on the lit side ----------------
edge = []
for y in range(h):
    for x in range(w):
        if out[y][x] != '.' and any(not (0 <= x+dx < w and 0 <= y+dy < h) or out[y+dy][x+dx] == '.' for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))):
            lit = (y == 0 or out[y-1][x] == '.') or (x == 0 or out[y][x-1] == '.')
            edge.append((x, y, 'k' if lit else 'K'))
for x, y, c in edge: out[y][x] = c
def put(x, y, c):
    if 0 <= x < w and 0 <= y < h: out[y][x] = c
# ---------------- hand-detailed face (in 64-bit pixel coordinates) ----------------
# inner ear with gradient and pale furnishings
for y in range(5, 22):
    for x in range(41, 58):
        X, Y = x / S, y / S
        a, b, c = (28.5, 15), (28.8, 5), (36, 11)
        def side(p, q, r): return (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
        s1, s2, s3 = side(a, b, (X, Y)), side(b, c, (X, Y)), side(c, a, (X, Y))
        if (s1 >= 0) == (s2 >= 0) == (s3 >= 0) and out[y][x] not in '.Kk':
            out[y][x] = 'P' if Y < 11 else 'p'
for (x, y) in [(45,16),(46,17),(45,18),(47,19),(46,20),(48,20)]: put(x, y, 'u')
for (x, y) in [(42,0),(41,0),(42,1),(41,1),(42,2)]: put(x, y, 'K')       # lynx tip
EYE = ['...KKKK..',
       '..KEEEEK.',
       '.KEEEEeEK',
       'KEEEEeeeE',
       'EEEEFeeeF',
       'EFEEFeeeF',
       '.FFFFFFF.']
for j, row in enumerate(EYE):
    for i, ch in enumerate(row):
        if ch != '.': put(63 + i, 22 + j, ch)
for (x, y) in [(65,24),(66,24),(65,25),(66,25)]: put(x, y, 'X')           # big catchlight
put(70, 27, 'G'); put(64, 27, 'G')                                       # iris glints
for (x, y, c) in [(82,34,'N'),(83,34,'N'),(84,34,'N'),(82,35,'n'),(83,35,'N'),(84,35,'N'),(85,35,'K'),(83,36,'n'),(84,36,'n')]: put(x, y, c)   # nose leather
for (x, y) in [(81,39),(80,40),(79,40)]: put(x, y, 'q')                   # little smile
for (x, y) in [(76,38),(77,37),(78,38)]: put(x, y, 'r')                   # whisker pad
for (x, y) in [(59,84),(62,84),(59,91),(62,91)]: put(x, y, 'q')          # toes
rows = [''.join(r) for r in out]
used = set(''.join(rows)); PAL = {k: v for k, v in PAL.items() if k in used}
json.dump({'w': w, 'h': h, 'rows': rows, 'pal': PAL}, open('nfc_64bit.json', 'w'))
preview(rows, PAL, 'nfc_64bit.png', scale=5)
print(w, h, len(PAL), 'colours')
