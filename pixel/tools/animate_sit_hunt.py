"""Seated Norwegian Forest Cat watching a mouse: one continuous motion, sampled at 6, 9 and 12 frames.

The cat is never redrawn. Each frame warps the seated sprite with a displacement field and samples it
nearest-neighbour, so every pixel in a frame is a pixel from the original art, only moved by whole pixels:
  * head: leans toward the mouse and lowers as it comes closer; the shift fades out through the ruff
    (rows 34-58) and toward the back (x 50-62), so the body stays still and nothing tears;
  * ears: pricked, plus one quick flick of the far ear when the mouse darts away;
  * tail tip: lifts and drops (a twitch) as the mouse approaches, a classic hunting tell.
The head follows the mouse with a slight lag (attention trails motion), computed on the continuous path.

Usage: python3 pixel/tools/animate_sit_hunt.py   (writes pixel/anim/ and pixel/sprites/nfc-sit-hunt.js)
"""
import json, math, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP_S = 1.8                 # one loop, seconds (same for every frame count)
FRAME_COUNTS = (6, 9, 12)
OX, OY = 44, 1               # cat placement inside the canvas (room for the mouse on the left)
CW, CH = 44 + 96 + 2, 1 + 104 + 4
GROUND = 104                 # canvas row the paws stand on

MOUSE_PAL = {'K': '#141010', 'D': '#4e453f', 'M': '#7d726a', 'L': '#a69a8e', 'B': '#c8bcae', 'P': '#c39985', 'e': '#050505'}
RUN_A = ["......KK.......", ".....KPPK......", "....KMMMMKK....", "KK.KMMMMMMMKK..", ".KKMMMMLLMeMMK.", "...KMLLBBLMMMPK", "....KKDK.KDK.K."]
RUN_B = ["......KK.......", ".....KPPK......", "....KMMMMKK....", "...KMMMMMMMKK..", "KKKMMMMLLMeMMK.", "...KMLLBBLMMMPK", "....KDK..KDKK.."]
SNIFF = ["......KK.......", ".....KPPK......", "....KMMMMKKK...", "KK.KMMMMMMMMK..", ".KKMMMMLLMeMMPK", "...KMLLBBLMMMK.", "....KKDK.KDK..."]
SHADOW = ('#2c2d32', '#36383e')

def smooth(t): t = min(max(t, 0.0), 1.0); return t * t * (3 - 2 * t)
def ease(a, b, t): return a + (b - a) * smooth(t)

def mouse_state(t):
    """Mouse x (canvas), facing (+1 right / -1 left), gait ('run'|'sniff'|'still'), over one loop t in [0,1)."""
    near, far = 40.0, 6.0
    if t < 0.16:  return ease(far, near, t / 0.16), 1, 'run'          # darts toward the cat
    if t < 0.50:  return near, 1, 'sniff'                             # stops, sniffs
    if t < 0.64:  return ease(near, far, (t - 0.50) / 0.14), -1, 'run' # darts back
    return far, 1, 'still'                                            # turns, waits

def closeness(t):
    mx, _, _ = mouse_state(t % 1.0)
    return (mx - 6.0) / 34.0                                          # 0 far .. 1 near

def cat_pose(t):
    """Continuous pose parameters.
    Attention trails motion: the head follows a smoothed mouse position (a moving average over the last
    0.22 of the loop), so it glides into each new pose instead of snapping with the mouse's dart."""
    c = sum(closeness(t - 0.22 * k / 24) for k in range(25)) / 25
    head_dx = -0.6 - 2.6 * (1 - c)                                    # far mouse: look further left
    head_dy = 0.2 + 3.2 * c                                           # near mouse: lower the head, focus
    # tail tip: a lash while the mouse approaches, a smaller one as it leaves
    lash = 5.0 * math.sin(math.pi * min(max((t - 0.02) / 0.40, 0), 1)) + 2.6 * math.sin(math.pi * min(max((t - 0.58) / 0.26, 0), 1))
    # far ear flicks back as the mouse darts away
    ear = 1.6 * math.sin(math.pi * min(max((t - 0.50) / 0.20, 0), 1))
    breath = 0.5 - 0.5 * math.cos(2 * math.pi * t)                    # one slow breath per loop, 0..1
    return head_dx, head_dy, lash, ear, breath

def load_sit():
    js = open(os.path.join(ROOT, 'sprites', 'nfc-sprites.js')).read()
    d = json.loads(js[js.index('export default ') + 15:].rstrip().rstrip(';'))
    sit = next(s for s in d['sprites'] if s['id'] == 'sit')
    return sit, d['palette']

