"""Seated Norwegian Forest Cat: full hunt at 12 fps.

watch -> crouch -> wiggle -> pounce -> pin & bite -> sit up with the mouse in its mouth.
The cat is the original seated sprite, posed by a five-bone skinning rig (tools/rig.py).
Usage: python3 pixel/tools/animate_hunt.py [--keys]   (--keys renders only key poses for review)
"""
import json, math, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig import pose, rot_about, compose, apply, similarity, ident, smooth

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 12
OX, OY = 64, 6                  # sprite (0,0) on the canvas
CW, CH = 64 + 100, 6 + 104 + 5
GROUND = OY + 103               # canvas row under the paws

# rig landmarks in sprite coordinates
HIP = (64, 82)                  # chest rotates about the hip/haunch
NECK = (30, 40)                 # head rotates about the neck
SHOULDER = (27, 62)
PAW = (25, 101)                 # front paws on the ground
MOUTH = (20, 35)

def weights(x, y):
    head = (1 - smooth((y - 33) / 12)) * (1 - smooth((x - 50) / 10))
    legs = smooth((y - 64) / 8) * (1 - smooth((x - 38) / 6)) * smooth((x - 8) / 4)
    tail = smooth((x - 76) / 8) * smooth((y - 80) / 6)
    body = smooth((x - 44) / 22) * (1 - tail)
    chest = max(0.0, 1 - head - legs - body - tail)
    w = {'head': head, 'legs': legs, 'tail': tail, 'body': body, 'chest': chest}
    return {k: v for k, v in w.items() if v > 1e-3}

ORDER = ['tail', 'body', 'chest', 'legs', 'head']

# ---------------------------------------------------------------- keyframes
# chest: (angle, dx, dy) about HIP; head: (angle, dx, dy) about NECK, relative to chest;
# paw: target for the front paws (sprite coords, absolute); rump: haunch lift (dy); lash: tail-tip lift.
KEYS = [  # (time s, chest, head, paw, rump, lash)
    (0.00, (0, 0, 0), (0, 0, 0), PAW, 0, 0),
    (0.70, (0, 0, 0), (-8, -1, 2), PAW, 0, 3),        # locks on to the mouse
    (1.40, (0, 0, 0), (-12, -2, 3), PAW, 0, 0),
    (2.30, (-14, 0, 8), (10, 0, 0), PAW, 0, 2),       # sinks into a crouch, head kept level on the target
    (2.60, (-16, 0, 10), (12, 0, 1), PAW, -2, 4),     # wiggle
    (2.80, (-16, 0, 10), (12, 0, 1), PAW, 1, 1),
    (3.00, (-16, 0, 10), (12, 0, 1), PAW, -2, 5),
    (3.20, (-17, 0, 11), (12, 0, 1), PAW, 0, 2),
    (3.45, (-20, -30, 4), (6, 0, 0), (-42, 100), -4, 6),   # pounce: lunge forward, forelegs shoot out ahead of the face
    (3.70, (-22, -30, 8), (-10, 0, 4), (-40, 101), -1, 3), # pinned under both paws; head dips to bite
    (4.20, (-22, -30, 8), (-22, 0, 8), (-38, 101), 0, 1),
    (5.00, (-6, -6, 4), (6, 0, -2), (8, 101), 0, 2),        # sits back up, mouse in mouth
    (5.70, (0, 0, 0), (10, 0, -3), PAW, 0, 0),              # head lifted, proud
    (6.30, (0, 0, 0), (10, 0, -3), PAW, 0, 0),
]
DURATION = KEYS[-1][0]

def lerp(a, b, t): return a + (b - a) * t
def sample(t):
    for i in range(len(KEYS) - 1):
        t0, *k0 = KEYS[i]; t1, *k1 = KEYS[i + 1]
        if t0 <= t <= t1:
            u = smooth((t - t0) / (t1 - t0)) if t1 > t0 else 1.0
            out = []
            for a, b in zip(k0, k1):
                if isinstance(a, tuple): out.append(tuple(lerp(x, y, u) for x, y in zip(a, b)))
                else: out.append(lerp(a, b, u))
            return out
    return list(KEYS[-1][1:])

