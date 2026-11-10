import { deg, lerp, clamp, local, polar, sub, add, scale, angleOf, dist } from './math.js';
import { ANATOMY as A, TORSO_PROFILE } from './anatomy.js';

export const COATS = {
  tabby: { name: 'Grey tabby', fill: '#a39d94', far: '#77716a', stripe: '#4f4a44', light: '#cfc9be', outline: '#1a1918', nose: '#c98783', innerEar: '#c99a92', iris: '#b7c35a' },
  ginger: { name: 'Ginger', fill: '#dc9149', far: '#a86a31', stripe: '#b1652a', light: '#f3cf9d', outline: '#2a1a0e', nose: '#d98a80', innerEar: '#e3a69c', iris: '#d6ad3a' },
  black: { name: 'Black', fill: '#2a2827', far: '#1b1a19', stripe: null, light: '#353331', outline: '#080808', nose: '#3c3535', innerEar: '#4d3c3c', iris: '#d8b43a' },
};

// ----------------------------------------------------------------- shape primitives
// Every shape is {kind, ...}; traced into the current path so groups can be unioned.
function traceCapsule(ctx, a, ra, b, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d <= Math.abs(ra - rb) + 1e-3) {
    const big = ra > rb ? a : b;
    ctx.moveTo(big.x + Math.max(ra, rb), big.y);
    ctx.arc(big.x, big.y, Math.max(ra, rb), 0, Math.PI * 2);
    return;
  }
  const ang = Math.atan2(dy, dx);
  const s = Math.asin((ra - rb) / d);
  const t1 = ang + Math.PI / 2 + s;
  const t2 = ang - Math.PI / 2 - s;
  ctx.moveTo(a.x + ra * Math.cos(t1), a.y + ra * Math.sin(t1));
  ctx.arc(a.x, a.y, ra, t1, t2 + Math.PI * 2, false);
  ctx.arc(b.x, b.y, rb, t2, t1, false);
  ctx.closePath();
}

function traceSmooth(ctx, pts) {
  const n = pts.length;
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
  }
  ctx.closePath();
}

/** Make polygons counter-clockwise (y-up) so every shape winds the same way as capsules and
 *  ellipses; otherwise nonzero filling cancels where shapes overlap and leaves holes. */
function ccw(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a < 0 ? pts.slice().reverse() : pts;
}

function trace(ctx, sh) {
  if ((sh.kind === 'smooth' || sh.kind === 'poly') && !sh.ccw) {
    sh.pts = ccw(sh.pts);
    sh.ccw = true;
  }
  switch (sh.kind) {
    case 'cap': return traceCapsule(ctx, sh.a, sh.ra, sh.b, sh.rb);
    case 'smooth': return traceSmooth(ctx, sh.pts);
    case 'poly':
      ctx.moveTo(sh.pts[0].x, sh.pts[0].y);
      for (const p of sh.pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      return;
    case 'ell':
      ctx.moveTo(sh.c.x + sh.rx * Math.cos(sh.rot), sh.c.y + sh.rx * Math.sin(sh.rot));
      ctx.ellipse(sh.c.x, sh.c.y, sh.rx, sh.ry, sh.rot, 0, Math.PI * 2);
      return;
  }
}

/** Draw a set of shapes as one silhouette: outline pass then fill pass. */
function drawGroup(ctx, shapes, fill, outline, ow) {
  ctx.lineJoin = 'round';
  ctx.fillStyle = outline;
  ctx.strokeStyle = outline;
  ctx.lineWidth = ow * 2;
  for (const s of shapes) {
    ctx.beginPath();
    trace(ctx, s);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const s of shapes) trace(ctx, s);
  ctx.fill('nonzero');
}

function clipTo(ctx, shapes) {
  ctx.beginPath();
  for (const s of shapes) trace(ctx, s);
  ctx.clip('nonzero');
}

// ----------------------------------------------------------------- body shapes
const cap = (a, ra, b, rb) => ({ kind: 'cap', a, ra, b, rb });

function hindShapes(L, k = 1) {
  const [hip, knee, hock, mtp, toe] = L.points;
  return [
    cap(hip, 4.6 * k, knee, 2.5 * k),
    cap(knee, 2.2 * k, hock, 1.15 * k),
    cap(hock, 1.0 * k, L.heel, 0.75 * k),
    cap(hock, 1.1 * k, mtp, 0.95 * k),
    cap(mtp, 1.05 * k, toe, 0.85 * k),
  ];
}
function foreShapes(L, k = 1) {
  const [piv, sh, el, wr, mcp, toe] = L.points;
  return [
    cap(piv, 2.6 * k, sh, 3.3 * k),
    cap(sh, 3.1 * k, el, 1.95 * k),
    cap(el, 1.8 * k, wr, 1.1 * k),
    cap(wr, 1.05 * k, mcp, 1.0 * k),
    cap(mcp, 1.1 * k, toe, 0.85 * k),
  ];
}

function torsoPts(R) {
  const top = [], bot = [];
  for (const [u, up, dn] of TORSO_PROFILE) {
    const { p, a } = R.spineAt(u);
    top.push(local(p, a, 0, up));
    bot.push(local(p, a, 0, -dn));
  }
  return top.concat(bot.reverse());
}

function earPts(H, back, near) {
  const { atlas, ang } = H;
  const tilt = ang - back * deg(55);
  const o = near ? 0 : -1.0;
  const b1 = local(atlas, ang, 1.2 + o, 3.2);
  const b2 = local(atlas, ang, 4.0 + o, 3.5);
  const mid = local(atlas, ang, 2.6 + o, 3.4);
  const tip = local(mid, tilt, -0.4 - back * 2.0, 3.6 - back * 1.4);
  return [b1, tip, b2];
}

function headShapes(H) {
  const a = H.ang;
  return [
    { kind: 'ell', c: H.cranium, rx: 4.1, ry: 3.5, rot: a },
    { kind: 'ell', c: H.cheek, rx: 3.6, ry: 2.6, rot: a - 0.1 },
    { kind: 'ell', c: H.muzzle, rx: 2.5, ry: 1.9, rot: a - 0.15 },
    { kind: 'ell', c: H.chin, rx: 1.5, ry: 1.0, rot: a },
  ];
}

function tailShapes(pts) {
  const out = [];
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r0 = lerp(A.tail.rBase, A.tail.rTip, i / n), r1 = lerp(A.tail.rBase, A.tail.rTip, (i + 1) / n);
    out.push(cap(pts[i], r0, pts[i + 1], r1));
  }
  return out;
}

