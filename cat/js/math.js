// Small 2D math kit. World units are centimetres, y points UP, angles are radians.
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap01 = (x) => x - Math.floor(x);
/** Wrap a cycle fraction into [-0.5, 0.5). */
export const wrapHalf = (x) => x - Math.floor(x + 0.5);
/** Shortest signed angle from a to b. */
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const v2 = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dir = (ang) => ({ x: Math.cos(ang), y: Math.sin(ang) });
export const angleOf = (a) => Math.atan2(a.y, a.x);
export const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
/** p + d1*dir(a1) — a point offset along an angle. */
export const polar = (p, r, ang) => ({ x: p.x + r * Math.cos(ang), y: p.y + r * Math.sin(ang) });
/** Point expressed in a local frame (origin o, forward angle a): fwd along a, up along a+90°. */
export const local = (o, a, fwd, up) => ({
  x: o.x + fwd * Math.cos(a) - up * Math.sin(a),
  y: o.y + fwd * Math.sin(a) + up * Math.cos(a),
});

/** Frame-rate independent exponential approach. rate is 1/s. */
export const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);

/**
 * Implicit (unconditionally stable) critically-damped spring.
 * s = {x, v}; omega = natural frequency (rad/s).
 */
export function springStep(s, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const x = (f * s.x + dt * s.v + hhoo * target) * detInv;
  const v = (s.v + hoo * (target - s.x)) * detInv;
  s.x = x;
  s.v = v;
  return s;
}

/** Interior angle at joint b formed by a-b-c, in degrees (180 = straight). */
export function jointAngle(a, b, c) {
  const u = sub(a, b), w = sub(c, b);
  const cos = (u.x * w.x + u.y * w.y) / (len(u) * len(w) || 1);
  return toDeg(Math.acos(clamp(cos, -1, 1)));
}