def bones_at(t):
    chest_k, head_k, paw, rump, lash = sample(t)
    chest = rot_about(*HIP, chest_k[0], chest_k[1], chest_k[2])
    head = compose(chest, rot_about(*NECK, head_k[0], head_k[1], head_k[2]))
    legs = similarity(SHOULDER, PAW, apply(chest, *SHOULDER), paw)
    body = rot_about(*HIP, 0, 0, rump)
    tail = (1, 0, 0, 1, 0, -lash)
    return {'chest': chest, 'head': head, 'legs': legs, 'body': body, 'tail': tail}, head

# ---------------------------------------------------------------- the mouse
MOUSE_PAL = {'K': '#141010', 'D': '#4e453f', 'M': '#7d726a', 'L': '#a69a8e', 'B': '#c8bcae', 'P': '#c39985', 'e': '#050505', 'R': '#e3aea0', 'T': '#9a6a64'}
RUN_A = ["......KK.......", ".....KPPK......", "....KMMMMKK....", "KK.KMMMMMMMKK..", ".KKMMMMLLMeMMK.", "...KMLLBBLMMMPK", "....KKDK.KDK.K."]
RUN_B = ["......KK.......", ".....KPPK......", "....KMMMMKK....", "...KMMMMMMMKK..", "KKKMMMMLLMeMMK.", "...KMLLBBLMMMPK", "....KDK..KDKK.."]
SNIFF = ["......KK.......", ".....KPPK......", "....KMMMMKKK...", "KK.KMMMMMMMMK..", ".KKMMMMLLMeMMPK", "...KMLLBBLMMMK.", "....KKDK.KDK..."]
# carried crosswise in the mouth, limp: head drooping on the left, tail hanging on the right
CARRY = [
    "......KKKKKK.........",
    "....KKMMMMMMKK.......",
    "..KKMMMLLLMMMMK......",
    ".KRRKMLLBBBLLMMK.....",
    "KRRKMMLBBBBBLMMMK....",
    "KKKMMMMLBBBLLMMMKK...",
    "KeMMMKKMMMMMMMKKTTK..",
    ".KKKK..KKKKKKK..KTTK.",
    "..................KTK",
    "..................KTK",
    "...................KT",
    "...................KK",
]
CARRY_MID = (10, 1)   # the point held in the jaws   # the point held in the jaws

def mouse_at(t):
    """(sprite rows, x, y top-left on canvas, facing) or HANG placement handled by the caller."""
    tx = OX - 40 + 1                     # where it is caught: right under the landing paws (canvas x of its centre)
    if t < 1.0:                           # scurries in from the left
        u = smooth(t / 1.0); x = lerp(4, tx - 6, u)
        spr = RUN_A if int(t * FPS) % 2 == 0 else RUN_B
        return spr, x, 1
    if t < 3.40:                          # sniffs about, unaware
        spr = SNIFF if int(t * FPS / 3) % 2 == 0 else RUN_A
        return spr, tx - 6 + (2 if int(t * 2) % 2 else 0), 1
    if t < 4.30:                          # frozen, then pinned under the paws
        return RUN_A, tx - 6, 1
    return None, 0, 0                     # in the mouth