function neckShapes(R) {
  const H = R.head;
  const base = local(R.W, R.aW, 0.2, -4.2);
  return [cap(base, 4.8, local(H.atlas, H.ang, 0.6, -0.6), 3.1)];
}

// ----------------------------------------------------------------- main entry
/**
 * Draw the cat. ctx must already map world cm (y up) to the canvas.
 * opts: { coat, skin, skeleton, outline }
 */
export function drawCat(ctx, cat, opts = {}) {
  const R = cat.rig;
  const coat = COATS[opts.coat] || COATS.tabby;
  const ow = opts.outline ?? 0.3;
  if (opts.skin !== false) drawSkin(ctx, cat, R, coat, ow);
  if (opts.skeleton) drawSkeleton(ctx, cat, R);
}

function drawSkin(ctx, cat, R, coat, ow) {
  const P = cat.pose;
  const far = [...hindShapes(R.legs.RH, 0.94), ...foreShapes(R.legs.RF, 0.94), { kind: 'poly', pts: earPts(R.head, P.earBack, false) }];
  const tail = tailShapes(R.tail);
  const torso = { kind: 'smooth', pts: torsoPts(R) };
  const main = [torso, ...neckShapes(R), ...headShapes(R.head), ...hindShapes(R.legs.LH), ...foreShapes(R.legs.LF), { kind: 'poly', pts: earPts(R.head, P.earBack, true) }];

  drawGroup(ctx, far, coat.far, coat.outline, ow);
  drawGroup(ctx, tail, coat.fill, coat.outline, ow);
  if (coat.stripe) {
    ctx.save();
    clipTo(ctx, tail);
    tailStripes(ctx, R, coat);
    ctx.restore();
  }
  drawGroup(ctx, main, coat.fill, coat.outline, ow);

  // markings & shading, clipped to the near silhouette
  ctx.save();
  clipTo(ctx, main);
  lightUnderside(ctx, R, coat);
  if (coat.stripe) bodyStripes(ctx, R, coat);
  creases(ctx, R, coat);
  ctx.restore();

  face(ctx, cat, R, coat, ow);
}

