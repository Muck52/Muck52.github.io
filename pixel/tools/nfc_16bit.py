import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from painter import Grid, preview
import json
# 16-bit: ~10 colours, one shadow + one highlight per material, dark outline.
P = {'K':'#2a1c13','D':'#5a3f28','M':'#9c7348','L':'#c49a64','W':'#f4ede0','S':'#cfc3ae',
     'E':'#9cc04c','e':'#1b2410','N':'#d88e84','P':'#e6ab9c'}
G = Grid(38, 38)
G.ell(18, 34.5, 16, 2.8, 'M')                       # tail wrapped along the ground
G.ell(14, 28, 10, 8, 'M')                           # haunch
G.ell(19, 26, 9, 9, 'M')                            # body
G.poly([(23,25),(29,25),(29.5,34),(23,34)], 'M')   # foreleg
G.ell(27.5, 24.5, 5.5, 7.5, 'M')                   # ruff mass
G.ell(20, 13.5, 10, 8, 'M')                         # big round-backed head
G.poly([(20,6.5),(27,7),(37.5,16),(37,17.5),(34,19.5),(22,20)], 'M')  # triangle face, straight profile
G.poly([(12.5,8),(14.5,0.5),(21,6.5)], 'M')         # tall ear
for p in [((31,20),(34,23),(30.5,24)), ((30,24),(33,27),(29.5,28)), ((32.5,21.5),(35.5,24),(32.5,25.5)), ((32.5,26),(35,28.5),(32,30))]: G.poly(list(p),'M')   # ruff tufts
# white: muzzle/chin, ruff, foreleg, paw
G.poly([(27,13.5),(38,16.5),(34,19.5),(25,20)], 'W', only='M')
G.ell(28.5, 24.5, 4.8, 7, 'W', only='M')
for p in [((31,20),(34,23),(30.5,24)), ((30,24),(33,27),(29.5,28)), ((32.5,21.5),(35.5,24),(32.5,25.5)), ((32.5,26),(35,28.5),(32,30))]: G.poly(list(p),'W',only='M')
G.poly([(24,28),(29,28),(29.5,34),(24,34)], 'W', only='M')
# one highlight band (top-left) and one shadow band (bottom-right)
base=[r[:] for r in G.g]
B=lambda x,y: base[y][x] if 0<=x<G.w and 0<=y<G.h else '.'
for y in range(G.h):
    for x in range(G.w):
        c=base[y][x]
        if c=='M':
            if B(x,y-1)=='.' or B(x-1,y-1)=='.': G.g[y][x]='L'
            elif B(x,y+1)=='.' or B(x+1,y+1)=='.': G.g[y][x]='D'
        elif c=='W' and (B(x,y+1)=='.' or B(x+1,y+1)=='.'): G.g[y][x]='S'
# tabby: three bold stripes on the back, two on the haunch, tail rings, forehead marks
st='ML'
for x0 in (13,17):
    G.line(x0,21,x0-1,25,'D',only=st); G.line(x0+1,21,x0,25,'D',only=st)
G.line(6,27,12,24,'D',only=st); G.line(6,30,13,27,'D',only=st)
for x0 in (8,14,20):
    G.line(x0,33,x0,36,'D',only=st)
G.line(20,9,20,11,'D',only=st); G.line(23,8,23,10,'D',only=st)
G.outline('K')
G.line(9,30,14,33,'K')                                   # thigh line
# face
G.poly([(14.5,7.5),(15,3),(19,6.5)], 'P', only='MLD')
G.set(14,0,'K'); G.set(15,0,'K')                         # lynx tip
G.paint(['.KKK','KEEe','EEee','.EEe'], 25, 10)          # big round almond eye, outer corner higher
G.set(26,11,'W'); G.set(26,12,'W'); G.set(25,12,'W')                                         # catchlight
G.set(37,16,'N'); G.set(36,16,'N')                       # nose
G.set(34,18,'S'); G.line(26,20,30,20,'S',only='W')        # mouth, chin shadow
rows=G.rows()
json.dump({'w':G.w,'h':G.h,'pal':P,'rows':rows}, open('t16.json','w'))
preview(rows,P,'t16.png',scale=10)