def warp(sit, pose):
    head_dx, head_dy, lash, ear, breath = pose
    W, H, rows = sit['w'], sit['h'], sit['rows']
    out = [['.'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            wy = 1 - smooth((y - 34) / 24)                 # head 1 -> ruff 0
            wx = 1 - smooth((x - 50) / 12)                 # front 1 -> back 0
            w = wy * wx
            dx, dy = head_dx * w, head_dy * w
            dy -= 1.2 * breath * smooth((100 - y) / 50)          # chest and head rise on the in-breath
            if 30 <= x <= 47 and y <= 13:                  # far (right) ear flicks back a pixel
                dx += ear * (1 - y / 13.0)
            if x >= 78 and y >= 76:                        # tail tip, bending from x 78 outward
                dy -= lash * ((x - 78) / 18.0) ** 1.5
            sx, sy = int(math.floor(x - dx + 0.5)), int(math.floor(y - dy + 0.5))
            if 0 <= sx < W and 0 <= sy < H:
                out[y][x] = rows[sy][sx]
    return out

def compose(sit, pal, t):
    """One frame on the canvas: shadows, cat, mouse. Returns rows of hex colours (None = transparent)."""
    img = [[None] * CW for _ in range(CH)]
    def shadow(cx, cy, rx, ry):
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if e <= 1 and 0 <= x < CW and 0 <= y < CH: img[y][x] = SHADOW[0] if e < 0.55 else SHADOW[1]
    shadow(OX + 50, GROUND + 1, 42, 2.2)
    mx, face, gait = mouse_state(t)
    shadow(mx + 7, GROUND + 1, 7, 1.2)
    cat = warp(sit, cat_pose(t))
    for y, r in enumerate(cat):
        for x, ch in enumerate(r):
            if ch != '.': img[OY + y][OX + x] = pal[ch]
    if gait == 'run':
        spr = RUN_A if int(t * 40) % 2 == 0 else RUN_B
    elif gait == 'sniff':
        spr = SNIFF if int(t * 22) % 2 == 0 else RUN_A
    else:
        spr = RUN_A
    x0, y0 = int(round(mx)), GROUND - len(spr) + 1
    for j, r in enumerate(spr):
        for i, ch in enumerate(r if face > 0 else r[::-1]):
            if ch != '.' and 0 <= x0 + i < CW: img[y0 + j][x0 + i] = MOUSE_PAL[ch]
    return img

def main():
    sit, pal = load_sit()
    os.makedirs(os.path.join(ROOT, 'anim'), exist_ok=True)
    out = {'loopSeconds': LOOP_S, 'w': CW, 'h': CH, 'counts': {}}
    colours = {}
    for n in FRAME_COUNTS:
        frames = [compose(sit, pal, i / n) for i in range(n)]
        enc = []
        for f in frames:
            rows = []
            for r in f:
                s = ''
                for c in r:
                    if c is None: s += '.'
                    else:
                        if c not in colours: colours[c] = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[len(colours)]
                        s += colours[c]
                rows.append(s)
            enc.append(rows)
        out['counts'][str(n)] = enc
        # GIF (on the sheet's dark grey) and a frame strip, both at 4x
        S = 4
        ims = []
        for f in frames:
            im = Image.new('RGB', (CW, CH), (70, 73, 80)); px = im.load()
            for y, r in enumerate(f):
                for x, c in enumerate(r):
                    if c: px[x, y] = tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))
            ims.append(im.resize((CW * S, CH * S), Image.NEAREST))
        dur = int(round(LOOP_S * 1000 / n))
        ims[0].save(os.path.join(ROOT, 'anim', f'sit-hunt-{n}f.gif'), save_all=True, append_images=ims[1:], duration=dur, loop=0, disposal=2)
        strip = Image.new('RGB', (CW * S * n + 8 * (n - 1), CH * S), (40, 42, 46))
        for i, im in enumerate(ims): strip.paste(im, (i * (CW * S + 8), 0))
        strip.save(os.path.join(ROOT, 'anim', f'sit-hunt-{n}f-strip.png'))
    out['palette'] = {v: k for k, v in colours.items()}
    with open(os.path.join(ROOT, 'sprites', 'nfc-sit-hunt.js'), 'w') as f:
        f.write('// Seated cat watching a mouse, sampled at 6, 9 and 12 frames per loop. Generated by tools/animate_sit_hunt.py\n')
        f.write('export default ' + json.dumps(out) + ';\n')
    print('canvas', CW, 'x', CH, '| colours', len(colours), '| frames', ', '.join(str(n) for n in FRAME_COUNTS))

if __name__ == '__main__':
    main()
