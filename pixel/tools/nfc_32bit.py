"""Norwegian Forest Cat, sitting, profile facing right. Brown mackerel tabby & white. 62x66."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from painter import Grid, preview
import json
PAL = {
 'K':'#2a1c13','k':'#6a4c36','D':'#4b3423','d':'#654830','M':'#7b5b3d','L':'#a17b4c','H':'#c9a26a',
 'W':'#f6f1e7','S':'#d6cab8','s':'#a99c88','E':'#a3c450','F':'#6c9a30','e':'#141c0e','N':'#d48e83','P':'#e3ab9b',
}
G = Grid(62, 66)
def tri(*p): G.poly(list(p), 'M')
# ---------------------------------------------------------------- silhouette
G.ell(25, 59, 20, 4.8, 'M')                          # tail plume lying along the ground
G.ell(47, 56.5, 4.2, 4.6, 'M')                       # tail tip curling up by the paws
G.ell(22, 48, 14, 12.5, 'M')                         # haunch
G.ell(14, 53, 7.5, 7, 'M')                           # britches
G.ell(29, 37, 10.5, 15, 'M', rot=-0.28)              # back / chest
G.ell(38, 37, 7.5, 12, 'M', rot=-0.12)               # ruff
G.poly([(35,29),(48,29),(47,36),(37,37)], 'M')       # neck: fills under the chin
G.ell(45.5, 39, 3.6, 8.5, 'M')                       # ruff body behind the tufts
G.poly([(35,46),(41,46),(42.5,57),(35.5,57)], 'M')   # foreleg
G.ell(40, 57.5, 4.2, 3, 'M')                         # big round paw
G.ell(37, 19.5, 12, 10.5, 'M')                       # skull (enlarged for the cute ratio)
G.poly([(27.4,13.8),(41.8,10.8),(53.8,22.2),(54.4,24.6),(49,30),(35.8,30.6)], 'M')  # straight profile, strong chin
G.poly([(25.4,18),(27.4,1),(39.5,11)], 'M')          # ear: tall, broad base, set high
for p in [((47,30),(50.5,33),(46.5,34)), ((46.5,34),(50,38),(46,39)), ((45.5,39),(49,43),(45,44)), ((44,44),(46,47),(42,47)),
          ((10,49),(4,53),(9,54)), ((9,54),(3,58),(8,59)), ((6,59),(1,60),(6,62)),
          ((25,26),(21,29),(26,29)), ((21,29),(18,33),(23,32)), ((17,34),(14,38),(19,37)),
          ((13,62),(16,64),(19,62)), ((26,62),(29,64),(32,62))]:
    tri(*p)
# ---------------------------------------------------------------- white (tabby & white)
G.ell(39.5, 37, 6, 10.5, 'W', only='M', rot=-0.12)
G.poly([(38,29),(48,29),(51,33),(50,38),(49,43),(46,47),(40,46)], 'W', only='M')     # bib + its tufts
G.ell(45.5, 39, 3.6, 8.5, 'W', only='M')
G.poly([(42,22.5),(55,23.5),(54.4,24.6),(49,30),(38,29.5)], 'W', only='M')          # muzzle & chin
G.poly([(36,49),(41,49),(42.5,57),(36,57)], 'W', only='M')
G.ell(40, 57.5, 4.2, 3, 'W', only='M')
# ---------------------------------------------------------------- form light (top-left) and shade
base = [r[:] for r in G.g]
B = lambda x, y: base[y][x] if 0 <= x < G.w and 0 <= y < G.h else '.'
for y in range(G.h):
    for x in range(G.w):
        c = base[y][x]
        if c == '.': continue
        lit = B(x, y-1) == '.' or B(x-1, y-1) == '.' or B(x, y-2) == '.'
        shade = B(x, y+1) == '.' or B(x+1, y+1) == '.'
        if c == 'M':
            if lit: G.g[y][x] = 'L'
            elif shade: G.g[y][x] = 'd'
        elif c == 'W' and shade: G.g[y][x] = 'S'
for (x, y) in [(32,9),(33,9),(34,9),(35,10),(24,28),(25,27),(14,38),(15,37),(9,47),(10,46),(28,13),(29,12)]:
    if G.g[y][x] == 'L': G.g[y][x] = 'H'
# ---------------------------------------------------------------- mackerel tabby markings
st = 'MLHd'
for x0 in (20, 27):                       # two bold broken flank stripes
    for w in (0, 1):
        G.line(x0+2+w, 30, x0-1+w, 36, 'D', only=st); G.line(x0-2+w, 38, x0-4+w, 42, 'D', only=st)
for a, b in [((11,48),(20,43)), ((11,53),(22,48))]:   # haunch bars
    G.line(*a, *b, 'D', only=st); G.line(a[0], a[1]+1, b[0], b[1]+1, 'D', only=st)
for x0 in (11, 19, 27, 35):               # tail rings
    G.line(x0, 56, x0+1, 62, 'D', only=st); G.line(x0+1, 56, x0+2, 62, 'D', only=st)
G.line(45,52,49,54,'D',only=st); G.line(44,55,49,58,'D',only=st)
G.line(31,13,32,16,'D',only=st); G.line(34,12,34,15,'D',only=st); G.line(37,12,37,14,'D',only=st)  # forehead "M"
G.line(41,25,33,26,'D',only=st)                                                       # cheek line
G.outline('K')
for (x, y) in [(47,52),(48,52),(46,53),(49,53)]:
    if G.g[y][x] not in '.K': G.g[y][x] = 'D'                                         # dark tail tip
for y in range(G.h):                       # selective outline: softer line on lit edges
    for x in range(G.w):
        if G.g[y][x] == 'K' and (G.get(x+1, y) in 'LH' or G.get(x, y+1) in 'LH') and (G.get(x-1, y) == '.' or G.get(x, y-1) == '.'):
            G.g[y][x] = 'k'
# ---------------------------------------------------------------- face
G.poly([(28.5,15),(28.8,5),(36,11)], 'P', only='MLHd')          # inner ear
for (x, y) in [(29,11),(30,12),(29,13),(31,13)]: G.set(x, y, 'S')   # ear furnishings
for (x, y) in [(27,0),(26,0),(27,1)]: G.set(x, y, 'K')             # lynx tip
G.paint(['  KKK ', ' KEEEK', 'KEEEeE', 'EEEeeE', 'EFEeeF', ' FFFF '], 41, 14)  # big round almond eye, outer corner higher
G.set(42,16,'W'); G.set(43,16,'W'); G.set(42,17,'W'); G.set(43,17,'W'); G.set(46,18,'W')   # catchlights
G.set(54,23,'N'); G.set(53,23,'N'); G.set(54,22,'K'); G.set(55,23,'K')   # nose leather
G.set(52,26,'s'); G.set(51,27,'s')                                # small smile
G.set(49,26,'S'); G.set(50,25,'S')                                # whisker pad
for x in range(42, 48):
    if G.g[30][x] == 'W': G.g[30][x] = 'S'                        # soft jaw shadow
for (x, y) in [(38,54),(40,54),(38,59),(40,59)]: G.set(x, y, 's') # toes
rows = G.rows()
json.dump({'w': G.w, 'h': G.h, 'rows': rows, 'pal': PAL}, open('nfc_sit.json', 'w'))
preview(rows, PAL, 'nfc_sit.png')