def render(t):
    img = [[None] * CW for _ in range(CH)]
    def shadow(cx, cy, rx, ry):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if e <= 1 and 0 <= x < CW and 0 <= y < CH: img[y][x] = '#2c2d32' if e < 0.55 else '#36383e'
    bones, headm = bones_at(t)
    chest_dx = sample(t)[0][1]
    shadow(OX + 50 + chest_dx * 0.4, GROUND + 1, 44 - chest_dx * 0.3, 2.2)
    spr, mx, face = mouse_at(t)
    if spr: shadow(mx + 7, GROUND + 1, 7, 1.2)
    # mouse is drawn before the cat while free (paws land on top of it)
    if spr:
        y0 = GROUND - len(spr) + 1
        for j, r in enumerate(spr):
            for i, ch in enumerate(r if face > 0 else r[::-1]):
                if ch != '.' and 0 <= int(mx) + i < CW: img[y0 + j][int(mx) + i] = MOUSE_PAL[ch]
    reaching = sample(t)[2][0] < 0          # during the pounce the forelegs are in front of the face
    order = ['tail', 'body', 'chest', 'head', 'legs'] if reaching else ORDER
    cat = pose(CAT_ROWS, weights, bones, order, CW, CH, OX, OY)
    for y, r in enumerate(cat):
        for x, ch in enumerate(r):
            if ch != '.': img[y][x] = CAT_PAL[ch]
    if not spr:                           # in the mouth: hang it from the mouth point
        mx_, my_ = apply(headm, *MOUTH)
        x0, y0 = int(round(mx_ + OX)) - CARRY_MID[0], int(round(my_ + OY)) - CARRY_MID[1] + 2
        for j, r in enumerate(CARRY):
            for i, ch in enumerate(r):
                if ch != '.' and 0 <= x0 + i < CW and 0 <= y0 + j < CH: img[y0 + j][x0 + i] = MOUSE_PAL[ch]
    return img

def load_sit():
    js = open(os.path.join(ROOT, 'sprites', 'nfc-sprites.js')).read()
    d = json.loads(js[js.index('export default ') + 15:].rstrip().rstrip(';'))
    sit = next(s for s in d['sprites'] if s['id'] == 'sit')
    return sit['rows'], d['palette']

CAT_ROWS, CAT_PAL = load_sit()

def to_image(img, scale):
    im = Image.new('RGB', (CW, CH), (70, 73, 80)); px = im.load()
    for y, r in enumerate(img):
        for x, c in enumerate(r):
            if c: px[x, y] = tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))
    return im.resize((CW * scale, CH * scale), Image.NEAREST)

def main():
    keys_only = '--keys' in sys.argv
    times = [k[0] for k in KEYS] if keys_only else [i / FPS for i in range(int(DURATION * FPS) + 1)]
    frames = [render(t) for t in times]
    if keys_only:
        out = '/tmp/hunt-keys.png' if len(sys.argv) < 3 else sys.argv[2]
        ims = [to_image(f, 2) for f in frames]
        cols = 5; w, h = ims[0].size
        sheet = Image.new('RGB', (cols * (w + 6), ((len(ims) + cols - 1) // cols) * (h + 6)), (25, 25, 25))
        for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * (w + 6), (i // cols) * (h + 6)))
        sheet.save(out); print('keys ->', out); return
    os.makedirs(os.path.join(ROOT, 'anim'), exist_ok=True)
    colours, enc = {}, []
    keyset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    for f in frames:
        rows = []
        for r in f:
            s = ''
            for c in r:
                if c is None: s += '.'
                else:
                    if c not in colours: colours[c] = keyset[len(colours)]
                    s += colours[c]
            rows.append(s)
        enc.append(rows)
    with open(os.path.join(ROOT, 'sprites', 'nfc-hunt.js'), 'w') as fh:
        fh.write('// Seated cat: full hunt at 12 fps. Generated by tools/animate_hunt.py\n')
        fh.write('export default ' + json.dumps({'fps': FPS, 'w': CW, 'h': CH, 'palette': {v: k for k, v in colours.items()}, 'frames': enc}) + ';\n')
    ims = [to_image(f, 3) for f in frames]
    dur = [int(1000 / FPS)] * len(ims); dur[-1] = 1200          # hold the final pose
    ims[0].save(os.path.join(ROOT, 'anim', 'hunt-12fps.gif'), save_all=True, append_images=ims[1:], duration=dur, loop=0, disposal=2)
    print(len(frames), 'frames at', FPS, 'fps =', round(len(frames) / FPS, 2), 's | colours', len(colours))

if __name__ == '__main__':
    main()