function lightUnderside(ctx, R, coat) {
  ctx.fillStyle = coat.light;
  ctx.globalAlpha = 0.3;
  const { p, a } = R.spineAt(1.06);
  const chest = local(p, a, 0.5, -6.5);
  ctx.beginPath();
  ctx.ellipse(chest.x, chest.y, 2.2, 3.6, a + 0.3, 0, Math.PI * 2);
  ctx.fill();
  const H = R.head;
  const throat = local(H.atlas, H.ang, 4.5, -2.6);
  ctx.beginPath();
  ctx.ellipse(throat.x, throat.y, 2.8, 1.6, H.ang, 0, Math.PI * 2);
  ctx.ellipse(H.muzzle.x, H.muzzle.y - 0.4, 2.0, 1.2, H.ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function bodyStripes(ctx, R, coat) {
  ctx.strokeStyle = coat.stripe;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.0;
  // flank stripes run from the topline down and slightly back
  for (let u = 0.02; u < 0.96; u += 0.085) {
    const { p, a } = R.spineAt(u);
    const len = 4 + 4 * Math.sin(Math.PI * clamp(u * 1.1, 0, 1));
    const p0 = local(p, a, 0, 2.6);
    const p1 = local(p, a, -1.4 + 0.8 * Math.sin(u * 20), -len);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo((p0.x + p1.x) / 2 + 1.0, (p0.y + p1.y) / 2, p1.x, p1.y);
    ctx.stroke();
  }
  // dorsal line
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let u = -0.1; u <= 1.02; u += 0.04) {
    const { p, a } = R.spineAt(u);
    const q = local(p, a, 0, 2.2);
    u <= -0.1 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  // leg bars
  ctx.lineWidth = 0.7;
  const bars = (a, b, n, r) => {
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const c = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      const ang = angleOf(sub(b, a)) + Math.PI / 2;
      const q0 = polar(c, r, ang), q1 = polar(c, -r, ang);
      ctx.beginPath();
      ctx.moveTo(q0.x, q0.y);
      ctx.lineTo(q1.x, q1.y);
      ctx.stroke();
    }
  };
  const H = R.legs.LH.points, F = R.legs.LF.points;
  bars(H[1], H[2], 3, 2.2);
  bars(H[0], H[1], 2, 4.5);
  bars(F[2], F[3], 3, 1.9);
  bars(F[1], F[2], 2, 3.2);
  // forehead "M" and cheek lines
  const Hd = R.head;
  ctx.lineWidth = 0.45;
  for (const [f, u] of [[2.0, 3.0], [3.0, 3.3], [4.0, 3.2]]) {
    const q0 = local(Hd.atlas, Hd.ang, f, u), q1 = local(Hd.atlas, Hd.ang, f + 0.5, u - 1.6);
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.stroke();
  }
  const c0 = local(Hd.atlas, Hd.ang, 4.4, -0.3), c1 = local(Hd.atlas, Hd.ang, 1.4, -1.0);
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function tailStripes(ctx, R, coat) {
  ctx.strokeStyle = coat.stripe;
  ctx.globalAlpha = 0.7;
  const pts = R.tail;
  for (let i = 3; i < pts.length - 1; i += 2) {
    const a = angleOf(sub(pts[i + 1], pts[i])) + Math.PI / 2;
    const q0 = polar(pts[i], 2, a), q1 = polar(pts[i], -2, a);
    ctx.lineWidth = i > pts.length - 4 ? 1.6 : 0.8;
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function creases(ctx, R, coat) {
  ctx.strokeStyle = coat.outline;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.22;
  ctx.lineCap = 'round';
  // front edge of the thigh
  const [hip, knee] = R.legs.LH.points;
  const fa = angleOf(sub(knee, hip)) + Math.PI / 2;
  const a0 = polar(hip, 4.4, fa + 0.5), a1 = polar(knee, 2.4, fa);
  ctx.beginPath();
  ctx.moveTo(a0.x, a0.y);
  ctx.quadraticCurveTo(polar(hip, 5.0, fa - 0.4).x, polar(hip, 5.0, fa - 0.4).y, a1.x, a1.y);
  ctx.stroke();
  // back edge of the upper arm / elbow
  const [, sh, el] = R.legs.LF.points;
  const ba = angleOf(sub(el, sh)) - Math.PI / 2;
  const b0 = polar(sh, 3.0, ba - 0.3), b1 = polar(el, 1.9, ba);
  ctx.beginPath();
  ctx.moveTo(b0.x, b0.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function face(ctx, cat, R, coat, ow) {
  const H = R.head, a = H.ang, P = cat.pose, E = cat.eye;
  // inner ear
  const ear = earPts(H, P.earBack, true);
  const ec = { x: (ear[0].x + ear[1].x + ear[2].x) / 3, y: (ear[0].y + ear[1].y + ear[2].y) / 3 };
  ctx.fillStyle = coat.innerEar;
  ctx.beginPath();
  ear.forEach((p, i) => {
    const q = { x: lerp(ec.x, p.x, 0.62), y: lerp(ec.y, p.y, 0.62) };
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.fill();

  // eye: almond, vertical slit pupil (dilates when hunting)
  const e = H.eye;
  const open = clamp(E.open, 0.05, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(a - 0.12);
  ctx.beginPath();
  ctx.moveTo(-1.25, 0);
  ctx.quadraticCurveTo(0, 1.25 * open, 1.25, 0.05);
  ctx.quadraticCurveTo(0, -1.0 * open, -1.25, 0);
  ctx.closePath();
  ctx.fillStyle = coat.iris;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const px = E.lookX * 0.35, py = E.lookY * 0.2;
  const pw = lerp(0.14, 0.62, P.pupil);
  ctx.fillStyle = '#0b0b0a';
  ctx.beginPath();
  ctx.ellipse(px, py, pw, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(px + 0.25, py + 0.35, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = ow * 0.9;
  ctx.strokeStyle = coat.outline;
  ctx.stroke();
  ctx.restore();

  // nose leather + mouth
  const n0 = local(H.atlas, a, 8.15, 0.45), n1 = local(H.atlas, a, 8.6, -0.5), n2 = local(H.atlas, a, 7.4, -0.3);
  ctx.fillStyle = coat.nose;
  ctx.beginPath();
  ctx.moveTo(n0.x, n0.y);
  ctx.lineTo(n1.x, n1.y);
  ctx.lineTo(n2.x, n2.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = coat.outline;
  ctx.lineWidth = 0.2;
  ctx.lineCap = 'round';
  const m0 = local(H.atlas, a, 8.1, -0.8), m1 = local(H.atlas, a, 7.6, -1.9), m2 = local(H.atlas, a, 5.6, -2.1);
  ctx.beginPath();
  ctx.moveTo(m0.x, m0.y);
  ctx.quadraticCurveTo(m1.x, m1.y, m2.x, m2.y);
  ctx.stroke();

  // whiskers: relaxed = swept back-ish, hunting = fanned forward
  ctx.strokeStyle = 'rgba(240,236,226,0.75)';
  ctx.lineWidth = 0.1;
  const root = local(H.atlas, a, 7.0, -0.9);
  const fan = lerp(deg(-12), deg(18), P.whisker);
  for (let i = 0; i < 5; i++) {
    const wa = a + fan + deg(10) - i * deg(9);
    const tip = polar(root, 6.5 - i * 0.3, wa);
    const ctl = polar(root, 3.4, wa + deg(6));
    ctx.beginPath();
    ctx.moveTo(root.x, root.y - i * 0.12);
    ctx.quadraticCurveTo(ctl.x, ctl.y, tip.x, tip.y - 0.6 - i * 0.25);
    ctx.stroke();
  }
}

// ----------------------------------------------------------------- skeleton
const BONE = '#ece5d2';
const JOINT = '#e0705a';

function bone(ctx, a, b, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function dot(ctx, p, r, c = JOINT) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkeleton(ctx, cat, R) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BONE;
  ctx.fillStyle = BONE;
  const V = A.vertebrae;

  // ribs (13 thoracic): hang from the front 13/20 of the thoraco-lumbar spine
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.32;
  const tl = V.thoracic + V.lumbar;
  for (let i = 0; i < V.thoracic; i++) {
    const u = 1 - (i + 0.5) / tl;
    const { p, a } = R.spineAt(u);
    const depth = lerp(8.2, 6.0, i / V.thoracic) * (i < 9 ? 1 : 0.8);
    const end = local(p, a, -3.2 - i * 0.12, -depth);
    const ctl = local(p, a, -0.6, -depth * 0.6);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(ctl.x, ctl.y, end.x, end.y);
    ctx.stroke();
  }
  // sternum
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const u = 1.02 - i * 0.045;
    const { p, a } = R.spineAt(u);
    const q = local(p, a, -2.8, -lerp(8.6, 8.0, i / 8));
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // vertebral column: thoracic + lumbar bodies along the arc
  for (let i = 0; i < tl; i++) {
    const u = 1 - (i + 0.5) / tl;
    const { p, a } = R.spineAt(u);
    const lumbar = i >= V.thoracic;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    ctx.fillRect(-0.55, -0.45, 1.1, 0.9);
    ctx.fillRect(-0.15, 0, 0.3, lumbar ? 1.4 : 2.0); // spinous process
    ctx.restore();
  }
  // cervical
  const nb = R.neckBase, at = R.atlas;
  for (let i = 0; i < V.cervical; i++) {
    const t = (i + 0.5) / V.cervical;
    dot(ctx, { x: lerp(nb.x, at.x, t), y: lerp(nb.y, at.y, t) }, 0.5, BONE);
  }
  // caudal
  R.tail.forEach((p, i) => i && dot(ctx, p, lerp(0.45, 0.2, i / R.tail.length), BONE));

  // pelvis: ilium wing → acetabulum → ischium
  const ilium = local(R.S, R.aS, 1.2, 0.3);
  const isch = local(R.hip, R.aS, -A.pelvis.ischium, 0.4);
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(ilium.x, ilium.y);
  ctx.lineTo(R.hip.x, R.hip.y);
  ctx.lineTo(isch.x, isch.y);
  ctx.stroke();

  // skull (simplified): cranium + zygomatic arch + jaw
  const H = R.head;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.ellipse(H.cranium.x, H.cranium.y, 3.4, 2.7, H.ang, 0, Math.PI * 2);
  ctx.stroke();
  const sn = local(H.atlas, H.ang, 8.0, -0.4), jaw = local(H.atlas, H.ang, 7.6, -1.8), ang = local(H.atlas, H.ang, 2.4, -1.6);
  ctx.beginPath();
  ctx.moveTo(local(H.atlas, H.ang, 4.6, 1.6).x, local(H.atlas, H.ang, 4.6, 1.6).y);
  ctx.lineTo(sn.x, sn.y);
  ctx.lineTo(jaw.x, jaw.y);
  ctx.lineTo(ang.x, ang.y);
  ctx.stroke();
  dot(ctx, H.eye, 0.9, 'rgba(236,229,210,0.25)');

  // limbs (far side dimmer)
  for (const id of ['RH', 'RF', 'LH', 'LF']) {
    const L = R.legs[id];
    const near = id[0] === 'L';
    ctx.globalAlpha = near ? 1 : 0.45;
    const p = L.points;
    if (id[1] === 'H') {
      bone(ctx, p[0], p[1], 0.75); // femur
      bone(ctx, p[1], p[2], 0.6); // tibia
      bone(ctx, p[2], L.heel, 0.55); // calcaneus
      bone(ctx, p[2], p[3], 0.45); // metatarsus
      bone(ctx, p[3], p[4], 0.3); // digits
    } else {
      // scapula as a blade
      const along = angleOf(sub(p[1], p[0])) + Math.PI / 2;
      ctx.beginPath();
      const q0 = polar(p[0], 1.8, along), q1 = polar(p[0], -1.8, along);
      ctx.moveTo(q0.x, q0.y);
      ctx.lineTo(p[1].x, p[1].y);
      ctx.lineTo(q1.x, q1.y);
      ctx.closePath();
      ctx.globalAlpha *= 0.8;
      ctx.fillStyle = BONE;
      ctx.fill();
      ctx.globalAlpha = near ? 1 : 0.45;
      bone(ctx, p[1], p[2], 0.7); // humerus
      bone(ctx, p[2], p[3], 0.55); // radius/ulna
      bone(ctx, p[3], p[4], 0.4); // carpus+metacarpus
      bone(ctx, p[4], p[5], 0.3);
    }
    for (let i = 1; i < p.length - 1; i++) dot(ctx, p[i], 0.42);
  }
  ctx.globalAlpha = 1;
  dot(ctx, R.hip, 0.55);
  dot(ctx, R.S, 0.4, '#8fc79a');
  dot(ctx, R.W, 0.4, '#8fc79a');
  ctx.restore();
}

/** Screen-space labels for the near-side joints. toScreen maps world→px. */
export function drawJointLabels(ctx, cat, toScreen, angles) {
  const R = cat.rig, H = R.legs.LH.points, F = R.legs.LF.points;
  const items = [
    ['hip', R.hip, angles.hip, -1],
    ['stifle', H[1], angles.stifle, 1],
    ['hock', H[2], angles.hock, -1],
    ['shoulder', F[1], angles.shoulder, 1],
    ['elbow', F[2], angles.elbow, -1],
    ['carpus', F[3], angles.carpus, 1],
  ];
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (const [name, p, val, side] of items) {
    const s = toScreen(p);
    const tx = s.x + side * 14;
    ctx.strokeStyle = 'rgba(232,226,208,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tx, s.y - 10);
    ctx.stroke();
    const text = `${name} ${val.toFixed(0)}°`;
    ctx.textAlign = side > 0 ? 'left' : 'right';
    ctx.fillStyle = 'rgba(13,15,14,0.75)';
    const w = ctx.measureText(text).width;
    ctx.fillRect(side > 0 ? tx + 2 : tx - w - 6, s.y - 18, w + 4, 15);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillText(text, side > 0 ? tx + 4 : tx - 4, s.y - 10);
  }
}
